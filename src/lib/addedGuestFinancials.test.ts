import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateAddedGuestFinancials,
  resolveAddedGuestPricingBasis,
} from "./addedGuestFinancials.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("full-payment additions use the saved agreed ticket rate", () => {
  const basis = resolveAddedGuestPricingBasis({
    bookingOrigin: "admin_staff",
    metadata: {
      pricingProvenance: {
        agreedPricePerPerson: 1150,
        depositPerPerson: 300,
        paymentModel: "full",
        source: "friends-family",
      },
    },
  });
  assert.deepEqual(basis, {
    paymentBasis: "full",
    source: "friends-family",
    unitAmount: 1150,
  });
  assert.deepEqual(
    calculateAddedGuestFinancials({ basis, currentGuestCount: 4, currentOutstanding: 0, newGuestCount: 6 }),
    { addedGuests: 2, additionalAmount: 2300, newOutstanding: 2300 },
  );
});

test("deposit additions preserve the original deposit per person", () => {
  const basis = resolveAddedGuestPricingBasis({
    bookingOrigin: "customer_public",
    metadata: {
      pricingProvenance: {
        agreedPricePerPerson: 1360,
        depositPerPerson: 500,
        paymentModel: "deposit",
        source: "standard-zone",
      },
    },
  });
  assert.deepEqual(
    calculateAddedGuestFinancials({ basis, currentGuestCount: 8, currentOutstanding: 4000, newGuestCount: 10 }),
    { addedGuests: 2, additionalAmount: 1000, newOutstanding: 5000 },
  );
});

test("modern metadata can recover the original deposit without current status", () => {
  assert.deepEqual(
    resolveAddedGuestPricingBasis({
      bookingOrigin: "customer_public",
      metadata: { depositPercentage: 25, partySize: 4, paymentOption: "deposit", pricePerPerson: 1000, totalPrice: 4000 },
    }),
    { paymentBasis: "deposit", source: "standard-zone", unitAmount: 250 },
  );
});

test("ambiguous legacy/imported pricing fails closed", () => {
  assert.equal(
    resolveAddedGuestPricingBasis({ bookingOrigin: "data_import", metadata: { paymentOption: "full", pricePerPerson: 1000 } }).paymentBasis,
    "unknown",
  );
});

test("decreases never reduce financials", () => {
  const result = calculateAddedGuestFinancials({
    basis: { paymentBasis: "full", source: "standard-zone", unitAmount: 1000 },
    currentGuestCount: 6,
    currentOutstanding: 3000,
    newGuestCount: 4,
  });
  assert.deepEqual(result, { addedGuests: 0, additionalAmount: 0, newOutstanding: 3000 });
});

test("atomic RPC increments obligation and outstanding without changing paid", async () => {
  const migration = await source("../../supabase/migrations/20260903120000_phase_39_55_added_guest_financials.sql");
  assert.match(migration, /v_booking\.balance_outstanding \+ v_additional_amount/);
  assert.match(migration, /total_amount = v_new_total/);
  assert.doesNotMatch(migration, /amount_paid\s*=/);
  assert.match(migration, /ADDED_GUEST_FINANCIAL_BASIS_REQUIRED/);
  assert.match(migration, /for update/);
});

test("normal capacity and table protections remain in the atomic RPC", async () => {
  const migration = await source("../../supabase/migrations/20260903120000_phase_39_55_added_guest_financials.sql");
  assert.match(migration, /v_table\.capacity < p_guest_count/);
  assert.match(migration, /normalize_booking_capacity_zone/);
  assert.doesNotMatch(migration, /set_config|historical_dineplan/);
});

test("Friends & Family is configured per venue and public settings hide its rate", async () => {
  const [model, publicRoute] = await Promise.all([
    source("./zingaraDemo.ts"),
    source("../app/api/venue-settings/route.ts"),
  ]);
  assert.match(model, /friendsAndFamily: Record/);
  assert.match(publicRoute, /friendsAndFamily: _staffPricing/);
});

test("Friends & Family requires authoritative manager role and cannot stack", async () => {
  const route = await source("../app/api/bookings/route.ts");
  assert.match(route, /\["box-office-manager", "super-admin"\]\.includes\(staffRole\)/);
  assert.match(route, /customPricedTemporaryTable \|\| booking\.promoCode\?\.trim\(\)/);
  assert.match(route, /pricingProvenance/);
});

test("staff checkout exposes explicit pricing while public checkout does not receive config", async () => {
  const page = await source("../app/book/page.tsx");
  assert.match(page, /Staff Pricing/);
  assert.match(page, /Friends &amp; Family/);
  assert.match(page, /setStaffPricingMode\("friends-family"\)/);
  assert.match(page, /disabled=\{isFriendsAndFamily\}/);
});

test("outstanding payment links reuse the existing secure link architecture", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  assert.match(route, /create-outstanding/);
  assert.match(route, /send-existing-outstanding/);
  assert.match(route, /getOutstandingAmount\(authoritativeBooking\)/);
  assert.match(route, /hashPaymentLinkToken\(token\)/);
});

test("reconciliation UI previews the increment and offers send or copy", async () => {
  const modal = await source("../app/admin/BookingReconciliationModal.tsx");
  assert.match(modal, /Additional obligation/);
  assert.match(modal, /New outstanding/);
  assert.match(modal, /Send To Guest/);
  assert.match(modal, /Copy Link/);
});
