import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSource = () => readFile(
  new URL(
    "../../supabase/migrations/20261028235959_phase_54_13_table_capacity_correction.sql",
    import.meta.url,
  ),
  "utf8",
);
const panelSource = () => readFile(
  new URL("../app/admin/AutomaticTableAssignmentPanel.tsx", import.meta.url),
  "utf8",
);

test("missing permanent capacities inherit only exact approved master values", async () => {
  const migration = await migrationSource();
  assert.match(migration, /approved\.table_code = table_row\.table_code/);
  assert.match(migration, /approved\.zone_id =/);
  assert.match(migration, /capacity = candidate\.maximum_guests/);
  assert.match(migration, /not table_row\.capacity_configured/);
  assert.match(migration, /table_row\.capacity is null/);
  assert.match(migration, /table_row\.booking_id is null/);
  assert.match(migration, /not table_row\.is_override/);
  assert.match(migration, /cardinality\(table_row\.merged_from\), 0\) = 0/);
});

test("capacity correction protects configured arrangements and commercial data", async () => {
  const migration = await migrationSource();
  assert.match(migration, /PHASE_54_13_PROTECTED_TABLE_MUTATED/);
  assert.doesNotMatch(migration, /update public\.(shows|payments|tickets)/i);
  assert.doesNotMatch(migration, /delete from public\.(bookings|show_tables)/i);
  assert.doesNotMatch(migration, /threshold_override_active\s*=\s*true/i);
});

test("the affected queue is re-evaluated through the existing safe allocator", async () => {
  const migration = await migrationSource();
  assert.match(migration, /try_hybrid_table_assignment_phase_54_11/);
  assert.match(migration, /PHASE_54_13_ASSIGNMENT_RESULT_INVALID/);
  assert.match(migration, /existing_assignment_queue/);
});

test("Box Office wording is plain and keeps ticket sales separate", async () => {
  const panel = await panelSource();
  assert.match(panel, /Automatic Table Assignment/);
  assert.match(panel, /of 415 guests booked/);
  assert.match(panel, /bookings still need tables/);
  assert.match(panel, /tables available/);
  assert.match(panel, /Ticket sales stay open/);
  assert.match(panel, /Pause Auto Assignment/);
  assert.match(panel, /Resume Auto Assignment/);
  assert.match(panel, /Save Limit/);
  assert.doesNotMatch(panel, /available table units|approved physical layout|Existing seating is preserved|Manual assignment remains active/i);
});
