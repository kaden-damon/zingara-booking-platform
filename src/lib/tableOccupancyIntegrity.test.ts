import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20261001130000_phase_43_3_p0_table_occupancy_integrity.sql",
  import.meta.url,
);

test("database boundary validates occupancy, ownership, show, zone, and merge integrity", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /resolve_booking_table_assignment_compatibility/);
  assert.match(migration, /booking_zone_entitlement_pax/);
  assert.match(migration, /minimum_occupancy/);
  assert.match(migration, /maximum_occupancy/);
  assert.match(migration, /st\.show_id = v_booking\.show_id/);
  assert.match(migration, /ownership_valid/);
  assert.match(migration, /child\.merged_parent_id = st\.id/);
  assert.match(migration, /TABLE_OCCUPANCY_OUT_OF_RANGE/);
  assert.match(migration, /deferrable initially deferred/g);
  assert.equal((migration.match(/\nvolatile\n/g) ?? []).length, 3);
  assert.match(migration, /new\.guest_count is not distinct from old\.guest_count/);
});

test("all four guest-count workflows release newly incompatible claims", async () => {
  const migration = await readFile(migrationPath, "utf8");

  for (const workflow of [
    "reconcile_booking_guest_count_atomic",
    "reconcile_booking_guest_count_financials_atomic",
    "reconcile_legacy_booking_guest_count_financials_atomic",
    "reconcile_paid_booking_guest_reduction_atomic",
  ]) {
    assert.match(migration, new RegExp(workflow));
  }

  assert.match(migration, /booking_table_claims_fit_guest_count\(v_booking\.id, p_guest_count\)/);
  assert.match(migration, /Expected four guest-count workflows/);
  assert.doesNotMatch(
    migration,
    /(insert into|update|delete from) public\.(payments|tickets|customers|communications)/i,
  );
});

test("staff-facing assignment paths return the exact occupancy range", async () => {
  const [bookingsRoute, floorRoute] = await Promise.all([
    readFile(new URL("../app/api/admin/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(bookingsRoute, /This table requires.*guests/);
  assert.match(floorRoute, /This table requires.*guests/);
});

test("pax reduction messaging explains the automatic Floor release", async () => {
  const [modal, page] = await Promise.all([
    readFile(new URL("../app/admin/BookingReconciliationModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  ]);

  const wording =
    /Guest count updated\. The previous table no longer fits this booking, so it has been returned to Floor Assignment\./;
  assert.match(modal, wording);
  assert.match(page, wording);
});
