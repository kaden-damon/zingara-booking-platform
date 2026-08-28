import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCrossZoneMoveConfirmation,
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
    targetTable: "GC-QA",
    targetZone: "Golden Circle",
  });

  assert.match(message, /CHANGE SEATING ZONE/);
  assert.match(message, /Private Booths\n\u2192 Golden Circle/);
  assert.match(message, /B2 \/ Legacy Assignment\n\u2192 GC-QA/);
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
