import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261004143000_complete_fnb_corporate_expiry_recovery.sql",
  "utf8",
);

test("FNB recovery is hard-bound to the approved booking and one operational seat", () => {
  assert.match(migration, /booking_reference = 'ZNG-N5GDTU'/);
  assert.match(migration, /v_added > 1/);
  assert.match(migration, /approved_maximum, request_id/);
  assert.match(migration, /v_booking\.show_date <> date '2026-11-26'/);
  assert.match(migration, /v_booking\.guest_count <> 12/);
  assert.match(migration, /normalize_booking_capacity_zone\(v_booking\.section\) <> 'middle-ring'/);
});

test("FNB recovery adds only operational capacity and delegates same-identity recovery", () => {
  assert.match(migration, /show_zone_operational_capacity_adjustments/);
  assert.match(migration, /'Corporate auto-expiry recovery'/);
  assert.match(migration, /recover_system_expired_corporate_booking_atomic/);
  assert.doesNotMatch(migration, /update\s+public\.shows/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.bookings/i);
  assert.doesNotMatch(migration, /update\s+public\.show_tables/i);
});

test("FNB recovery is revision protected, idempotent, audited, and service-only", () => {
  assert.match(migration, /BOOKING_REVISION_CHANGED/);
  assert.match(migration, /corporate\.booking\.expiry-recovered/);
  assert.match(migration, /show\.zone-operational-capacity\.approved-added/);
  assert.match(migration, /request_id = trim\(p_request_id\)/);
  assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]+to service_role/);
});

test("duplicate expiry residues are resolved without restoring duplicate entitlement", () => {
  assert.match(
    migration,
    /array\['DP-JHB-A6E9AD454CE4', 'ZNG-TGYRT2'\]::text\[\]/,
  );
  assert.match(
    migration,
    /array\['ZNG-CY6SKZ', 'ZNG-8X6CHC'\]::text\[\]/,
  );
  assert.equal(
    migration.match(/'confirmed_duplicate_resolved'/g)?.length,
    2,
  );
  assert.equal(
    migration.match(/'entitlement_mutation', false/g)?.length,
    2,
  );
});
