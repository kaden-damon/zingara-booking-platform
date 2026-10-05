import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Floor Allocation and table selectors share natural numeric ordering", async () => {
  const [admin, moves] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("./bookingTableMoves.ts"),
  ]);

  assert.match(admin, /getZoneTables[\s\S]*comparePhysicalTableCodes/);
  assert.match(moves, /comparePhysicalTableCodes\(left\.tableNumber, right\.tableNumber\)/);
});

test("the configuration migration changes fit only, not sellable capacity or assignments", async () => {
  const migration = await source(
    "../../supabase/migrations/20261005180000_phase_46_3_jacques_table_fit.sql",
  );

  assert.match(migration, /update public\.venue_tables/);
  assert.match(migration, /minimum_capacity = expected\.new_minimum/);
  assert.match(migration, /maximum_capacity = expected\.new_maximum/);
  assert.doesNotMatch(migration, /update public\.(shows|show_tables|bookings|payments|tickets|customers)/i);
  assert.doesNotMatch(migration, /update public\.venue_settings/i);
  assert.doesNotMatch(migration, /insert into public\.show_zone_operational_capacity_adjustments/i);
});

test("public and internal capacity remain distinct at route and database boundaries", async () => {
  const [route, guard] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source(
      "../../supabase/migrations/20260925130000_phase_41_2x_p0_b_financial_only_capacity_guard.sql",
    ),
  ]);

  assert.match(route, /capacityScope: isTrustedStaff \? "operational" : "base"/);
  assert.match(guard, /booking_origin = 'customer_public'[\s\S]*booking_source = 'online'[\s\S]*booking_capacity_zone_limit/);
  assert.match(guard, /else\s+v_limit := public\.booking_capacity_zone_effective_limit/);
  assert.match(guard, /pg_advisory_xact_lock/);
});
