import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public and staff Standard journeys expose a one-guest lower bound", async () => {
  const [page, staffRoute] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/admin/bookings/route.ts"),
  ]);

  assert.match(page, /Choose 1 to 19 guests/);
  assert.match(page, /Math\.max\(1, partySize - 1\)/);
  assert.match(page, /partySize === 1 \? "Guest" : "Guests"/);
  assert.match(staffRoute, /rawBooking\.partySize < 1/);
});

test("authoritative booking and waitlist boundaries accept only positive whole guests", async () => {
  const [schema, bookingValidation, waitlistRoute] = await Promise.all([
    source("../../supabase/migrations/202606170001_phase_1_core_schema.sql"),
    source("./bookingCreateValidation.ts"),
    source("../app/api/waitlist/route.ts"),
  ]);

  assert.match(schema, /guest_count integer not null check \(guest_count > 0\)/);
  assert.match(
    bookingValidation,
    /!Number\.isInteger\(input\.partySize\) \|\| input\.partySize < 1/,
  );
  assert.match(waitlistRoute, /!Number\.isInteger\(entry\.partySize\)/);
  assert.match(waitlistRoute, /entry\.partySize < 1/);
});

test("per-guest ticket reconciliation supports one current identity", async () => {
  const [increaseMigration, reductionMigration] = await Promise.all([
    source("../../supabase/migrations/20261004190000_per_guest_ticket_deficit_integrity.sql"),
    source("../../supabase/migrations/20261004150000_per_guest_ticket_population_integrity.sql"),
  ]);

  assert.match(increaseMigration, /generate_series\(1, v_booking\.guest_count\)/);
  assert.match(increaseMigration, /new\.guest_count > old\.guest_count/);
  assert.match(reductionMigration, /new\.guest_count < old\.guest_count/);
});

test("table occupancy and show-status protections remain independent", async () => {
  const [floorAllocator, statusRules] = await Promise.all([
    source("./floorAllocator.ts"),
    source("./publicShowSales.ts"),
  ]);

  assert.match(floorAllocator, /pax < minimumOccupancy/);
  assert.match(statusRules, /return status === "active"/);
  assert.match(statusRules, /status === "special_event"/);
});

test("reporting sources do not exclude one-person bookings", async () => {
  const sources = await Promise.all([
    source("./supabase/dailyAnalyticsServer.ts"),
    source("./supabase/managementAnalyticsServer.ts"),
    source("./exports/tablePlan.ts"),
    source("./boxOfficeFinancialReport.ts"),
  ]);

  for (const reportingSource of sources) {
    assert.doesNotMatch(reportingSource, /guest_count\s*(?:>=|>)\s*1/);
  }
});
