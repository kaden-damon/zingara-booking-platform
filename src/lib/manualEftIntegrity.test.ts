import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

const migrationPath =
  "supabase/migrations/20261006120000_go_daddy_false_eft_reversal_and_manual_eft_controls.sql";

test("manual EFT evidence and reversals are immutable and service-role only", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /create table if not exists public\.manual_eft_payment_evidence/);
  assert.match(sql, /create table if not exists public\.manual_payment_reversals/);
  assert.match(sql, /before update or delete on public\.manual_eft_payment_evidence/);
  assert.match(sql, /before update or delete on public\.manual_payment_reversals/);
  assert.match(sql, /revoke all on table public\.manual_eft_payment_evidence from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.manual_payment_reversals from public, anon, authenticated/);
});

test("future EFT recording requires structured bank evidence and explicit confirmation", async () => {
  const sql = await source(migrationPath);
  const route = await source("src/app/api/admin/bookings/mark-paid/route.ts");
  const page = await source("src/app/admin/page.tsx");

  assert.match(sql, /p_amount_received numeric/);
  assert.match(sql, /p_received_on date/);
  assert.match(sql, /p_bank_reference text/);
  assert.match(sql, /p_evidence_note text/);
  assert.match(sql, /p_confirmed boolean/);
  assert.match(sql, /permission\.key = 'bookings:reconcile'/);
  assert.match(sql, /p_received_on > \(v_now at time zone 'Africa\/Johannesburg'\)::date/);
  assert.match(sql, /p_received_on::timestamp at time zone 'Africa\/Johannesburg'/);
  assert.match(sql, /MANUAL_EFT_EXCEEDS_OUTSTANDING/);
  assert.match(sql, /MANUAL_EFT_REFERENCE_DUPLICATE/);
  assert.match(route, /includes\("bookings:reconcile"\)/);
  assert.match(route, /amountReceived/);
  assert.match(route, /bankReference/);
  assert.match(route, /receivedOn/);
  assert.match(route, /evidenceNote/);
  assert.match(page, /A proof of payment[\s\S]+is not proof that the money was received/);
  assert.match(page, /I confirm[\s\S]+bank reference/);
  assert.match(page, /This will reduce the booking&apos;s outstanding balance/);
});

test("manual EFT supports deposits, balances and retry-safe full settlement", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /v_new_amount_paid := round\(coalesce\(v_booking\.amount_paid, 0\) \+ p_amount_received, 2\)/);
  assert.match(sql, /when v_new_balance <= 0\.01[\s\S]+fully_paid/);
  assert.match(sql, /else 'deposit_paid'/);
  assert.match(sql, /when coalesce\(v_booking\.amount_paid, 0\) > 0 then 'balance'/);
  assert.match(sql, /request_id = trim\(p_idempotency_key\)/);
  assert.match(sql, /insert into public\.payments/);
  assert.doesNotMatch(
    sql.slice(sql.indexOf("create or replace function public.record_manual_eft_payment_atomic"), sql.indexOf("create or replace function public.reverse_false_manual_payment_atomic")),
    /update public\.payments/,
  );
});

test("false-payment reversal preserves booking identity, entitlement and ticket state", async () => {
  const sql = await source(migrationPath);
  const reversal = sql.slice(sql.indexOf("create or replace function public.reverse_false_manual_payment_atomic"));
  assert.match(reversal, /original_payment_snapshot/);
  assert.match(reversal, /'booking\.manual-payment-reversed'/);
  assert.match(reversal, /update public\.payments set payment_status='cancelled'/);
  assert.match(reversal, /set amount_paid=v_new_amount_paid,balance_outstanding=v_new_balance/);
  assert.doesNotMatch(reversal, /insert into public\.bookings/);
  assert.doesNotMatch(reversal, /update public\.tickets/);
  assert.doesNotMatch(reversal, /update public\.booking_payment_links/);
  const bookingUpdate = reversal.slice(
    reversal.indexOf("update public.bookings"),
    reversal.indexOf("insert into public.audit_events"),
  );
  assert.doesNotMatch(bookingUpdate, /guest_count|section|show_id|table_id|booking_status/);
  assert.doesNotMatch(reversal, /communications|send|email|sms|push/i);
});

test("unstructured payment endpoints cannot create manual paid evidence", async () => {
  const route = await source("src/app/api/admin/payments/route.ts");
  const migration = await source(migrationPath);
  assert.match(route, /STRUCTURED_MANUAL_EFT_REQUIRED/);
  assert.match(route, /unchangedSuccessfulManualPayment/);
  assert.match(route, /incomingPaymentStatus === existingPayment\.payment_status/);
  assert.match(route, /Record manual EFT payments through the evidence-backed payment control/);
  assert.match(migration, /revoke execute on function public\.mark_booking_paid_atomic/);
  assert.match(migration, /revoke execute on function public\.record_expired_corporate_payment_atomic/);
});

test("PayFast remains independently guarded by successful provider completion", async () => {
  const itn = await source("src/app/api/payfast/itn/route.ts");
  assert.match(itn, /payment_status/);
  assert.match(itn, /COMPLETE/);
  assert.match(itn, /confirm_payfast_payment_core/);
});
