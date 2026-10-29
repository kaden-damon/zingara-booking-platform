import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20261029213000_p0_historical_customer_identity_search.sql",
  import.meta.url,
);
const fallbackMigrationUrl = new URL(
  "../../supabase/migrations/20261029213100_p0_historical_customer_identity_name_fallback.sql",
  import.meta.url,
);

test("CRM search includes audited former customer identities without duplicating customers", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /action = 'customer\.identity_edit'/);
  assert.match(migration, /identity_edit\.entity_id = customer\.id::text/);
  assert.match(migration, /identity_edit\.before_values->>'first_name'/);
  assert.match(migration, /identity_edit\.before_values->>'surname'/);
  assert.match(migration, /identity_edit\.before_values->>'email'/);
  assert.match(migration, /identity_edit\.before_values->>'mobile'/);
  assert.match(migration, /customer\.merged_into_customer_id is null/);
  assert.doesNotMatch(migration, /insert into public\.customers/i);
});

test("historical names retain unchanged identity fields", async () => {
  const migration = await readFile(fallbackMigrationUrl, "utf8");

  assert.match(
    migration,
    /coalesce\(identity_edit\.before_values->>'first_name', customer\.first_name\)/,
  );
  assert.match(
    migration,
    /coalesce\(identity_edit\.before_values->>'surname', customer\.surname\)/,
  );
});
