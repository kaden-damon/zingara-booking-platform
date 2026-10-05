import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20261005210000_below_minimum_booth_assignment_cleanup.sql",
  import.meta.url,
);

const expectedReferences = [
  "ZNG-9QZGU4",
  "ZNG-FF3JNU",
  "ZNG-FJGCWB",
  "ZNG-WNRGQV",
  "DP-JHB-025B0F833094",
  "ZNG-2M2WJD",
  "ZNG-5NFBNJ",
  "ZNG-U4RPUA",
];

test("cleanup is bounded to the eight audited below-minimum Booth assignments", async () => {
  const migration = await readFile(migrationPath, "utf8");

  for (const reference of expectedReferences) {
    assert.equal(migration.match(new RegExp(reference, "g"))?.length, 1);
  }
  assert.match(migration, /Expected eight approved below-minimum Booth corrections/);
  assert.match(migration, /An audited Booth assignment no longer matches/);
  assert.match(migration, /resolve_booking_table_assignment_compatibility/);
  assert.match(migration, /'occupancy-range'/);
});

test("cleanup fails closed when a compatible authoritative Booth is available", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /candidate\.booking_id is null/);
  assert.match(migration, /candidate\.status::text = 'available'/);
  assert.match(migration, /candidate\.is_physical/);
  assert.match(migration, /candidate\.is_override/);
  assert.match(migration, /candidate\.availability_scope::text = 'operational'/);
  assert.match(migration, /A compatible Booth became available/);
});

test("cleanup releases only table claims and leaves entitlement and value untouched", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /update public\.show_tables table_row/);
  assert.match(migration, /update public\.bookings booking\s+set\s+table_id = null/s);
  assert.match(migration, /Below minimum Booth occupancy/g);
  assert.match(migration, /floor_assignment_required', true/);
  assert.doesNotMatch(
    migration,
    /(insert into|update|delete from) public\.(payments|tickets|customers|shows|show_zone_capacity)/i,
  );
  assert.doesNotMatch(
    migration,
    /set\s+(guest_count|section|show_id|booking_status|payment_status|total_amount|amount_paid|balance_outstanding)\s*=/i,
  );
});

test("cleanup is replay-safe and records one immutable correction per booking", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /Permit a clean replay/);
  assert.match(migration, /booking\.table-assignment-integrity-corrected/g);
  assert.match(migration, /select count\(\*\) from public\.audit_events/);
  assert.match(migration, /<> 1/);
  assert.match(migration, /where target\.claim_id is not null/);
  assert.match(migration, /not exists \(\s+select 1\s+from public\.audit_events/s);
});
