import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261014150000_p0_dineplan_import_identity_integrity.sql", import.meta.url),
  "utf8",
);

test("Dineplan import binds one stable source identity to one booking", () => {
  assert.match(migration, /dineplan_import_identity_bindings/);
  assert.match(migration, /booking_id uuid not null unique/);
  assert.match(migration, /source_reference text not null unique/);
  assert.match(migration, /source_reference_fingerprint text not null unique/);
  assert.match(migration, /source_identity_fingerprint text not null/);
});

test("Dineplan identity conflicts fail closed before the unchecked importer", () => {
  const conflictGate = migration.indexOf("if exists (select 1 from pg_temp.dineplan_identity_conflicts)");
  const uncheckedExecution = migration.indexOf("v_result := public.execute_data_portability_import_unchecked");

  assert.ok(conflictGate > 0);
  assert.ok(uncheckedExecution > conflictGate);
  assert.match(migration, /'blocked', true/);
  assert.match(migration, /'created', 0/);
  assert.match(migration, /'updated', 0/);
  assert.match(migration, /Booking .* remains unchanged/);
});

test("conflicting imports create staff-review and immutable audit evidence", () => {
  assert.match(migration, /insert into public\.dineplan_reconciliation_actions/);
  assert.match(migration, /'review_booking'/);
  assert.match(migration, /'critical'/);
  assert.match(migration, /dineplan\.import-identity-conflict/);
  assert.match(migration, /'blocked', 'Dineplan Import'/);
});

test("the legacy unchecked importer is no longer callable by service role", () => {
  assert.match(
    migration,
    /revoke all on function public\.execute_data_portability_import_unchecked[\s\S]*service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.execute_data_portability_import\([\s\S]*to service_role/,
  );
});
