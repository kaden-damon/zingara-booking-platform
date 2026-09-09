import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCrossZoneMoveConfirmation,
  getManualBookingMoveZoneCapacity,
  isEligibleManualBookingMoveTarget,
  isValidMergedOperationalParent,
} from "./bookingTableMoves.ts";
import { buildInitialFloorPlan } from "./floorAllocator.ts";
import type { DemoBooking, DemoTable, SeatingZoneId } from "./zingaraDemo.ts";

const showId = "show-1";

function booking(zoneId: SeatingZoneId = "royal-booths"): DemoBooking {
  return {
    bookingDate: "2026-09-09",
    communicationHistory: [],
    createdAt: "2026-08-28T00:00:00.000Z",
    customer: { email: "qa@example.com", mobile: "", name: "QA Guest" },
    partySize: 4,
    pricePerPerson: 1_480,
    reference: "DP-TEST",
    showId,
    status: "confirmed",
    tableId: "legacy-b2",
    tableNumber: "B2",
    totalPrice: 5_920,
    zoneId,
    zoneTitle: "Private Booths",
  };
}

function table(
  id: string,
  zoneId: SeatingZoneId,
  input: Partial<DemoTable> = {},
): DemoTable {
  return {
    authoritativeId: `authoritative-${id}`,
    availabilityScope: "public",
    capacityConfigured: true,
    guestNotes: "",
    id,
    mergeable: true,
    physicalTable: true,
    seatCapacity: 4,
    showId,
    status: "available",
    tableNumber: id,
    zoneId,
    ...input,
  };
}

test("manual moves expose compatible temporary tables across zones", () => {
  const source = booking();
  const gcTemporary = table("GC-QA", "golden-circle", {
    availabilityScope: "operational",
    physicalTable: false,
  });
  const mrTemporary = table("MR-QA", "middle-ring", {
    availabilityScope: "operational",
    physicalTable: false,
  });

  assert.equal(
    isEligibleManualBookingMoveTarget(gcTemporary, source, [gcTemporary]),
    true,
  );
  assert.equal(
    isEligibleManualBookingMoveTarget(mrTemporary, source, [mrTemporary]),
    true,
  );
});

test("cross-zone move discovery enforces the authoritative zone entitlement", () => {
  assert.deepEqual(
    getManualBookingMoveZoneCapacity({
      bookingPax: 5,
      currentBookingPaxInTargetZone: 0,
      currentShowPaxInTargetZone: 145,
      targetZoneCapacity: 146,
      targetZoneIsCurrentZone: false,
    }),
    { availablePax: 1, eligible: false, resultingPax: 150 },
  );
});

test("same-zone table changes do not double-count the booking entitlement", () => {
  assert.deepEqual(
    getManualBookingMoveZoneCapacity({
      bookingPax: 5,
      currentBookingPaxInTargetZone: 5,
      currentShowPaxInTargetZone: 146,
      targetZoneCapacity: 146,
      targetZoneIsCurrentZone: true,
    }),
    { availablePax: 5, eligible: true, resultingPax: 146 },
  );
});

test("cross-zone move discovery allows an exact-fit entitlement", () => {
  assert.deepEqual(
    getManualBookingMoveZoneCapacity({
      bookingPax: 5,
      currentBookingPaxInTargetZone: 0,
      currentShowPaxInTargetZone: 141,
      targetZoneCapacity: 146,
      targetZoneIsCurrentZone: false,
    }),
    { availablePax: 5, eligible: true, resultingPax: 146 },
  );
});

test("Admin mapping preflights zone capacity and preserves the trigger race guard", () => {
  const route = readFileSync(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );

  const mappingStart = route.indexOf("async function persistPhysicalTableMapping");
  const mappingEnd = route.indexOf("async function persistCorporateZoneTransfer");
  const mappingRoute = route.slice(mappingStart, mappingEnd);

  assert.match(mappingRoute, /validateBookingCapacityIncrease/);
  assert.match(mappingRoute, /getBookingCapacityConflictResponse/);
  assert.match(route, /message\.includes\("ZONE_CAPACITY_EXCEEDED"\)/);
});

test("an unresolved imported source table does not block a valid target", () => {
  const source = booking("middle-ring");
  source.bookingOrigin = "data_import";
  source.partySize = 8;
  source.tableId = "unresolved-legacy-201";
  source.tableNumber = "201";
  const target = table("400", "golden-circle", { seatCapacity: 10 });

  assert.equal(isEligibleManualBookingMoveTarget(target, source, [target]), true);
});

test("manual moves preserve capacity, claim, show, and merged-child safeguards", () => {
  const source = booking();
  const insufficient = table("small", "golden-circle", { seatCapacity: 2 });
  const occupied = table("occupied", "golden-circle", {
    bookingReference: "OTHER",
    status: "booked",
  });
  const anotherShow = table("other-show", "golden-circle", {
    showId: "show-2",
  });
  const mergedChild = table("child", "golden-circle", {
    mergedInto: "parent",
    status: "disabled",
  });

  for (const candidate of [insufficient, occupied, anotherShow, mergedChild]) {
    assert.equal(
      isEligibleManualBookingMoveTarget(candidate, source, [candidate]),
      false,
    );
  }
});

test("same-zone physical moves and valid flat merged parents remain eligible", () => {
  const source = booking();
  const physical = table("PB-4", "royal-booths");
  const childA = table("PB-A", "royal-booths", {
    mergedInto: "PB-A+PB-B",
    status: "disabled",
  });
  const childB = table("PB-B", "royal-booths", {
    mergedInto: "PB-A+PB-B",
    status: "disabled",
  });
  const merged = table("PB-A+PB-B", "royal-booths", {
    availabilityScope: "operational",
    mergedFrom: [childA.id, childB.id],
    physicalTable: false,
    seatCapacity: 8,
  });
  const inventory = [physical, childA, childB, merged];

  assert.equal(isEligibleManualBookingMoveTarget(physical, source, inventory), true);
  assert.equal(isValidMergedOperationalParent(merged, inventory), true);
  assert.equal(isEligibleManualBookingMoveTarget(merged, source, inventory), true);
});

test("cross-zone confirmation names both zones and tables", () => {
  const message = buildCrossZoneMoveConfirmation({
    bookingName: "Danelle Bouwer",
    currentTable: "B2 / Legacy Assignment",
    currentZone: "Private Booths",
    guestCount: 4,
    showLabel: "Johannesburg \u00b7 9 September 2026 \u00b7 17:00",
    targetTable: "GC-QA",
    targetZone: "Golden Circle",
  });

  assert.match(message, /MOVE DANELLE BOUWER\?/);
  assert.match(message, /4 guests/);
  assert.match(message, /Private Booths \u00b7 B2 \/ Legacy Assignment/);
  assert.match(message, /Golden Circle \u00b7 Table GC-QA/);
  assert.match(message, /Johannesburg \u00b7 9 September 2026 \u00b7 17:00/);
  assert.match(message, /Financials:\nNo change/);
});

test("Booking Details hydrates the selected show inventory and displays pax", () => {
  const adminPage = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    adminPage,
    /getShowsWithTables\(\{\s*tableShow: detailedBooking\.showId,\s*\}\)/,
  );
  assert.match(adminPage, /Guests \u00b7 \{booking\.partySize\}/);
  assert.match(adminPage, /Seating Zone \/ Target Table/);
});

test("atomic migration changes zone and table together without financial fields", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260828160000_phase_39_18_cross_zone_table_reallocation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /update public\.bookings\s+set section = v_target_booking_section/s,
  );
  assert.match(
    migration,
    /v_mapping_result := public\.map_booking_physical_table_atomic\(/,
  );
  assert.doesNotMatch(
    migration,
    /set[^;]*(total_amount|amount_paid|balance_outstanding|payment_status)/i,
  );
});

test("the initial-floor allocator remains same-zone only", () => {
  const result = buildInitialFloorPlan({
    bookings: [
      {
        id: "booking-pb",
        pax: 4,
        reference: "DP-PB",
        showId,
        tableId: null,
        updatedAt: "2026-08-28T00:00:00.000Z",
        zone: "royal-booths",
      },
    ],
    generatedAt: "2026-08-28T00:00:00.000Z",
    showId,
    snapshotToken: "snapshot",
    tables: [
      {
        availabilityScope: "operational",
        bookingId: null,
        capacity: 4,
        capacityConfigured: true,
        id: "gc-temporary",
        isOverride: true,
        isPhysical: false,
        maximumCapacity: 4,
        mergeable: true,
        mergedFrom: [],
        mergedParentId: null,
        minimumCapacity: 4,
        showId,
        status: "available",
        tableCode: "GC-QA",
        updatedAt: "2026-08-28T00:00:00.000Z",
        zone: "golden-circle",
      },
    ],
    zoneCeilings: {
      "golden-circle": 148,
      "middle-ring": 132,
      "royal-balcony": 40,
      "royal-booths": 138,
    },
    zoneTableCeilings: {
      "golden-circle": 24,
      "middle-ring": 26,
      "royal-balcony": 4,
      "royal-booths": 23,
    },
  });

  assert.equal(result.allocations.length, 0);
  assert.equal(result.unresolved.length, 1);
});
