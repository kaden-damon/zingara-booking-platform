import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(
  new URL("../../supabase/migrations/20261028210000_phase_54_4_remaining_table_reconciliation.sql", import.meta.url),
  "utf8",
);

test("Phase 54.4 requires zero bookings and preserves operational table decisions", async () => {
  const migration = await source();

  assert.match(migration, /not exists \(select 1 from public\.bookings booking where booking\.show_id = show_row\.id\)/);
  assert.match(migration, /table_row\.booking_id is not null/);
  assert.match(migration, /table_row\.is_override/);
  assert.match(migration, /table_row\.merged_parent_id is not null/);
  assert.doesNotMatch(migration, /delete from public\.show_tables/i);
  assert.doesNotMatch(migration, /update public\.bookings/i);
});

test("automatic assignment remains blocked while a reconciled show is not active", async () => {
  const migration = await source();
  const trigger = migration.slice(migration.indexOf("create or replace function public.run_automatic_table_assignment_after_booking"));

  assert.match(trigger, /show_row\.status::text = 'active'/);
  assert.ok(
    trigger.indexOf("show_row.status::text = 'active'") <
      trigger.indexOf("perform public.try_automatic_table_assignment(new.id)"),
  );
});

test("show restrictions and the existing assignment backlog remain untouched", async () => {
  const migration = await source();

  assert.match(migration, /showStatusPreserved/);
  assert.match(migration, /PHASE_54_4_SHOW_STATUS_CHANGED/);
  assert.match(migration, /EXISTING_BOOKINGS_REQUIRE_MANUAL_RECONCILIATION/);
  assert.doesNotMatch(migration, /try_automatic_table_assignment\(booking/i);
});

test("approved capacities are populated without changing ticket-sale capacity or exports", async () => {
  const migration = await source();

  assert.match(migration, /capacity = approved\.maximum_guests/);
  assert.match(migration, /PHASE_54_4_MASTER_RECONCILIATION_INCOMPLETE/);
  assert.doesNotMatch(migration, /update public\.shows[\s\S]*capacity/i);
  assert.doesNotMatch(migration, /export/i);
});
