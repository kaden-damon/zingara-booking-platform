import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getSelectedBookingPaymentAmount,
  type PaymentLinkBookingRow,
} from "./payment-links/customerPaymentLinks.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function bookingRow(overrides: Partial<PaymentLinkBookingRow> = {}): PaymentLinkBookingRow {
  return {
    amount_paid: 0,
    archived_at: null,
    balance_outstanding: 2_300,
    booking_reference: "ZNG-TEST",
    booking_source: "admin",
    booking_status: "pending_payment",
    customer_id: "customer",
    guest_count: 2,
    id: "booking",
    notes:
      '__zingara_booking_meta__:{"paymentOption":"deposit","depositPercentage":47.82608695652174,"pricingProvenance":{"depositPerPerson":550}}',
    payment_status: "pending_payment",
    section: "Golden Circle",
    service_fee: 0,
    show_id: "show",
    total_amount: 2_300,
    ...overrides,
  };
}

test("deposit links use the saved per-person deposit after guest-count changes", () => {
  assert.equal(getSelectedBookingPaymentAmount(bookingRow()), 1_100);
  assert.equal(
    getSelectedBookingPaymentAmount(
      bookingRow({ guest_count: 10, total_amount: 15_400, balance_outstanding: 15_400 }),
    ),
    5_500,
  );
});

test("legacy percentage fallback preserves exact cents", () => {
  assert.equal(
    getSelectedBookingPaymentAmount(
      bookingRow({
        balance_outstanding: 99.99,
        guest_count: 1,
        notes:
          '__zingara_booking_meta__:{"paymentOption":"deposit","depositPercentage":33.33333333333333}',
        total_amount: 99.99,
      }),
    ),
    33.33,
  );
});

test("unpaid reductions reprice and revoke payment links atomically", async () => {
  const [migration, route] = await Promise.all([
    source("../../supabase/migrations/20261112100000_p0_booking_payment_link_integrity.sql"),
    source("../app/api/admin/bookings/reconciliation/route.ts"),
  ]);

  assert.match(route, /reconcile_unpaid_native_guest_reduction_atomic/);
  assert.match(migration, /reconcile_booking_guest_count_financials_atomic\(/);
  assert.match(migration, /p_guest_count \* v_unit_amount/);
  assert.match(migration, /zonePricing.*depositAmount/);
  assert.match(migration, /gratuityPolicy}', to_jsonb\('pay-at-venue'/);
  assert.match(migration, /update public\.booking_payment_links[\s\S]*status = 'revoked'/);
  assert.match(migration, /amount_paid, 0/);
  assert.match(migration, /booking_origin not in \('admin_staff', 'customer_public'\)/);
});

test("manual financial reconciliation synchronizes metadata and invalidates links", async () => {
  const [migration, route] = await Promise.all([
    source("../../supabase/migrations/20261112100000_p0_booking_payment_link_integrity.sql"),
    source("../app/api/admin/bookings/reconciliation/route.ts"),
  ]);

  assert.match(route, /reconcile_booking_financials_and_links_atomic/);
  assert.match(migration, /reconcile_booking_financials_atomic\(/);
  assert.match(migration, /\{totalPrice}/);
  assert.match(migration, /\{balanceDue}/);
  assert.match(migration, /booking\.payment-links-invalidated/);
});

