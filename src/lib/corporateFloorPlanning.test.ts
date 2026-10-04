import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildZoneFloorCapacityPlan,
  findTemporaryCapacityMix,
  getCorporateZoneAvailability,
} from "./corporateFloorPlanning.ts";

test("Megan's 65-pax Corporate booking is eligible for Private Booths by zone capacity", () => {
  const availability = getCorporateZoneAvailability({
    activeBookings: [
      {
        bookingId: "megan",
        pax: 65,
        zoneId: "middle-ring",
      },
    ],
    bookingId: "megan",
    bookingPax: 65,
    zoneCapacities: {
      "golden-circle": 148,
      "middle-ring": 146,
      "royal-balcony": 40,
      "royal-booths": 138,
    },
  });

  const privateBooths = availability.find(
    (zone) => zone.zoneId === "royal-booths",
  );
  assert.deepEqual(privateBooths, {
    bookedPaxExcludingBooking: 0,
    eligible: true,
    remainingPax: 138,
    zoneCapacity: 138,
    zoneId: "royal-booths",
  });
});

test("zone capacity rejects an ineligible Corporate transfer without table heuristics", () => {
  const availability = getCorporateZoneAvailability({
    activeBookings: [
      { bookingId: "other", pax: 80, zoneId: "royal-booths" },
      { bookingId: "megan", pax: 65, zoneId: "middle-ring" },
    ],
    bookingId: "megan",
    bookingPax: 65,
    zoneCapacities: {
      "golden-circle": 148,
      "middle-ring": 146,
      "royal-balcony": 40,
      "royal-booths": 138,
    },
  });

  assert.equal(
    availability.find((zone) => zone.zoneId === "royal-booths")?.eligible,
    false,
  );
});

test("temporary planning prefers exact fit, then minimum tables", () => {
  assert.deepEqual(findTemporaryCapacityMix(65, [6, 7]), {
    capacities: [7, 7, 7, 7, 7, 6, 6, 6, 6, 6],
    totalCapacity: 65,
    unusedSeats: 0,
  });
  assert.deepEqual(findTemporaryCapacityMix(13, [6, 7]), {
    capacities: [7, 6],
    totalCapacity: 13,
    unusedSeats: 0,
  });
});

test("multi-table zones plan combined tables for Standard and Corporate bookings", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 73,
    allowedTemporaryCapacities: [6, 7],
    availableTables: [
      { capacity: 6, id: "a", kind: "physical", tableCode: "A" },
      { capacity: 7, id: "b", kind: "physical", tableCode: "B" },
    ],
    capacityRequiredPhysicalTables: 2,
    claimedReservedCapacity: 0,
    queuedBookings: [
      { id: "standard", isCorporate: false, pax: 12, reference: "STD-12" },
      { id: "corporate", isCorporate: true, pax: 65, reference: "CORP-65" },
    ],
    zoneCapacity: 138,
    zoneId: "royal-booths",
  });

  const standard = plan.bookingPlans.find(
    (booking) => booking.bookingReference === "STD-12",
  );
  const corporate = plan.bookingPlans.find(
    (booking) => booking.bookingReference === "CORP-65",
  );
  assert.equal(standard?.unresolvedReason, null);
  assert.deepEqual(standard?.existingTableCodes, ["A", "B"]);
  assert.equal(standard?.isCorporate, false);
  assert.equal(corporate?.unresolvedReason, null);
  assert.equal(
    (corporate?.existingTableCodes.length ?? 0) +
      (corporate?.newCapacities.length ?? 0) >
      1,
    true,
  );
  assert.equal(plan.capacityRequiredPhysicalTables, 2);
});

test("reviewed planning resolves 146/150 capacity without double-counting queued pax", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 150,
    allowedTemporaryCapacities: [2],
    availableTables: [],
    capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 144,
    queuedBookings: ["A", "B", "C"].map((reference) => ({
      id: reference,
      isCorporate: false,
      pax: 2,
      reference,
    })),
    zoneCapacity: 146,
    zoneId: "middle-ring",
  });

  assert.equal(plan.activeEntitlementPax, 150);
  assert.equal(plan.queuedPax, 6);
  assert.equal(plan.newCapacity, 6);
  assert.deepEqual(
    plan.bookingPlans.flatMap((booking) => booking.newCapacities),
    [2, 2, 2],
  );
  assert.equal(plan.zoneCapacityInsufficient, false);
  assert.equal(plan.bookingPlans.every((booking) => !booking.unresolvedReason), true);
});

test("18-pax Standard Private Booth booking is fulfilled by three 6-seat booths", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 18,
    allowedTemporaryCapacities: [6],
    availableTables: ["1", "2", "3"].map((tableCode) => ({
      capacity: 6,
      id: `booth-${tableCode}`,
      kind: "physical" as const,
      tableCode,
    })),
    capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 0,
    queuedBookings: [
      { id: "standard-18", isCorporate: false, pax: 18, reference: "STD-18" },
    ],
    zoneCapacity: 138,
    zoneId: "royal-booths",
  });

  assert.deepEqual(plan.bookingPlans[0]?.existingTableCodes, ["1", "2", "3"]);
  assert.deepEqual(plan.bookingPlans[0]?.newCapacities, []);
  assert.equal(plan.bookingPlans[0]?.unresolvedReason, null);
  assert.equal(plan.queuedPax, 18);
});

test("existing temporary tables remain assignable even when their size is not approved for new creation", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 65,
    allowedTemporaryCapacities: [6, 7],
    availableTables: [
      { capacity: 65, id: "outlier", kind: "temporary", tableCode: "36" },
    ],
    capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 0,
    queuedBookings: [
      { id: "megan", isCorporate: true, pax: 65, reference: "ZNG-98R23K" },
    ],
    zoneCapacity: 138,
    zoneId: "royal-booths",
  });

  assert.deepEqual(plan.bookingPlans[0]?.existingTableCodes, ["36"]);
  assert.deepEqual(plan.bookingPlans[0]?.newCapacities, []);
});

test("reviewed table mixes enforce the combined minimum occupancy", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 2,
    allowedTemporaryCapacities: [2, 6],
    availableTables: [
      {
        capacity: 6,
        id: "permanent",
        kind: "physical",
        minimumOccupancy: 4,
        tableCode: "12",
      },
      {
        capacity: 2,
        id: "temporary",
        kind: "temporary",
        minimumOccupancy: 1,
        tableCode: "TEMP-2",
      },
    ],
    capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 0,
    queuedBookings: [
      { id: "two-pax", isCorporate: false, pax: 2, reference: "STD-2" },
    ],
    zoneCapacity: 138,
    zoneId: "royal-booths",
  });

  assert.deepEqual(plan.bookingPlans[0]?.existingTableCodes, ["TEMP-2"]);
  assert.deepEqual(plan.bookingPlans[0]?.newCapacities, []);
});

test("a unique 23-seat temporary table participates in a valid large-group mix", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 25,
    allowedTemporaryCapacities: [8, 12],
    availableTables: [
      {
        capacity: 12,
        id: "physical-401",
        kind: "physical",
        minimumOccupancy: 8,
        tableCode: "401",
      },
      {
        capacity: 23,
        id: "temporary-506",
        kind: "temporary",
        minimumOccupancy: 1,
        tableCode: "506",
      },
    ],
    capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 0,
    queuedBookings: [
      { id: "andy", isCorporate: true, pax: 25, reference: "ZNG-VPU56U" },
    ],
    zoneCapacity: 148,
    zoneId: "golden-circle",
  });

  assert.deepEqual(plan.bookingPlans[0]?.existingTableCodes, ["401", "506"]);
  assert.deepEqual(plan.bookingPlans[0]?.newCapacities, []);
  assert.equal(plan.bookingPlans[0]?.unresolvedReason, null);
});

test("migration keeps Corporate zone transfer financial state immutable and service-role only", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260908150000_phase_41_1g_corporate_zone_floor_planning.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /booking_origin <> 'corporate'/);
  assert.match(migration, /booking_source <> 'corporate-direct'/);
  assert.match(migration, /booking_status::text in \('new', 'confirmed', 'pending_payment', 'checked_in'\)/);
  assert.match(migration, /set section = v_target_section,\s+table_id = null/s);
  assert.doesNotMatch(
    migration,
    /set[^;]*(total_amount|amount_paid|balance_outstanding|payment_status)/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.transfer_corporate_booking_zone_atomic[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.transfer_corporate_booking_zone_atomic[\s\S]*to service_role/,
  );
  assert.match(migration, /FLOOR_PLAN_STALE/);
});

test("Admin routes require authoritative permissions and reviewed creation", () => {
  const bookingRoute = readFileSync(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const planRoute = readFileSync(
    new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(bookingRoute, /requireActiveStaff\(request\)/);
  assert.match(bookingRoute, /includes\("bookings:manage"\)/);
  assert.match(planRoute, /includes\("tables:manage"\)/);
  assert.match(planRoute, /body\.confirmCreate !== true/);
  assert.match(planRoute, /FLOOR PLAN CHANGED - REVIEW AGAIN/);
});

test("Booking Details exposes separate Corporate zone and table controls", () => {
  const adminPage = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const entitlementEditor = readFileSync(
    new URL("../app/admin/CorporateZoneEntitlementEditor.tsx", import.meta.url),
    "utf8",
  );

  assert.match(entitlementEditor, /Seating Zones/);
  assert.match(adminPage, /Table \/ seating/);
  assert.match(entitlementEditor, /SAVE SEATING ALLOCATION/);
  assert.match(entitlementEditor, /SAVING\.\.\./);
  assert.match(entitlementEditor, /SAVED ✓/);
  assert.match(adminPage, /Find tables/);
  assert.match(adminPage, /REVIEW & CREATE/);
  assert.match(adminPage, /CAPACITY REQUIRED/i);
});
