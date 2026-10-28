import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20261028143000_p0_missing_operational_physical_tables.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

test("missing permanent rows are copied only from the operational physical catalogue", async () => {
  const migration = await migrationSource();

  assert.match(migration, /from public\.venue_tables venue_table/);
  assert.match(migration, /where venue_table\.is_physical/);
  assert.match(migration, /on conflict \(show_id, table_code\) do nothing/);
  assert.match(migration, /venue_table\.capacity is not null/);
  assert.match(migration, /false,\s*true,\s*'public'::public\.table_availability_scope/s);
});

test("the repair is additive and never changes existing operational rows", async () => {
  const migration = await migrationSource();

  assert.doesNotMatch(migration, /delete from public\.(?:show_tables|venue_tables|shows|bookings)/i);
  assert.doesNotMatch(migration, /update public\.(?:show_tables|venue_tables|shows|bookings)/i);
  assert.doesNotMatch(migration, /physical_seating_layout_tables[\s\S]*insert/i);
  assert.doesNotMatch(migration, /show_zone_sales_controls/);
});

test("only current or future shows missing catalogue rows are backfilled", async () => {
  const migration = await migrationSource();

  assert.match(migration, /show\.date >= current_date/);
  assert.match(migration, /from public\.venue_tables venue_table[\s\S]*not exists \([\s\S]*show_table\.show_id = show\.id[\s\S]*show_table\.table_code = venue_table\.table_code[\s\S]*show_table\.is_physical/s);
  assert.match(migration, /where repaired\.inserted_physical_rows > 0/);
  assert.match(migration, /show_tables\.permanent-rows-restored/);
  assert.match(migration, /CURRENT_FUTURE_SHOW_PHYSICAL_TABLE_BACKFILL_INCOMPLETE/);
});

test("future status changes self-heal idempotently without touching booking logic", async () => {
  const migration = await migrationSource();

  assert.match(migration, /after update of status on public\.shows/);
  assert.match(migration, /new\.date < current_date/);
  assert.match(migration, /ensure_show_operational_physical_tables\(new\.id\)/);
  assert.match(migration, /grant execute on function public\.ensure_show_operational_physical_tables\(uuid\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /reserve_public_booking|payment|ticket|assignment_enabled/);
});
