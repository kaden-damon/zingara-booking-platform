import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260901140000_phase_39_29c_legacy_import_capacity_exception.sql",
  import.meta.url,
);
const updateMigrationUrl = new URL(
  "../../supabase/migrations/20260902090000_phase_39_29h_legacy_capacity_updates.sql",
  import.meta.url,
);
const reassignmentMigrationUrl = new URL(
  "../../supabase/migrations/20260902093000_phase_39_29h_legacy_reassignment_updates.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

async function updateMigrationSource() {
  return readFile(updateMigrationUrl, "utf8");
}

async function reassignmentMigrationSource() {
  return readFile(reassignmentMigrationUrl, "utf8");
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

test("ordinary inserts and updates still reach the authoritative capacity guard", async () => {
  const source = await updateMigrationSource();

  assert.match(source, /v_existing_entitlement \+ v_new_contribution > v_limit/);
  assert.match(source, /ZONE_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(source, /disable trigger/i);
  assert.doesNotMatch(source, /drop trigger/i);
});

test("legacy update exception targets one transaction-scoped booking", async () => {
  const source = await updateMigrationSource();

  assert.match(source, /tg_op = 'UPDATE'/);
  assert.match(source, /historical_dineplan_update_booking_id/);
  assert.match(source, /= new\.id::text/);
  assert.match(source, /old\.booking_origin = 'data_import'/);
  assert.match(source, /old\.show_id = new\.show_id/);
  assert.match(source, /old\.table_id is not distinct from new\.table_id/);
  assert.match(source, /old\.section is not distinct from new\.section/);
});

test("legacy capacity correction is audited and service-role only", async () => {
  const source = await updateMigrationSource();

  assert.match(source, /security definer/);
  assert.match(source, /lower\(role\.name\) = 'super admin'/);
  assert.match(source, /booking\.legacy-capacity-correction/);
  assert.match(source, /from public, anon, authenticated/);
  assert.match(source, /to service_role/);
});

test("public and Admin routes cannot activate the legacy update exception", async () => {
  const [source, publicRoute, adminRoute] = await Promise.all([
    updateMigrationSource(),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/bookings/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /execute_historical_dineplan_capacity_correction/);
  assert.doesNotMatch(publicRoute, /historical_dineplan_update/);
  assert.doesNotMatch(adminRoute, /historical_dineplan_update/);
  assert.doesNotMatch(publicRoute, /execute_historical_dineplan_capacity_correction/);
  assert.doesNotMatch(adminRoute, /execute_historical_dineplan_capacity_correction/);
});

test("legacy reassignment requires exact prior state and releases only its old claim", async () => {
  const source = await reassignmentMigrationSource();

  assert.match(source, /v_booking\.show_id <> p_expected_show_id/);
  assert.match(source, /v_booking\.table_id is distinct from p_expected_table_id/);
  assert.match(source, /v_booking\.section is distinct from p_expected_section/);
  assert.match(source, /where id = p_expected_table_id\s+and booking_id = v_booking\.id/);
  assert.match(source, /released_table_count/);
  assert.doesNotMatch(source, /insert into public\.show_tables/i);
});

test("ordinary show transfer remains outside the legacy correction context", async () => {
  const [source, transferMigration] = await Promise.all([
    reassignmentMigrationSource(),
    readFile(
      new URL(
        "../../supabase/migrations/20260901200000_phase_39_39_booking_show_transfer.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(source, /to service_role/);
  assert.doesNotMatch(transferMigration, /historical_dineplan_update/);
  assert.doesNotMatch(transferMigration, /execute_historical_dineplan_reassignment_correction/);
});
