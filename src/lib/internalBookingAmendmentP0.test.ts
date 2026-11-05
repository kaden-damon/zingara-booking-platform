import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20261105171000_p0_internal_booking_amendment_integrity.sql",
  import.meta.url,
);

test("Corporate amendments no longer depend on public show status", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /reconcile_corporate_booking_guest_count_atomic/);
  assert.match(migration, /CORPORATE_GUEST_COUNT_STATUS_GUARD_NOT_FOUND/);
  assert.match(migration, /CORPORATE_GUEST_COUNT_STATUS_GUARD_STILL_PRESENT/);
  assert.doesNotMatch(migration, /update public\.(bookings|shows|payments|tickets)/i);
});

test("proposed single-zone pax controls assignment compatibility", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /p_guest_count is not null/);
  assert.match(migration, /jsonb_array_length\(v_booking\.zone_entitlements\)/);
  assert.match(migration, /v_entitlement := p_guest_count/);
  assert.match(migration, /resolve_booking_table_assignment_compatibility/);
});

test("internal show transfers retain capacity checks while accepting blackouts", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /transfer_booking_show_atomic/);
  assert.match(
    migration,
    /''active'', ''blackout'', ''inactive'', ''sold_out'', ''special_event''/,
  );
  assert.match(migration, /BOOKING_TRANSFER_BLACKOUT_STATUS_NOT_APPLIED/);
});

test("table integrity failures have actionable staff messages", async () => {
  const errors = await readFile(
    new URL("./bookingAmendmentErrors.ts", import.meta.url),
    "utf8",
  );

  assert.match(errors, /TABLE_OCCUPANCY_OUT_OF_RANGE/);
  assert.match(errors, /Needs a Table/);
  assert.match(errors, /TABLE_ASSIGNMENT_INTEGRITY_VIOLATION/);
});
