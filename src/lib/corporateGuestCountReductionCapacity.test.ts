import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "../../supabase/migrations/20261029235962_p0_guest_count_reduction_capacity.sql";
const originalFunctionPath =
  "../../supabase/migrations/20261014170000_p0_corporate_guest_count_and_price_editing.sql";

async function migrationSource() {
  return readFile(new URL(migrationPath, import.meta.url), "utf8");
}

test("Corporate reductions bypass only the positive capacity-delta guard", async () => {
  const [migration, originalFunction] = await Promise.all([
    migrationSource(),
    readFile(new URL(originalFunctionPath, import.meta.url), "utf8"),
  ]);

  assert.match(
    migration,
    /if p_guest_count > v_booking\.guest_count\s+and v_limit is not null\s+and v_existing_pax \+ p_guest_count > v_limit then/,
  );
  assert.match(originalFunction, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(originalFunction, /booking_table_claims_fit_guest_count/);
  assert.match(originalFunction, /GUEST_COUNT_UNCHANGED/);
  assert.match(originalFunction, /SHOW_NOT_ACTIVE/);
});

test("Migration fails closed if the expected shared guard changes", async () => {
  const migration = await migrationSource();

  assert.match(migration, /CORPORATE_GUEST_COUNT_CAPACITY_GUARD_NOT_FOUND/);
  assert.match(migration, /CORPORATE_GUEST_COUNT_CAPACITY_GUARD_ALREADY_CORRECTED/);
  assert.match(migration, /revoke all on function/);
  assert.match(migration, /grant execute on function/);
});
