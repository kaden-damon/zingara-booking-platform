import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyCapacityTable,
  previewPhysicalRepresentationMutation,
  resolveZoneCapacityState,
  type CapacityBooking,
  type CapacityTable,
} from "./capacityModel.ts";

const showId = "show-1";
const zoneId = "golden-circle" as const;

function table(
  id: string,
  capacity: number | null,
  input: Partial<CapacityTable> = {},
): CapacityTable {
  return {
    availabilityScope: "public",
    capacityConfigured: capacity !== null,
    id,
    isOverride: false,
    mergedFrom: [],
    mergedInto: null,
    physicalTable: true,
    seatCapacity: capacity,
    showId,
    status: capacity === null ? "disabled" : "available",
    zoneId,
    ...input,
  };
}

function booking(
  pax: number,
  input: Partial<CapacityBooking> = {},
): CapacityBooking {
  return {
    partySize: pax,
    status: "confirmed",
    zoneId,
    ...input,
  };
}

test("one snapshot separates base, temporary, entitlement and representation", () => {
  const physical = table("physical", 12, { bookingReference: "ZNG-1", status: "booked" });
  const temporary = table("temporary", 4, {
    availabilityScope: "operational",
    isOverride: true,
    physicalTable: false,
  });
  const capacityRequired = table("required", null);
  const legacy = table("legacy", 40, {
    physicalTable: false,
    status: "available",
  });
  const state = resolveZoneCapacityState({
    baseCapacity: 20,
    bookings: [booking(11)],
    showId,
    tables: [physical, temporary, capacityRequired, legacy],
    zoneId,
  });

  assert.deepEqual(
    {
      activeEntitlementPax: state.activeEntitlementPax,
      assignableCapacity: state.assignableCapacity,
      baseCapacity: state.baseCapacity,
      baseSellableRemaining: state.baseSellableRemaining,
      capacityRequiredCount: state.capacityRequiredCount,
      effectiveOperationalCapacity: state.effectiveOperationalCapacity,
      operationalRemaining: state.operationalRemaining,
      representedPhysicalCapacity: state.representedPhysicalCapacity,
      representationHeadroom: state.representationHeadroom,
      reservedTableCapacity: state.reservedTableCapacity,
      temporaryCapacity: state.temporaryCapacity,
    },
    {
      activeEntitlementPax: 11,
      assignableCapacity: 4,
      baseCapacity: 20,
      baseSellableRemaining: 9,
      capacityRequiredCount: 1,
      effectiveOperationalCapacity: 24,
      operationalRemaining: 13,
      representedPhysicalCapacity: 12,
      representationHeadroom: 12,
      reservedTableCapacity: 12,
      temporaryCapacity: 4,
    },
  );
});

test("merged parent represents its children exactly once", () => {
  const first = table("first", 6, {
    mergedInto: "merged",
    status: "disabled",
  });
  const second = table("second", 4, {
    mergedInto: "merged",
    status: "disabled",
  });
  const merged = table("merged", 10, {
    availabilityScope: "operational",
    isOverride: true,
    mergedFrom: [first.id, second.id],
    physicalTable: false,
  });
  const tables = [first, second, merged];
  const state = resolveZoneCapacityState({
    baseCapacity: 20,
    bookings: [],
    showId,
    tables,
    zoneId,
  });
  const byId = new Map(tables.map((row) => [row.id, row]));

  assert.equal(classifyCapacityTable(first, byId), "excluded-linked-child");
  assert.equal(classifyCapacityTable(merged, byId), "merged");
  assert.equal(state.representedPhysicalCapacity, 10);
  assert.equal(state.temporaryCapacity, 0);
});

test("legacy logical and disabled rows cannot distort capacity", () => {
  const state = resolveZoneCapacityState({
    baseCapacity: 155,
    bookings: [],
    showId,
    tables: [
      table("GC1", 100, { physicalTable: false }),
      table("disabled", 50, { status: "disabled" }),
      table("other-show", 50, { showId: "show-2" }),
      table("other-zone", 50, { zoneId: "middle-ring" }),
    ],
    zoneId,
  });

  assert.equal(state.representedPhysicalCapacity, 0);
  assert.equal(state.temporaryCapacity, 0);
});

test("multi-zone entitlement is counted by zone without duplicating booking pax", () => {
  const split = booking(46, {
    zoneEntitlements: [
      { pax: 36, zoneId: "royal-booths" },
      { pax: 10, zoneId: "middle-ring" },
    ],
  });
  const middle = resolveZoneCapacityState({
    baseCapacity: 146,
    bookings: [split],
    showId,
    tables: [],
    zoneId: "middle-ring",
  });
  const booths = resolveZoneCapacityState({
    baseCapacity: 138,
    bookings: [split],
    showId,
    tables: [],
    zoneId: "royal-booths",
  });

  assert.equal(middle.activeEntitlementPax, 10);
  assert.equal(booths.activeEntitlementPax, 36);
  assert.equal(middle.activeEntitlementPax + booths.activeEntitlementPax, 46);
});

test("3 October table 601 may consume temporary operational headroom", () => {
  const state = resolveZoneCapacityState({
    baseCapacity: 155,
    bookings: [booking(154)],
    showId,
    tables: [
      table("represented", 153),
      table("temporary", 30, {
        availabilityScope: "operational",
        isOverride: true,
        physicalTable: false,
      }),
    ],
    zoneId,
  });
  const preview = previewPhysicalRepresentationMutation({
    nextTableCapacity: 4,
    state,
  });

  assert.equal(state.baseSellableRemaining, 1);
  assert.equal(state.operationalRemaining, 31);
  assert.equal(preview.projectedPhysicalRepresentation, 157);
  assert.equal(preview.effectiveOperationalCapacity, 185);
  assert.equal(preview.allowed, true);
});

test("true physical representation overflow still rejects", () => {
  const state = resolveZoneCapacityState({
    baseCapacity: 155,
    bookings: [],
    showId,
    tables: [table("represented", 183), table("temporary", 30, {
      availabilityScope: "operational",
      isOverride: true,
      physicalTable: false,
    })],
    zoneId,
  });

  assert.equal(
    previewPhysicalRepresentationMutation({ nextTableCapacity: 4, state }).allowed,
    false,
  );
});

test("temporary capacity never increases public sellable inventory", () => {
  const state = resolveZoneCapacityState({
    baseCapacity: 155,
    bookings: [booking(150)],
    showId,
    tables: [table("temporary", 30, {
      availabilityScope: "operational",
      isOverride: true,
      physicalTable: false,
    })],
    zoneId,
  });

  assert.equal(state.baseSellableRemaining, 5);
  assert.equal(state.operationalRemaining, 35);
});

test("all active capacity consumers are wired to the shared model", () => {
  const sources = [
    "../app/admin/page.tsx",
    "../app/api/admin/floor-capacity-plan/route.ts",
    "../app/api/shows/availability/route.ts",
    "./floorAllocator.ts",
    "./floorInventory.ts",
    "./operationalReporting.ts",
    "./operationalZoneCapacity.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  sources.forEach((source) => {
    assert.match(source, /capacityModel|resolveZoneCapacityState|classifyCapacityTable/);
  });
});

test("database snapshot and mutation guard share the same representation state", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260911170000_phase_41_2i_authoritative_capacity_model.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /booking_capacity_zone_state/);
  assert.match(migration, /represented_physical_capacity/);
  assert.match(migration, /effective_operational_capacity/);
  assert.match(migration, /v_projected_representation > v_current_effective_capacity/);
  assert.match(
    migration,
    /booking_capacity_zone_effective_limit[\s\S]+booking_capacity_zone_state/,
  );
  assert.match(migration, /if not v_new_physical_representation then return new/);
  assert.match(migration, /TEMPORARY_TABLE_TYPE_CHANGE_NOT_ALLOWED/);
  assert.match(migration, /booking_origin = 'customer_public'|base_sellable_remaining/);
  assert.doesNotMatch(
    migration,
    /update public\.(bookings|payments|tickets|customers|communications)/i,
  );
});

test("scenario matrix preserves capacity invariants", () => {
  const scenarios = [
    "empty show", "partially booked", "sold out", "over entitlement",
    "fully configured physical", "capacity required", "null to configured",
    "physical increase", "physical decrease", "temporary addition",
    "temporary disable", "temporary delete", "merged parent and children",
    "multiple merged units", "disabled physical", "temporary table",
    "legacy logical rows", "large multi-table booking", "multi-zone booking",
    "queue physical shortfall", "queue capacity required", "royal balcony",
    "golden circle", "middle ring", "private booths", "Cape Town",
    "Johannesburg", "active show", "sold-out show", "inactive show",
  ];

  for (const [index, name] of scenarios.entries()) {
    const baseCapacity = 40 + index;
    const state = resolveZoneCapacityState({
      baseCapacity,
      bookings: [booking(Math.min(index, baseCapacity))],
      showId,
      tables: [],
      zoneId,
    });
    assert.equal(
      state.effectiveOperationalCapacity,
      state.baseCapacity + state.temporaryCapacity,
      name,
    );
    assert.equal(
      state.baseSellableRemaining,
      Math.max(state.baseCapacity - state.activeEntitlementPax, 0),
      name,
    );
  }
});
