import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isPaymentLinkBalanceSnapshotCurrent,
} from "./payment-links/paymentLinkBalance.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("a balance link snapshots and resolves the authoritative current outstanding", () => {
  assert.equal(isPaymentLinkBalanceSnapshotCurrent({
    amountPaid: 4_950,
    metadata: {
      amountPaidSnapshot: 4_950,
      checkoutAmount: 7_706,
      outstandingReconciliation: true,
      totalAmountSnapshot: 12_656,
    },
    outstandingAmount: 7_706,
    totalAmount: 12_656,
  }), true);
});

test("Giovasha's original deposit token becomes stale after the deposit is paid", () => {
  const metadata = {
    checkoutAmount: 4_950,
    manualCheckout: true,
    outstandingReconciliation: false,
  };

  assert.equal(isPaymentLinkBalanceSnapshotCurrent({
    amountPaid: 4_950,
    metadata,
    outstandingAmount: 7_706,
    totalAmount: 12_656,
  }), false);
  assert.equal(isPaymentLinkBalanceSnapshotCurrent({
    amountPaid: 0,
    metadata,
    outstandingAmount: 12_656,
    totalAmount: 12_656,
  }), true);
});

test("a financial change invalidates a previously current balance snapshot", () => {
  assert.equal(isPaymentLinkBalanceSnapshotCurrent({
    amountPaid: 5_000,
    metadata: {
      amountPaidSnapshot: 4_950,
      checkoutAmount: 7_706,
      outstandingReconciliation: true,
      totalAmountSnapshot: 12_656,
    },
    outstandingAmount: 7_656,
    totalAmount: 12_656,
  }), false);
});

test("customer lookup and checkout reject stale links before PayFast", async () => {
  const [lookup, checkout] = await Promise.all([
    source("../app/api/payment-links/[token]/route.ts"),
    source("../app/api/payment-links/[token]/checkout/route.ts"),
  ]);

  for (const route of [lookup, checkout]) {
    assert.match(route, /getManagedPaymentLinkStatus\(link, booking\) === "stale"/);
    assert.match(route, /no longer matches the current outstanding balance/);
  }
  const checkoutHandler = checkout.slice(checkout.indexOf("export async function POST"));
  assert.ok(
    checkoutHandler.indexOf("getManagedPaymentLinkStatus(link, booking)") <
      checkoutHandler.indexOf("preparePayFastCheckoutAttempt(supabase"),
  );
});

test("balance creation is atomic, current-balance authoritative and duplicate-safe", async () => {
  const [migration, route] = await Promise.all([
    source("../../supabase/migrations/20260908200000_phase_41_1j_balance_payment_links.sql"),
    source("../app/api/admin/bookings/payment-link/route.ts"),
  ]);

  assert.match(migration, /from public\.bookings[\s\S]*for update/);
  assert.match(migration, /total_amount, 0\) - coalesce\(v_booking\.amount_paid, 0\)/);
  assert.match(migration, /ACTIVE_BALANCE_LINK_EXISTS/);
  assert.match(migration, /update public\.booking_payment_links[\s\S]*status = 'revoked'/);
  assert.match(migration, /amountPaidSnapshot/);
  assert.match(migration, /totalAmountSnapshot/);
  assert.match(migration, /revoke all[\s\S]*anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
  assert.match(route, /create_booking_balance_payment_link_atomic/);
  assert.match(route, /A current balance payment link already exists/);
});

test("resend rejects stale links and never creates a replacement token", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  const resend = route.slice(
    route.indexOf('action === "send-existing"'),
    route.indexOf('if (action !== "create"', route.indexOf('action === "send-existing"')),
  );

  assert.match(resend, /getManagedPaymentLinkStatus\(link, authoritativeBooking\) !== "active"/);
  assert.doesNotMatch(resend, /createPaymentLinkToken/);
  assert.doesNotMatch(resend, /\.insert\(/);
});

test("reconciliation returns safe specific immutable-evidence and unchanged errors", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");

  assert.match(route, /AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE/);
  assert.match(route, /cannot be reduced below verified provider or legacy payment evidence/);
  assert.match(route, /FINANCIAL_RECONCILIATION_UNCHANGED/);
  assert.match(route, /Enter a financial change before confirming/);
});

test("balance-link repair does not mutate booking financials or payment history", async () => {
  const [route, migration] = await Promise.all([
    source("../app/api/admin/bookings/payment-link/route.ts"),
    source("../../supabase/migrations/20260908200000_phase_41_1j_balance_payment_links.sql"),
  ]);

  for (const code of [route, migration]) {
    assert.doesNotMatch(code, /update public\.bookings/);
    assert.doesNotMatch(code, /update public\.payments/);
    assert.doesNotMatch(code, /delete from public\.(bookings|payments|tickets|customers)/);
  }
});

test("Admin distinguishes stale links and current-balance actions", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /status: "active" \| "expired" \| "paid" \| "revoked" \| "stale"/);
  assert.match(page, /Create Current Balance Link/);
  assert.match(page, /Create Balance Payment Link/);
  assert.match(page, /Send Balance Payment Link/);
});
