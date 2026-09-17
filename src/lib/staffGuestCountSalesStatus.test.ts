import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const statusFixMigrationPath =
  "../../supabase/migrations/20260917100000_phase_41_2o_b_staff_guest_count_sales_status.sql";

test("staff guest-count amendments remove sales-status gates from both atomic paths", async () => {
  const migration = await source(statusFixMigrationPath);

  assert.match(migration, /reconcile_booking_guest_count_financials_atomic/);
  assert.match(migration, /reconcile_legacy_booking_guest_count_financials_atomic/);
  assert.match(migration, /GUEST_COUNT_SALES_STATUS_GUARD_NOT_FOUND/);
  assert.match(migration, /LEGACY_GUEST_COUNT_SALES_STATUS_GUARD_NOT_FOUND/);
  assert.match(migration, /GUEST_COUNT_SALES_STATUS_GUARD_STILL_PRESENT/);
  assert.equal(migration.match(/execute replace\(v_definition, v_guard, ''\)/g)?.length, 2);
});

test("the fix is status-model agnostic rather than a whitelist", async () => {
  const [migration, coreSchema] = await Promise.all([
    source(statusFixMigrationPath),
    source("../../supabase/migrations/202606170001_phase_1_core_schema.sql"),
  ]);
  const showStatusDefinition = coreSchema.slice(
    coreSchema.indexOf("create type show_status as enum"),
    coreSchema.indexOf("create type communication_type as enum"),
  );

  for (const status of [
    "active",
    "inactive",
    "sold_out",
    "blackout",
    "venue_closure",
    "special_event",
    "archived",
  ]) {
    assert.match(showStatusDefinition, new RegExp(`'${status}'`));
  }
  assert.doesNotMatch(migration, /status::text\s+in\s*\(/i);
  assert.doesNotMatch(migration, /status::text\s+not\s+in\s*\(/i);
});

test("booking lifecycle, permission, revision, capacity, table-fit, and financial safeguards remain authoritative", async () => {
  const [automatic, legacy, capacity] = await Promise.all([
    source("../../supabase/migrations/20260904200000_phase_39_71_guest_count_decreases.sql"),
    source("../../supabase/migrations/20260904210000_phase_39_71a_legacy_guest_increases.sql"),
    source("../../supabase/migrations/20260909150000_phase_41_1h_e_temporary_capacity_expansion.sql"),
  ]);

  for (const implementation of [automatic, legacy]) {
    assert.match(implementation, /RECONCILIATION_PERMISSION_REQUIRED/);
    assert.match(implementation, /BOOKING_REVISION_CHANGED/);
    assert.match(implementation, /BOOKING_RECONCILIATION_NOT_ALLOWED/);
    assert.match(implementation, /BOOKING_TABLE_STATE_INVALID/);
    assert.match(implementation, /v_table\.capacity < p_guest_count/);
    assert.match(implementation, /set booking_id = null/);
    assert.doesNotMatch(implementation, /amount_paid\s*=/);
  }
  assert.match(automatic, /ADDED_GUEST_FINANCIAL_BASIS_REQUIRED/);
  assert.match(legacy, /LEGACY_MANUAL_BASIS_NOT_ALLOWED/);
  assert.match(capacity, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(capacity, /booking_capacity_zone_effective_limit/);
});

test("public sales and per-zone closure guards remain insert-only and unchanged", async () => {
  const [publicAvailability, zoneSalesMigration] = await Promise.all([
    source("./supabase/publicShowAvailability.ts"),
    source("../../supabase/migrations/20260915143000_phase_41_2l_show_zone_sales_controls.sql"),
  ]);

  assert.match(publicAvailability, /show_zone_sales_controls/);
  assert.match(zoneSalesMigration, /before insert on public\.bookings/);
  assert.match(zoneSalesMigration, /PUBLIC_ZONE_SALES_CLOSED/);
  assert.match(zoneSalesMigration, /booking_origin, ''\) = 'customer_public'/);
  assert.match(zoneSalesMigration, /new\.booking_source = 'online'/);
});
