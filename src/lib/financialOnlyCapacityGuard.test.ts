import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "../../supabase/migrations/20260925130000_phase_41_2x_p0_b_financial_only_capacity_guard.sql";

async function migration() {
  return readFile(new URL(migrationPath, import.meta.url), "utf8");
}

test("financial-only updates bypass capacity only when entitlement inputs are unchanged", async () => {
  const source = await migration();

  for (const field of [
    "show_id",
    "section",
    "zone_entitlements",
    "guest_count",
  ]) {
    assert.match(
      source,
      new RegExp(`old\\.${field} is not distinct from new\\.${field}`),
    );
  }

  assert.match(source, /\(old\.archived_at is null\) = \(new\.archived_at is null\)/);
  assert.match(source, /old\.booking_status::text in \('new', 'confirmed', 'pending_payment', 'checked_in'\)/);
  assert.match(source, /new\.booking_status::text in \('new', 'confirmed', 'pending_payment', 'checked_in'\)/);
  assert.match(source, /if tg_op = 'UPDATE'[\s\S]*?then\s+return new;/);
  assert.doesNotMatch(source, /if tg_op = 'UPDATE' then\s+return new;/);
});

test("entitlement-changing writes retain the authoritative capacity guard", async () => {
  const source = await migration();

  assert.match(source, /corporate_zone_entitlements_valid/);
  assert.match(source, /booking_zone_entitlement_pax/);
  assert.match(source, /booking_capacity_zone_effective_limit/);
  assert.match(source, /booking_capacity_zone_limit/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(source, /tg_op = 'INSERT'[\s\S]*?booking_origin = 'customer_public'/);
});

test("reactivation, show, zone, pax, and multi-zone changes cannot take the bypass", async () => {
  const source = await migration();
  const bypass = source.slice(
    source.indexOf("if tg_op = 'UPDATE'"),
    source.indexOf("v_import_exception :="),
  );

  assert.match(bypass, /old\.show_id is not distinct from new\.show_id/);
  assert.match(bypass, /old\.section is not distinct from new\.section/);
  assert.match(bypass, /old\.zone_entitlements is not distinct from new\.zone_entitlements/);
  assert.match(bypass, /old\.guest_count is not distinct from new\.guest_count/);
  assert.match(bypass, /old\.archived_at/);
  assert.match(bypass, /old\.booking_status/);
});

test("the trigger surface still includes every entitlement-changing booking field", async () => {
  const [source, triggerMigration] = await Promise.all([
    migration(),
    readFile(
      new URL(
        "../../supabase/migrations/20260909110000_phase_41_1p_multi_zone_corporate_entitlements.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(source, /create or replace function public\.enforce_booking_zone_capacity/);
  assert.match(
    triggerMigration,
    /before insert or update of show_id, section, zone_entitlements, guest_count, booking_status, archived_at/,
  );
});

test("Shannon-shaped PayFast settlement remains atomic and idempotent", async () => {
  const [source, paymentCore, itn] = await Promise.all([
    migration(),
    readFile(
      new URL(
        "../../supabase/migrations/20260916130000_phase_41_2o_payment_aggregate_concurrency.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/api/payfast/itn/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /old\.guest_count is not distinct from new\.guest_count/);
  assert.match(paymentCore, /pg_advisory_xact_lock\(hashtext\(p_booking_reference\)\)/);
  assert.match(paymentCore, /provider_transaction_id = p_provider_transaction_id/);
  assert.match(paymentCore, /status = 'used'/);
  assert.match(paymentCore, /used_at = coalesce\(used_at, v_now\)/);
  assert.match(paymentCore, /v_cumulative_paid := least/);
  assert.match(itn, /verifyPayFastItnSignature/);
  assert.match(itn, /verifyPayFastSourceIp/);
  assert.match(itn, /verifyPayFastServerConfirmation/);
  assert.match(itn, /paymentAmountValid/);
  assert.match(itn, /data\.payment_status !== "COMPLETE"/);
});
