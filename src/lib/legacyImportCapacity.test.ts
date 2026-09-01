import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260901140000_phase_39_29c_legacy_import_capacity_exception.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

test("normal booking writes retain the authoritative capacity error", async () => {
  const source = await migrationSource();

  assert.match(source, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(source, /v_existing_entitlement \+ v_new_contribution > v_limit/);
  assert.doesNotMatch(source, /disable trigger/i);
  assert.doesNotMatch(source, /drop trigger/i);
});

test("capacity exception is insert-only and requires server-set import context", async () => {
  const source = await migrationSource();

  assert.match(source, /tg_op = 'INSERT'/);
  assert.match(
    source,
    /current_setting\('zingara\.historical_dineplan_import', true\) = 'active'/,
  );
  assert.match(source, /new\.booking_origin = 'data_import'/);
  assert.match(source, /new\.table_id is null/);
});

test("wrapper requires an active Super Admin and is service-role only", async () => {
  const source = await migrationSource();

  assert.match(source, /staff\.active/);
  assert.match(source, /lower\(role\.name\) = 'super admin'/);
  assert.match(source, /from public, anon, authenticated/);
  assert.match(source, /to service_role/);
});

test("untrusted payload flags cannot activate the exception", async () => {
  const source = await migrationSource();

  assert.doesNotMatch(source, /bypass_flag|allow_overflow|capacity_bypass/);
  assert.match(source, /perform set_config\('zingara\.historical_dineplan_import', 'active', true\)/);
  assert.match(source, /perform set_config\('zingara\.historical_dineplan_import', '', true\)/);
});

test("controlled path accepts only unallocated historical Johannesburg creates", async () => {
  const source = await migrationSource();

  assert.match(source, /dineplan legacy export/);
  assert.match(source, /floor_assignment_required/);
  assert.match(source, /\^DP-JHB-\[A-F0-9\]\{12\}\$/);
  assert.match(source, /show\.venue <> 'johannesburg'/);
  assert.match(source, /show\.status::text <> 'active'/);
});

test("normal importer and public booking paths cannot open import context", async () => {
  const [migration, importRoute, bookingRoute] = await Promise.all([
    migrationSource(),
    readFile(
      new URL("../app/api/admin/data-portability/imports/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /execute_historical_dineplan_import/);
  assert.doesNotMatch(importRoute, /execute_historical_dineplan_import/);
  assert.doesNotMatch(bookingRoute, /execute_historical_dineplan_import/);
  assert.doesNotMatch(importRoute, /historical_dineplan_import/);
  assert.doesNotMatch(bookingRoute, /historical_dineplan_import/);
});
