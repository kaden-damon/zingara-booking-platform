import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Floor Queue assignment is one atomic service-role operation", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const handler = route.slice(
    route.indexOf("async function persistBookingTableAssignment"),
    route.indexOf("async function persistPhysicalTableMapping"),
  );

  assert.match(handler, /assign_unallocated_booking_table_atomic/);
  assert.match(handler, /requireActiveStaff\(request\)/);
  assert.match(handler, /rolePermissions\[role\]\.includes\("bookings:manage"\)/);
  assert.doesNotMatch(handler, /\.from\("show_tables"\)\s*\.update/s);
  assert.doesNotMatch(handler, /\.from\("bookings"\)\s*\.update/s);
});

test("atomic assignment rejects wrong show, zone, capacity, and ownership", async () => {
  const migration = await source(
    "../../supabase/migrations/20260903100000_phase_39_53_atomic_floor_assignment.sql",
  );

  assert.match(migration, /v_target\.show_id <> v_booking\.show_id/);
  assert.match(migration, /normalize_booking_capacity_zone\(v_target\.section\)/);
  assert.match(migration, /v_target\.capacity < v_booking\.guest_count/);
  assert.match(migration, /v_target\.status::text <> 'available'/);
  assert.match(migration, /v_target\.booking_id is not null/);
  assert.match(migration, /v_booking\.table_id is not null/);
});

test("atomic assignment is unavailable to browser roles", async () => {
  const migration = await source(
    "../../supabase/migrations/20260903100000_phase_39_53_atomic_floor_assignment.sql",
  );

  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all .* from anon/);
  assert.match(migration, /revoke all .* from authenticated/);
  assert.match(migration, /grant execute .* to service_role/);
});
