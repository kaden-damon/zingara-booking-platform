import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(
  new URL("../../supabase/migrations/20261028190000_phase_54_3_table_reconciliation_activation.sql", import.meta.url),
  "utf8",
);

test("Phase 54.3 activates only inactive future shows without booking or table decisions", async () => {
  const migration = await source();

  assert.match(migration, /v_show\.status::text <> 'inactive'/);
  assert.match(migration, /exists \(select 1 from public\.bookings booking where booking\.show_id = p_show_id\)/);
  assert.match(migration, /table_row\.booking_id is not null/);
  assert.match(migration, /table_row\.is_override/);
  assert.match(migration, /cardinality\(coalesce\(table_row\.merged_from/);
  assert.match(migration, /PHASE_54_3_EXISTING_BOOKING_SHOW_ACTIVATED/);
});

test("approved capacities populate without deleting extras or processing backlog", async () => {
  const migration = await source();

  assert.match(migration, /capacity = approved\.maximum_guests/);
  assert.match(migration, /status = 'available'/);
  assert.match(migration, /not exists \([\s\S]*table_row\.table_code = approved\.table_code/);
  assert.doesNotMatch(migration, /delete from public\.show_tables/i);
  assert.doesNotMatch(migration, /update public\.bookings/i);
  assert.doesNotMatch(migration, /try_automatic_table_assignment\(/i);
});

test("manual capacities, assignments, overrides and merged tables remain fail-closed", async () => {
  const migration = await source();

  assert.match(migration, /PERFORMANCE_SPECIFIC_CAPACITY_PRESERVED/);
  assert.match(migration, /TABLE_ZONE_CONFLICT_PRESERVED/);
  assert.match(migration, /OPERATIONAL_TABLE_DECISIONS_PRESERVED/);
  assert.match(migration, /venue_table\.id is null[\s\S]*table_row\.capacity is distinct from venue_table\.capacity/);
});

test("rollout keeps the approved threshold and reminder defaults", async () => {
  const migration = await source();

  assert.match(migration, /default_pause_threshold_percent = 70/);
  assert.match(migration, /review_reminder_days = 10/);
  assert.match(migration, /PHASE_54_3_MASTER_RECONCILIATION/);
  assert.match(migration, /automatic_assignment_enabled = true/);
});
