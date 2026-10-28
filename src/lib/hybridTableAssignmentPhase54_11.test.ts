import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(
  new URL(
    "../../supabase/migrations/20261028235955_phase_54_11_hybrid_automatic_table_assignment.sql",
    import.meta.url,
  ),
  "utf8",
);

test("hybrid assignment validates table units instead of adopting the whole layout", async () => {
  const migration = await source();
  assert.match(migration, /resolve_hybrid_table_minimum_occupancy/);
  assert.match(migration, /approved\.table_code = v_table\.table_code/);
  assert.match(migration, /availability_scope::text = 'operational'/);
  assert.match(migration, /cardinality\(coalesce\(v_table\.merged_from/);
  assert.doesNotMatch(migration, /set[\s\S]{0,80}adoption_status\s*=\s*'adopted'/i);
});

test("hybrid assignment preserves thresholds and requires real override evidence", async () => {
  const migration = await source();
  assert.match(migration, /v_occupancy_percent >= v_threshold/);
  assert.match(migration, /THRESHOLD_APPROVAL_REQUIRED/);
  assert.match(migration, /show\.automatic-table-assignment-resume/);
  assert.match(migration, /PHASE_54_11_ASSIGNMENT_CONTROL_MUTATED/);
  assert.doesNotMatch(migration, /threshold_override_active\s*=\s*true/i);
});

test("hybrid assignment is atomic, minimum-safe and preserves existing claims", async () => {
  const migration = await source();
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update of table_row skip locked/);
  assert.match(migration, /v_candidate_minimum[\s\S]*<= v_booking\.guest_count/);
  assert.match(migration, /resolve_booking_table_assignment_compatibility/);
  assert.match(migration, /PHASE_54_11_EXISTING_ASSIGNMENT_MUTATED/);
  assert.doesNotMatch(migration, /delete from public\.(bookings|show_tables)/i);
});

test("Buyouts and multi-zone bookings remain manual", async () => {
  const migration = await source();
  assert.match(migration, /BUYOUT_MANUAL_PLANNING/);
  assert.match(migration, /MULTI_ZONE_MANUAL_PLANNING/);
  assert.match(migration, /corporate_buyouts/);
});
