import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getManualBookingMoveZoneCapacity } from "./bookingTableMoves.ts";
import { getCorporateTableReleasePreview } from "./corporateFloorPlanning.ts";
import {
  canApplyTemporaryCapacityMutation,
  getEffectiveOperationalZoneCapacity,
  getTemporaryOperationalCapacity,
  type OperationalCapacityTable,
} from "./operationalZoneCapacity.ts";

const showId = "show-1";

function table(
  input: Partial<OperationalCapacityTable> = {},
): OperationalCapacityTable {
  return {
    availabilityScope: "operational",
    capacityConfigured: true,
    mergedFrom: [],
    physicalTable: false,
    seatCapacity: 5,
    showId,
    status: "available",
    zoneId: "middle-ring",
    ...input,
  };
}

test("a zone without temporary tables retains base capacity", () => {
  assert.deepEqual(
    getEffectiveOperationalZoneCapacity({
      baseCapacity: 146,
      showId,
      tables: [],
      zoneId: "middle-ring",
    }),
    { baseCapacity: 146, effectiveCapacity: 146, temporaryCapacity: 0 },
  );
});

test("one active temporary table adds its configured seats", () => {
  assert.deepEqual(
    getEffectiveOperationalZoneCapacity({
      baseCapacity: 146,
      showId,
      tables: [table()],
      zoneId: "middle-ring",
    }),
    { baseCapacity: 146, effectiveCapacity: 151, temporaryCapacity: 5 },
  );
});

test("multiple valid temporary tables aggregate within one show and zone", () => {
  assert.equal(
    getTemporaryOperationalCapacity(
      [table({ seatCapacity: 5 }), table({ seatCapacity: 3 })],
      showId,
      "middle-ring",
    ),
    8,
  );
});

test("temporary capacity can improve an inherited over-capacity state incrementally", () => {
  assert.equal(
    canApplyTemporaryCapacityMutation({
      activeEntitlementPax: 150,
      currentEffectiveCapacity: 146,
      resultingEffectiveCapacity: 148,
    }),
    true,
  );
  assert.equal(
    canApplyTemporaryCapacityMutation({
      activeEntitlementPax: 150,
      currentEffectiveCapacity: 148,
      resultingEffectiveCapacity: 150,
    }),
    true,
  );
});

test("temporary capacity reductions remain blocked when they strand entitlement", () => {
  assert.equal(
    canApplyTemporaryCapacityMutation({
      activeEntitlementPax: 150,
      currentEffectiveCapacity: 150,
      resultingEffectiveCapacity: 148,
    }),
    false,
  );
  assert.equal(
    canApplyTemporaryCapacityMutation({
      activeEntitlementPax: 150,
      currentEffectiveCapacity: 148,
      resultingEffectiveCapacity: 146,
    }),
    false,
  );
});

test("disabled, unconfigured, invalid, other-show, and other-zone rows add nothing", () => {
  const rows = [
    table({ status: "disabled" }),
    table({ capacityConfigured: false }),
    table({ seatCapacity: null }),
    table({ seatCapacity: 0 }),
    table({ showId: "show-2" }),
    table({ zoneId: "golden-circle" }),
  ];

  assert.equal(
    getTemporaryOperationalCapacity(rows, showId, "middle-ring"),
    0,
  );
});

test("physical tables never inflate effective capacity", () => {
  assert.equal(
    getTemporaryOperationalCapacity(
      [table({ physicalTable: true, seatCapacity: 100 })],
      showId,
      "middle-ring",
    ),
    0,
  );
});

test("merged parents and linked children are not double-counted", () => {
  assert.equal(
    getTemporaryOperationalCapacity(
      [
        table({ mergedFrom: ["a", "b"], seatCapacity: 10 }),
        table({ mergedInto: "parent", seatCapacity: 5, status: "disabled" }),
      ],
      showId,
      "middle-ring",
    ),
    0,
  );
});

test("Dicky-equivalent move consumes valid temporary expansion", () => {
  const capacity = getEffectiveOperationalZoneCapacity({
    baseCapacity: 146,
    showId,
    tables: [table({ seatCapacity: 5 })],
    zoneId: "middle-ring",
  });

  assert.deepEqual(
    getManualBookingMoveZoneCapacity({
      bookingPax: 5,
      currentBookingPaxInTargetZone: 0,
      currentShowPaxInTargetZone: 145,
      targetZoneCapacity: capacity.effectiveCapacity,
      targetZoneIsCurrentZone: false,
    }),
    { availablePax: 6, eligible: true, resultingPax: 150 },
  );
});

test("true overflow remains rejected after temporary expansion", () => {
  assert.equal(
    getManualBookingMoveZoneCapacity({
      bookingPax: 7,
      currentBookingPaxInTargetZone: 0,
      currentShowPaxInTargetZone: 145,
      targetZoneCapacity: 151,
      targetZoneIsCurrentZone: false,
    }).eligible,
    false,
  );
});

test("database guards use effective capacity and protect public base inventory", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260909150000_phase_41_1h_e_temporary_capacity_expansion.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /booking_capacity_zone_effective_limit/);
  assert.match(migration, /booking_capacity_zone_temporary_capacity/);
  assert.match(migration, /booking_origin = 'customer_public'/);
  assert.match(migration, /booking_source = 'online'/);
  assert.match(migration, /TEMPORARY_CAPACITY_BELOW_ACTIVE_ENTITLEMENT/);
  assert.match(migration, /before insert or delete or update of/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /total_amount|amount_paid|payment_status|tickets/);

  const physicalWorkflowMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20260909151000_phase_41_1h_e_preserve_physical_table_workflow.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    physicalWorkflowMigration,
    /booking_capacity_zone_effective_limit\(new\.show_id, v_new_zone\)/,
  );
  assert.doesNotMatch(
    physicalWorkflowMigration,
    /update public\.(bookings|payments|tickets|customers|communications)/i,
  );
});

test("server consumers distinguish public base and staff operational capacity", () => {
  const bookingRoute = readFileSync(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const availabilityRoute = readFileSync(
    new URL("../app/api/shows/availability/route.ts", import.meta.url),
    "utf8",
  );
  const adminBookingRoute = readFileSync(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const floorPlanRoute = readFileSync(
    new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    bookingRoute,
    /capacityScope: isTrustedStaff \? "operational" : "base"/,
  );
  assert.doesNotMatch(availabilityRoute, /getEffectiveOperationalZoneCapacity/);
  assert.match(adminBookingRoute, /validateBookingCapacityIncrease/);
  assert.match(floorPlanRoute, /getEffectiveOperationalZoneCapacity/);
});

test("Admin exposes base, temporary, and effective capacity", () => {
  const adminPage = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(adminPage, /Effective Capacity/);
  assert.match(adminPage, /Base \{stats\.baseCapacity\}/);
  assert.match(adminPage, /Temporary \+\{stats\.temporaryCapacity\}/);
  assert.match(adminPage, /getOperationalZoneCapacity/);
});

test("temporary-table reduction errors remain staff-safe", () => {
  const route = readFileSync(
    new URL("../app/api/admin/show-tables/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /TEMPORARY_CAPACITY_BELOW_ACTIVE_ENTITLEMENT/);
  assert.match(route, /active bookings still depend on those seats/);
  assert.match(route, /cannot be lower than its assigned booking's guest count/);
});

test("database guard distinguishes directional increases from reductions", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260910143000_phase_41_1x_a_incremental_temporary_capacity_recovery.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /v_previous_effective_capacity :=/);
  assert.match(migration, /v_resulting_effective_capacity :=/);
  assert.match(
    migration,
    /v_resulting_effective_capacity <= v_previous_effective_capacity/,
  );
  assert.match(migration, /TEMPORARY_CAPACITY_BELOW_ACTIVE_ENTITLEMENT/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(
    migration,
    /update public\.(bookings|payments|tickets|customers|communications)/i,
  );
});

test("releasing a temporary-table occupant preserves its operational capacity", () => {
  const released = table({ status: "available" });

  assert.equal(
    getTemporaryOperationalCapacity([released], showId, "middle-ring"),
    5,
  );
});

test("release-table architecture clears claims without releasing zone entitlement", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260908170000_phase_41_1h_a_multi_table_floor_release.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /set booking_id = null,/);
  assert.match(migration, /when capacity_configured then 'available'/);
  assert.match(migration, /set table_id = null,/);
  assert.doesNotMatch(migration, /set[\s\S]{0,120}(section|zone_entitlements|guest_count)\s*=/i);
  assert.doesNotMatch(
    migration,
    /update public\.(payments|tickets|customers|communications)/i,
  );
});

test("single and complete multi-table release semantics remain intact", () => {
  assert.equal(
    getCorporateTableReleasePreview({
      bookingPax: 5,
      releaseTableId: "temporary",
      tableClaims: [{ capacity: 5, tableCode: "318", tableId: "temporary" }],
    })?.releaseMode,
    "complete-fallback",
  );
  assert.equal(
    getCorporateTableReleasePreview({
      bookingPax: 5,
      releaseTableId: "spare",
      tableClaims: [
        { capacity: 5, tableCode: "318", tableId: "core" },
        { capacity: 2, tableCode: "319", tableId: "spare" },
      ],
    })?.releaseMode,
    "single",
  );
});
