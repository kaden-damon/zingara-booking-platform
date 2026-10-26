import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("NYE policy is configured atomically and existing agreements are grandfathered", async () => {
  const migration = await source(
    "../../supabase/migrations/20261026193000_p0_performance_payment_policy.sql",
  );

  assert.match(migration, /payment_policy text not null default 'standard'/);
  assert.match(migration, /show\.date = date '2026-12-31'/);
  assert.match(migration, /show\.venue in \('cape-town', 'johannesburg'\)/);
  assert.match(migration, /if not v_requires_validation then\s+return new/);
  assert.match(migration, /old\.payment_policy_snapshot = 'full-payment-only'/);
  assert.match(migration, /FULL_PAYMENT_POLICY_AMENDMENT_REQUIRED/);
});

test("database guards deposits, incomplete settlement and premature tickets", async () => {
  const migration = await source(
    "../../supabase/migrations/20261026193000_p0_performance_payment_policy.sql",
  );

  assert.match(migration, /paymentOption', 'full'\) = 'deposit'/);
  assert.match(migration, /new\.payment_status::text = 'fully_paid'/);
  assert.match(migration, /FULL_PAYMENT_VERIFICATION_REQUIRED/);
  assert.match(migration, /FULL_PAYMENT_REQUIRED_BEFORE_TICKET_ISSUANCE/);
  assert.match(migration, /before insert or update of ticket_status/);
});

test("public and internal booking creation reject non-full NYE terms", async () => {
  const [bookingRoute, page, transferRoute] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source("../app/book/page.tsx"),
    source("../app/api/admin/bookings/route.ts"),
  ]);

  assert.match(bookingRoute, /isFullPaymentOnlyPolicy/);
  assert.match(bookingRoute, /booking\.paymentOption === "deposit"/);
  assert.match(bookingRoute, /paymentPolicy: "full-payment-only"/);
  assert.match(page, /Full payment is required for this performance/);
  assert.match(page, /!requiresFullPayment && \(/);
  assert.match(transferRoute, /destinationCommercialConfiguration/);
  assert.match(transferRoute, /Settle this booking in full before moving it/);
});

test("full-payment snapshots always generate outstanding-balance payment links", async () => {
  const paymentLinks = await source(
    "./payment-links/customerPaymentLinks.ts",
  );

  assert.match(
    paymentLinks,
    /payment_policy_snapshot === "full-payment-only"[\s\S]*return outstandingAmount/,
  );
});
