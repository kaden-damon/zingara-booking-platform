import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateTablePlanFinancialBreakdown } from "./exports/tablePlanFinance.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("each PayFast checkout is bound to a distinct signed payment attempt", async () => {
  const [checkout, itn, migration] = await Promise.all([
    source("./payfast/checkout.ts"),
    source("../app/api/payfast/itn/route.ts"),
    source("../../supabase/migrations/20261030190000_phase_65_balance_payment_reconciliation.sql"),
  ]);

  assert.match(checkout, /prepare_payfast_checkout_attempt_v2/);
  assert.match(checkout, /customString3: payload\.paymentAttemptId/);
  assert.match(itn, /getCheckoutPaymentId\(data\)/);
  assert.match(itn, /confirm_payfast_payment_core_v2/);
  assert.match(itn, /p_checkout_payment_id: getCheckoutPaymentId\(data\)/);
  assert.match(migration, /insert into public\.payments/);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf("prepare_payfast_checkout_attempt_v2"),
      migration.indexOf("confirm_payfast_payment_core_v2"),
    ),
    /order by created_at desc[\s\S]*for update/,
  );
});

test("confirmation isolates the exact attempt and preserves provider idempotency", async () => {
  const migration = await source(
    "../../supabase/migrations/20261030190000_phase_65_balance_payment_reconciliation.sql",
  );

  assert.match(migration, /id = p_checkout_payment_id/);
  assert.match(migration, /round\(amount, 2\) = round\(p_amount, 2\)/);
  assert.match(migration, /provider_transaction_id = trim\(p_provider_transaction_id\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\(p_booking_reference\)\)/);
  assert.match(migration, /id is distinct from v_candidate_id/);
  assert.match(migration, /public\.confirm_payfast_payment_core\(/);
  assert.match(migration, /phase65RevokedReason/);
});

test("Table Plan includes a deposit and every later PayFast balance once", () => {
  const financials = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 10_000,
      guestCount: 4,
      paymentStatus: "fully_paid",
      totalAmount: 10_000,
    },
    [
      {
        amount: 4_000,
        method: "payfast",
        payment_status: "deposit_paid",
        payment_type: "deposit",
        provider_transaction_id: "deposit-1",
      },
      {
        amount: 3_000,
        method: "payfast",
        payment_status: "deposit_paid",
        payment_type: "balance",
        provider_transaction_id: "balance-1",
      },
      {
        amount: 3_000,
        method: "payfast",
        payment_status: "fully_paid",
        payment_type: "balance",
        provider_transaction_id: "balance-2",
      },
    ],
  );

  assert.equal(financials.prePaidCard, 4_000);
  assert.equal(financials.fullCard, 6_000);
  assert.equal(financials.totalPaid, 10_000);
  assert.equal(financials.toPay, 0);
  assert.equal(financials.methodUnknownPaid, 0);
});

test("pending, failed and duplicate rows cannot inflate the Table Plan", () => {
  const financials = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 5_000,
      guestCount: 2,
      paymentStatus: "deposit_paid",
      totalAmount: 10_000,
    },
    [
      {
        amount: 5_000,
        method: "payfast",
        payment_status: "deposit_paid",
        payment_type: "deposit",
        provider_transaction_id: "confirmed-1",
      },
      {
        amount: 5_000,
        method: "platform",
        payment_status: "pending_payment",
        payment_type: "balance",
      },
      {
        amount: 5_000,
        method: "payfast",
        payment_status: "failed",
        payment_type: "balance",
        provider_transaction_id: "failed-1",
      },
      {
        amount: 5_000,
        method: "payfast",
        payment_status: "fully_paid",
        payment_type: "balance",
        provider_transaction_id: "unexpected-extra",
      },
    ],
  );

  assert.equal(financials.prePaidCard, 5_000);
  assert.equal(financials.fullCard, 0);
  assert.equal(financials.totalPaid, 5_000);
  assert.equal(financials.toPay, 5_000);
});
