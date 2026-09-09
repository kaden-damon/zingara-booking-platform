import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public seating and preview share zone-level multi-table eligibility", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /supportsMultiTableBookingFulfilment\(option\.id\)/);
  assert.match(page, /From 4 Guests · Larger Groups Use Multiple Booths/);
  assert.doesNotMatch(page, /4–8 Guests/);
  assert.match(page, /availability\.isAvailable/);
});

test("public create preserves Corporate routing and accepts eligible Standard booth groups", async () => {
  const route = await source("../app/api/bookings/route.ts");

  assert.match(route, /booking\.source === "online" && isCorporatePartySize/);
  assert.match(route, /isStandardBookingZoneGuestCountAllowed/);
  assert.match(route, /reserve_public_booking_entitlement/);
  assert.match(route, /capacityScope: isTrustedStaff \? "operational" : "base"/);
  assert.doesNotMatch(route, /Private Booths are available for Standard bookings of 4 to 8 guests/);
});

test("public reservation creates one booking entitlement without choosing tables", async () => {
  const bookingStore = await source("./supabase/bookings.ts");
  const route = await source("../app/api/bookings/route.ts");

  assert.match(bookingStore, /table_id: null/);
  assert.match(bookingStore, /const floorAssignmentRequired = !row\.table_id/);
  assert.match(route, /reservePublicBookingAtomically/);
  assert.doesNotMatch(
    route.slice(route.indexOf("async function reservePublicBookingAtomically"), route.indexOf("async function", route.indexOf("async function reservePublicBookingAtomically") + 20)),
    /insert\([^)]*bookings[^)]*\).*insert\([^)]*bookings/is,
  );
});

test("individual booth capacity stays 4 to 6 and entitlement pax is counted once", async () => {
  const physicalTables = await source("./physicalTables.ts");
  const adminPage = await source("../app/admin/page.tsx");

  assert.match(
    physicalTables,
    /createDefinitions\(\s*"royal-booths",[\s\S]*?\n\s*4,\s*\n\s*6,\s*\n\s*6,/,
  );
  assert.match(adminPage, /booking pax counted once/);
  assert.match(
    adminPage,
    /Guests: booking && isPrimaryBookingTable \? booking\.partySize : 0/,
  );
});

test("multi-table assignment extension remains atomic and service-role only", async () => {
  const migration = await source(
    "../../supabase/migrations/20260909180000_phase_41_1w_standard_multi_table_assignment.sql",
  );
  const baseMigration = await source(
    "../../supabase/migrations/20260909110000_phase_41_1p_multi_zone_corporate_entitlements.sql",
  );

  assert.match(migration, /Expected Corporate-only multi-table assignment guard/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.match(baseMigration, /COMBINED_TABLE_CAPACITY_INSUFFICIENT/);
  assert.match(baseMigration, /update public\.show_tables set booking_id=v_booking\.id/);
  assert.match(baseMigration, /update public\.bookings set table_id=case/);
  assert.doesNotMatch(
    `${migration}\n${baseMigration}`,
    /update public\.(payments|tickets|customers|communications)/i,
  );
});

test("Floor UI offers reviewed atomic multi-table assignment to Standard bookings", async () => {
  const page = await source("../app/admin/page.tsx");
  const route = await source("../app/api/admin/floor-capacity-plan/route.ts");

  assert.match(page, /usesReviewedMultiTableAssignment/);
  assert.match(page, /ASSIGN SUGGESTED TABLES/);
  assert.match(page, /reviewCorporateTableAssignment/);
  assert.match(route, /assign_corporate_booking_zone_tables_atomic/);
  assert.match(route, /requestedTableIds/);
  assert.match(route, /FLOOR PLAN CHANGED - REVIEW AGAIN/);
});
