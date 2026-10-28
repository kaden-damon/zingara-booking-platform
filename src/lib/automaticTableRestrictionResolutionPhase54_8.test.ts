import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(
  new URL("../../supabase/migrations/20261028235900_phase_54_8_assignment_restriction_resolution.sql", import.meta.url),
  "utf8",
);

test("show availability is preserved while seating allows closed and sold-out shows", async () => {
  const migration = await source();
  assert.match(migration, /show_status in \('inactive', 'sold_out'\)/);
  assert.match(migration, /status::text in \('active', 'inactive', 'sold_out'\)/);
  assert.match(migration, /PHASE_54_8_SHOW_STATUS_MUTATED/);
  assert.doesNotMatch(migration, /update public\.shows/i);
});

test("legitimate seating restrictions remain fail-closed", async () => {
  const migration = await source();
  assert.match(migration, /occupancy_percent < analysis\.threshold_percent/);
  assert.match(migration, /structural_blockers = 0/);
  assert.match(migration, /capacity_blockers = 0/);
  assert.match(migration, /zone_capacity_blockers = 0/);
  assert.match(migration, /queue_buyouts = 0/);
  assert.match(migration, /queue_multi_zone = 0/);
  assert.match(migration, /UNSUPPORTED_SHOW_STATUS/);
});

test("existing arrangements are preserved and assignments remain atomic", async () => {
  const migration = await source();
  assert.match(migration, /phase_54_8_preserved_claims/);
  assert.match(migration, /PHASE_54_8_EXISTING_ASSIGNMENT_MUTATED/);
  assert.match(migration, /try_automatic_table_assignment_phase_54_5/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /resolve_booking_table_assignment_compatibility/);
  assert.doesNotMatch(migration, /delete from public\.(bookings|show_tables)/i);
});

test("the migration records restriction decisions and immutable assignment evidence", async () => {
  const migration = await source();
  assert.match(migration, /PHASE_54_8_ASSIGNMENT_RESTRICTION_RESOLUTION/);
  assert.match(migration, /show\.physical-assignment-restriction-resolved/);
  assert.match(migration, /showStatusPreserved/);
  assert.match(migration, /phase_54_8_assignment_results/);
  assert.match(migration, /assignedBookings/);
});
