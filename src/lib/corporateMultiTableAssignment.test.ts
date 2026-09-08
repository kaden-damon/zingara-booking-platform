import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildZoneFloorCapacityPlan } from "./corporateFloorPlanning.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260908160000_phase_41_1h_corporate_multi_table_assignment.sql",
    import.meta.url,
  ),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
  "utf8",
);
const bookingsRoute = readFileSync(
  new URL("../app/api/admin/bookings/route.ts", import.meta.url),
  "utf8",
);
const adminPage = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);

test("Megan's current ten-table suggestion is an exact 65-seat assignment", () => {
  const capacities = [6, 6, 6, 6, 6, 7, 7, 7, 7, 7];
  const tableCodes = ["1", "2", "3", "4", "5", "31", "32", "33", "34", "35"];
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 65,
    allowedTemporaryCapacities: [6, 7],
    availableTables: capacities.map((capacity, index) => ({
      capacity,
      id: `table-${tableCodes[index]}`,
      kind: "physical" as const,
      tableCode: tableCodes[index],
    })),
    capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 0,
    queuedBookings: [
      { id: "megan", isCorporate: true, pax: 65, reference: "ZNG-98R23K" },
    ],
    zoneCapacity: 138,
    zoneId: "royal-booths",
  });

  assert.deepEqual(
    [...(plan.bookingPlans[0]?.existingTableCodes ?? [])].sort(
      (left, right) => Number(left) - Number(right),
    ),
    tableCodes,
  );
  assert.equal(plan.bookingPlans[0]?.existingTableIds.length, 10);
  assert.deepEqual(plan.bookingPlans[0]?.newCapacities, []);
  assert.equal(plan.bookingPlans[0]?.unresolvedReason, null);
  assert.equal(capacities.reduce((total, capacity) => total + capacity, 0), 65);
});

test("assignment RPC is service-role-only, atomic, capacity-safe, and preserves primary compatibility", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all[\s\S]*from public,anon,authenticated/);
  assert.match(migration, /COMBINED_TABLE_CAPACITY_INSUFFICIENT/);
  assert.match(migration, /TABLE_ALREADY_CLAIMED/);
  assert.match(migration, /CROSS_SHOW_TABLE_ASSIGNMENT/);
  assert.match(migration, /CROSS_ZONE_TABLE_ASSIGNMENT/);
  assert.match(migration, /FLOOR_PLAN_STALE/);
  assert.match(migration, /update public\.show_tables set booking_id=v_booking\.id/);
  assert.match(migration, /update public\.bookings set table_id=v_claimed_ids\[1\]/);
  assert.doesNotMatch(
    migration,
    /update public\.(payments|tickets|customers|communications)/i,
  );
});

test("release clears the complete claim set and returns the booking to Floor Assignment", () => {
  assert.match(
    migration,
    /update public\.show_tables set booking_id=null[\s\S]*where booking_id=v_booking\.id/,
  );
  assert.match(migration, /update public\.bookings set table_id=null/);
  assert.match(adminPage, /RELEASE COMPLETE ASSIGNMENT/);
  assert.match(adminPage, /return to Floor Assignment/);
});

test("Admin hydration and reports treat all claims as one booking", () => {
  assert.match(bookingsRoute, /table_claim_rows/);
  assert.match(bookingsRoute, /booking_id,table_code,section,capacity/);
  assert.match(adminPage, /booking pax counted once/);
  assert.match(
    adminPage,
    /Guests: booking && isPrimaryBookingTable \? booking\.partySize : 0/,
  );
  assert.match(adminPage, /Part of \{allocatedBookingTableCount\}-table assignment/);
});

test("reviewed suggestion, stale state, and duplicate submission are guarded", () => {
  assert.match(route, /JSON\.stringify\(requestedTableIds\)/);
  assert.match(route, /isExactIdempotentReplay/);
  assert.match(route, /FLOOR PLAN CHANGED - REVIEW AGAIN/);
  assert.match(adminPage, /floorAssignmentInFlightRef\.current\.has/);
  assert.match(adminPage, /ASSIGN SUGGESTED TABLES/);
  assert.match(adminPage, /CONFIRM ASSIGNMENT/);
});
