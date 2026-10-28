import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSource = () => readFile(
  new URL(
    "../../supabase/migrations/20261028235960_phase_55_complete_seating_alignment.sql",
    import.meta.url,
  ),
  "utf8",
);
const catalogueSource = () => readFile(
  new URL("./physicalTables.ts", import.meta.url),
  "utf8",
);
const configurationSource = () => readFile(
  new URL("./zingaraDemo.ts", import.meta.url),
  "utf8",
);

test("Phase 55 binds reconciliation to Richard's verified master", async () => {
  const migration = await migrationSource();
  assert.match(migration, /Table Plan Template\.xlsx/);
  assert.match(
    migration,
    /43bf6bca8d0e1094aba7f05b01cc945a992dc4c77e590750db9d3dcfcd88a5b7/,
  );
  assert.match(migration, /approved_tables[\s\S]*74/);
  assert.match(migration, /approved_capacity[\s\S]*415/);
  assert.match(migration, /MASTER_RECONCILIATION_INVALID/);
});

test("safe alignment protects assignments, merges, overrides and history", async () => {
  const migration = await migrationSource();
  assert.match(migration, /phase55_protected_tables/);
  assert.match(migration, /PHASE_55_PROTECTED_TABLE_MUTATED/);
  assert.match(migration, /table_row\.booking_id is null/);
  assert.match(migration, /not table_row\.is_override/);
  assert.match(migration, /table_row\.merged_parent_id is null/);
  assert.match(migration, /cardinality\(table_row\.merged_from\), 0\) = 0/);
  assert.match(migration, /Africa\/Johannesburg/);
  assert.doesNotMatch(migration, /delete from public\.(show_tables|bookings)/i);
  assert.doesNotMatch(migration, /update public\.(payments|tickets)/i);
});

test("the one-time threshold exemption is finite and pre-activation only", async () => {
  const migration = await migrationSource();
  assert.match(migration, /phase55_seating_reconciliation_candidates/);
  assert.match(migration, /booking\.created_at < release\.activation_timestamp/);
  assert.match(migration, /candidate\.status = 'pending'/);
  assert.match(migration, /PHASE_55_PREEXISTING_CANDIDATE_REQUIRED/);
  assert.match(migration, /process_phase55_seating_reconciliation_batch/);
  assert.match(migration, /p_limit < 1 or p_limit > 100/);
  assert.doesNotMatch(migration, /threshold_override_active\s*=\s*true/i);
});

test("future ticket capacities and table counts match the approved layout", async () => {
  const migration = await migrationSource();
  const catalogue = await catalogueSource();
  const configuration = await configurationSource();

  for (const [zone, seats, tables] of [
    ["golden-circle", 120, 23],
    ["middle-ring", 125, 24],
    ["royal-booths", 138, 23],
    ["royal-balcony", 32, 4],
  ] as const) {
    assert.match(migration, new RegExp(`\\{zonePricing,${zone},maxSeats\\}[^\\n]+${seats}`));
    assert.match(migration, new RegExp(`\\{zonePricing,${zone},maxTables\\}[^\\n]+${tables}`));
  }

  assert.match(catalogue, /\[400, 10\]/);
  assert.match(catalogue, /\[406, 10\]/);
  assert.match(catalogue, /\[506, 10\]/);
  assert.doesNotMatch(catalogue, /\b611\b|\b313\b/);
  assert.match(configuration, /"golden-circle": 120/);
  assert.match(configuration, /"middle-ring": 125/);
  assert.match(configuration, /"royal-booths": 138/);
  assert.match(configuration, /"royal-balcony": 32/);
});

test("over-capacity commitments are retained as explicit exceptions", async () => {
  const migration = await migrationSource();
  assert.match(migration, /phase55_show_zone_capacity_exceptions/);
  assert.match(migration, /active_entitlement > exposure\.capacity/);
  assert.match(migration, /Existing guest entitlements preserved/);
  assert.match(migration, /no additional base availability/i);
});
