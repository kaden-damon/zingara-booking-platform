import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261103135000_p0_table_plan_seating_classification.sql",
    import.meta.url,
  ),
  "utf8",
);

test("temporary Floor table numbers stay inside their authoritative zone family", () => {
  assert.match(migration, /when 'royal-booths' then 1/);
  assert.match(migration, /when 'middle-ring' then 200/);
  assert.match(migration, /when 'golden-circle' then 400/);
  assert.match(migration, /when 'royal-balcony' then 800/);
  assert.match(migration, /when 'middle-ring' then 399/);
  assert.match(migration, /when 'golden-circle' then 699/);
  assert.match(migration, /when 'royal-balcony' then 999/);
  assert.match(migration, /TEMPORARY_TABLE_CODE_RANGE_EXHAUSTED/);
});

test("the correction changes no existing business records", () => {
  assert.doesNotMatch(
    migration,
    /update public\.(bookings|show_tables|payments|tickets|customers)/i,
  );
  assert.doesNotMatch(
    migration,
    /delete from public\.(bookings|show_tables|payments|tickets|customers)/i,
  );
});
