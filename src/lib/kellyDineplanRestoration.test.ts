import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20261014103000_p0_kelly_dineplan_identity_restoration.sql",
  import.meta.url,
);

async function migrationSource() {
  return readFile(migrationUrl, "utf8");
}

test("Kelly restoration is allowlisted, revision protected and idempotent", async () => {
  const source = await migrationSource();

  assert.match(source, /restore_kelly_dineplan_booking_atomic/);
  assert.match(source, /53145f64-7ac8-42a1-8386-64da357dc6cf/);
  assert.match(source, /DP-NK9BQC/);
  assert.match(source, /p_expected_updated_at/);
  assert.match(source, /KELLY_BOOKING_REVISION_CHANGED/);
  assert.match(source, /booking\.dineplan-identity-restored/);
  assert.match(source, /already_processed/);
  assert.match(source, /to service_role/);
  assert.match(source, /from public, anon, authenticated/);
});

test("Kelly keeps her original identity, ticket and reviewed paid-in-full evidence", async () => {
  const source = await migrationSource();

  assert.match(source, /Kelly Robinson/);
  assert.match(source, /Tyrone Pharmacy/);
  assert.match(source, /'Middle Ring'/);
  assert.match(source, /'fully_paid'/);
  assert.match(source, /amount_paid = 23760/);
  assert.match(source, /DP-NK9BQC-01/);
  assert.match(source, /qr_payload = 'DP-NK9BQC-01'/);
  assert.match(source, /INV-1113/);
  assert.match(source, /ticket value excludes gratuity/);
  assert.doesNotMatch(source, /insert into public\.tickets/i);
});

test("the distinct Melanie row retains its existing evidence and table claim", async () => {
  const source = await migrationSource();

  assert.match(source, /DP-JHB-2C13118E212C/);
  assert.match(source, /Melanie Samsung Diecto/);
  assert.match(source, /2c13118e212ca9240c71536325feebac19437cc9e689a293c86836a9f0c63b9a/);
  assert.match(source, /source_row_number = 1521/);
  assert.match(source, /table_code = '800\+801'/);
  assert.match(source, /set booking_id = v_melanie_id/);
  assert.match(source, /set booking_id = v_melanie_id,\s*reference = v_melanie_reference/);
});

test("capacity recovery is bounded operational Extra seating only", async () => {
  const source = await migrationSource();

  assert.match(source, /booking_capacity_zone_state/);
  assert.match(source, /v_required_extra > 16/);
  assert.match(source, /show_zone_operational_capacity_adjustments/);
  assert.match(source, /approved_maximum/);
  assert.match(source, /KELLY_POST_RESTORATION_CAPACITY_MISMATCH/);
  assert.doesNotMatch(source, /insert into public\.show_tables/i);
  assert.doesNotMatch(source, /update public\.shows/i);
});

test("restoration cannot send communications or alter unrelated bookings", async () => {
  const source = await migrationSource();

  assert.match(source, /exists \(select 1 from public\.communications/);
  assert.match(source, /customer_communications_sent', 0/);
  assert.doesNotMatch(source, /insert into public\.communications/i);
  assert.doesNotMatch(source, /insert into public\.communication_batches/i);
  assert.doesNotMatch(source, /delete from public\.bookings/i);
});
