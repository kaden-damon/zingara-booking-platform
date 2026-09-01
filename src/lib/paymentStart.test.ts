import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public checkout generates its reference through a public server route", async () => {
  const page = await source("../app/book/page.tsx");
  const start = page.indexOf("async function createBookingReference");
  const end = page.indexOf("function createWaitlistReference", start);
  const referenceGenerator = page.slice(start, end);

  assert.match(referenceGenerator, /fetch\("\/api\/bookings\/reference"/);
  assert.match(referenceGenerator, /method: "POST"/);
  assert.doesNotMatch(
    referenceGenerator,
    /\/api\/admin\/bookings\?reference=/,
  );
});

test("reference generation is read-only and returns no booking data", async () => {
  const route = await source("../app/api/bookings/reference/route.ts");

  assert.match(route, /export async function POST/);
  assert.match(route, /createShortBookingReference\(\)/);
  assert.match(route, /\.from\("bookings"\)/);
  assert.match(route, /\.select\("id"\)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(route, /customer|payment|ticket|table/i);
});

test("Admin booking reads remain staff protected", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const getHandler = route.slice(route.indexOf("export async function GET"));

  assert.match(getHandler, /requireActiveStaff\(request\)/);
});

test("booking creation precedes PayFast checkout and preserves transaction fee flow", async () => {
  const page = await source("../app/book/page.tsx");
  const createIndex = page.indexOf(
    "await persistPendingCheckoutBooking(reference)",
  );
  const checkoutIndex = page.indexOf('fetch("/api/payfast/checkout"');
  const checkout = await source("./payfast/checkout.ts");

  assert.ok(createIndex > 0);
  assert.ok(checkoutIndex > createIndex);
  assert.match(checkout, /calculatePayFastTransactionAmounts\(checkoutAmount\)/);
  assert.match(checkout, /providerGrossAmount/);
  assert.match(checkout, /transactionFeeAmount/);
});

test("PayFast handoff retains live-configured action and ITN URL", async () => {
  const checkout = await source("./payfast/checkout.ts");
  const config = await source("./payfast/config.ts");

  assert.match(checkout, /notifyUrl: config\.notifyUrl/);
  assert.match(checkout, /getPayFastPaymentFormAction\(payFastConfig\)/);
  assert.match(config, /PAYFAST_NOTIFY_URL/);
  assert.match(config, /processUrl: "https:\/\/www\.payfast\.co\.za\/eng\/process"/);
});

test("booking and payment retries retain existing atomic duplicate protection", async () => {
  const reservation = await source(
    "../../supabase/migrations/20260813170000_phase_27_6p_table_availability_scope.sql",
  );
  const checkoutAttempt = await source(
    "../../supabase/migrations/20260828120000_phase_39_10a_payfast_transaction_fee.sql",
  );

  assert.match(reservation, /pg_advisory_xact_lock/);
  assert.match(reservation, /'status', 'already_exists'/);
  assert.match(checkoutAttempt, /pg_advisory_xact_lock/);
  assert.match(checkoutAttempt, /payment_status = 'pending_payment'/);
  assert.match(checkoutAttempt, /provider_transaction_id is null/);
  assert.match(checkoutAttempt, /if v_payment\.id is null then\s+insert into/);
});
