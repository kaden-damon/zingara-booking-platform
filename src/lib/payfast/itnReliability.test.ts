import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeUrl = new URL("../../app/api/payfast/itn/route.ts", import.meta.url);
const helperUrl = new URL("./itn.ts", import.meta.url);
const migrationUrl = new URL("../../../supabase/migrations/20261008170000_phase_48_4_payfast_itn_reliability.sql", import.meta.url);

test("ITN receipts are durable before validation and transient failures request retry", async () => {
  const [route, helper, migration] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(helperUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
  ]);

  assert.match(route, /recordItnReceipt\(supabase, rawBody, data, requestIp\)/);
  assert.match(route, /processingStatus: "retryable_failure"/);
  assert.match(route, /status: 503/);
  assert.match(route, /data\.merchant_id === config\.merchantId/);
  assert.match(helper, /PayFastTransientValidationError/);
  assert.match(helper, /response\.ok/);
  assert.match(migration, /create table if not exists public\.payfast_itn_receipts/);
  assert.match(migration, /receipt_hash text not null unique/);
  assert.match(migration, /attempt_count = public\.payfast_itn_receipts\.attempt_count \+ 1/);
});

test("invalid notifications remain non-retryable while provider payments stay idempotent", async () => {
  const [route, migration] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
  ]);

  assert.match(route, /"invalid_signature"/);
  assert.match(route, /"invalid_source"/);
  assert.match(route, /"invalid_merchant"/);
  assert.match(migration, /payments_payfast_provider_transaction_uidx|provider_transaction_id/);
  assert.match(migration, /status','already_reconciled'/);
  assert.doesNotMatch(migration, /insert into public\.communications/);
  assert.doesNotMatch(migration, /insert into public\.tickets/);
});

test("verified provider reconciliation keeps fees separate and audits payments and reversals", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /p_booking_amount \+ p_transaction_fee_amount/);
  assert.match(migration, /provider_processing_fee/);
  assert.match(migration, /merchant_net_amount/);
  assert.match(migration, /booking\.payfast-payment-reconciled/);
  assert.match(migration, /booking\.payfast-reversal-reconciled/);
  assert.match(migration, /payment_status='cancelled'/);
  assert.match(migration, /Payment reversed — check booking\./);
});
