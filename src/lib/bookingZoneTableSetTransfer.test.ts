import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("table-set transfer replaces every source claim in one audited transaction", async () => {
  const sql = await source(
    "../../supabase/migrations/20261111113000_p0_booking_zone_table_set_transfer.sql",
  );

  assert.match(sql, /reallocate_booking_zone_tables_atomic/);
  assert.match(sql, /where booking_id = v_booking\.id[\s\S]*not \(id = any\(p_target_table_ids\)\)/);
  assert.match(sql, /where id = any\(p_target_table_ids\)/);
  assert.match(sql, /set section = v_target_booking_section/);
  assert.match(sql, /'booking\.zone-table-set-reallocated'/);
  assert.match(sql, /permission\.key = 'bookings:manage'/);
  assert.match(sql, /permission\.key = 'tables:manage'/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(
    sql,
    /update public\.(payments|tickets|customers|communications)/i,
  );
});

test("table-set transfer rejects stale, cross-show, cross-zone and unsafe capacity state", async () => {
  const sql = await source(
    "../../supabase/migrations/20261111113000_p0_booking_zone_table_set_transfer.sql",
  );

  assert.match(sql, /FLOOR_PLAN_STALE/);
  assert.match(sql, /CROSS_SHOW_TABLE_ASSIGNMENT/);
  assert.match(sql, /CROSS_ZONE_TABLE_ASSIGNMENT/);
  assert.match(sql, /COMBINED_TABLE_CAPACITY_INSUFFICIENT/);
  assert.match(sql, /TABLE_ALREADY_CLAIMED/);
  assert.match(sql, /MULTI_ZONE_BOOKING_WORKFLOW_REQUIRED/);
});

test("Admin exposes the shared atomic path with actionable conflicts", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const client = await source("./supabase/bookings.ts");
  const component = await source("../app/admin/BookingTableSetTransfer.tsx");

  assert.match(route, /action === "reallocate-zone-tables"/);
  assert.match(route, /reallocate_booking_zone_tables_atomic/);
  assert.match(route, /One or more selected tables are no longer available/);
  assert.match(route, /The selected tables do not safely accommodate this booking/);
  assert.match(route, /This booking uses multiple tables\. Use Manual table set/);
  assert.match(route, /TABLE_ASSIGNMENT_INTEGRITY_VIOLATION/);
  assert.match(client, /reallocateBookingZoneTables/);
  assert.match(component, /selectedCapacity < booking\.partySize/);
  assert.match(component, /Financials unchanged/);
  assert.match(component, /expectedTableIds: currentTableIds/);
});
