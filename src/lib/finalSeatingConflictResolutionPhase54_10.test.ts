import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(
  new URL(
    "../../supabase/migrations/20261028235945_phase_54_10_final_seating_conflict_resolution.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Phase 54.10 repairs only unambiguous unassigned master-table defects", async () => {
  const migration = await source();
  assert.match(migration, /unsafe_zone_conflicts = 0/);
  assert.match(migration, /unsafe_capacity_conflicts = 0/);
  assert.match(migration, /zone_capacity_conflicts = 0/);
  assert.match(migration, /table_row\.booking_id is null/);
  assert.match(migration, /not table_row\.is_override/);
  assert.match(migration, /PHASE_54_10_PROTECTED_TABLE_MUTATED/);
  assert.doesNotMatch(migration, /delete from public\.(show_tables|bookings)/i);
});

test("Phase 54.10 preserves threshold approvals and keeps held shows paused", async () => {
  const migration = await source();
  assert.match(migration, /candidate\.threshold_override_active/);
  assert.match(migration, /then 'threshold_paused'/);
  assert.match(migration, /THRESHOLD_APPROVAL_REQUIRED/);
  assert.match(migration, /PHASE_54_10_THRESHOLD_SETTING_MUTATED/);
  assert.doesNotMatch(migration, /default_pause_threshold_percent\s*=/i);
});

test("Phase 54.10 assignments reuse the atomic minimum-occupancy allocator", async () => {
  const migration = await source();
  assert.match(migration, /try_automatic_table_assignment_phase_54_5/);
  assert.match(migration, /PHASE_54_10_ASSIGNMENT_INTEGRITY_FAILED/);
  assert.match(migration, /booking\.table_id is null/);
  assert.match(migration, /table_row\.status::text = 'booked'/);
  assert.match(migration, /show\.physical-seating-conflict-reconciled/);
});
