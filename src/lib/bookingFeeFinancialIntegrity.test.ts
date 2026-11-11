import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateGuestAllocationFinancials } from "./bookingGuestAllocations.ts";
import { calculatePayFastTransactionAmounts } from "./payfast/transactionFee.ts";
import { calculatePublicBookingPricing } from "./pricing.ts";

test("corporate invoice pricing preserves tickets and gratuity to the cent", () => {
  const pricing = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_540,
    includeBookingFee: false,
    includeGratuity: true,
    partySize: 21,
    paymentOption: "full",
    zoneId: "golden-circle",
  });

  assert.equal(pricing.ticketAmount, 32_340);
  assert.equal(pricing.bookingFeeAmount, 0);
  assert.equal(pricing.subtotal, 32_340);
  assert.equal(pricing.serviceFeeAmount, 4_042.5);
  assert.equal(pricing.total, 36_382.5);
});

test("PayFast adds one fee without reducing booking revenue or gratuity", () => {
  const pricing = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_540,
    includeGratuity: true,
    partySize: 21,
    paymentOption: "full",
    zoneId: "golden-circle",
  });
  const transaction = calculatePayFastTransactionAmounts(pricing.total);

  assert.equal(pricing.total, 36_382.5);
  assert.equal(transaction.bookingAppliedAmount, 36_382.5);
  assert.equal(transaction.transactionFeeAmount, 10);
  assert.equal(transaction.providerGrossAmount, 36_392.5);
});

test("invoice, manual EFT and ordinary Standard totals contain no booking fee", () => {
  const corporateInvoice = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_540,
    includeBookingFee: false,
    includeGratuity: true,
    partySize: 21,
    paymentOption: "full",
    zoneId: "golden-circle",
  });
  const manualEft = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_540,
    includeBookingFee: false,
    includeGratuity: true,
    partySize: 21,
    paymentOption: "full",
    zoneId: "golden-circle",
  });
  const standard = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_540,
    includeGratuity: false,
    partySize: 4,
    paymentOption: "full",
    zoneId: "golden-circle",
  });

  assert.equal(corporateInvoice.total, 36_382.5);
  assert.equal(manualEft.total, 36_382.5);
  assert.equal(corporateInvoice.bookingFeeAmount, 0);
  assert.equal(manualEft.bookingFeeAmount, 0);
  assert.equal(standard.ticketAmount, 6_160);
  assert.equal(standard.serviceFeeAmount, 0);
  assert.equal(standard.bookingFeeAmount, 0);
  assert.equal(standard.total, 6_160);
});

test("multi-zone pricing uses the same cent-accurate fee boundary", () => {
  const pricing = calculateGuestAllocationFinancials({
    addonsTotal: 0,
    allocations: [{
      complimentaryPax: 0,
      paidPax: 21,
      zoneId: "golden-circle",
    }],
    depositForZone: () => 0,
    includeBookingFee: false,
    includeGratuity: true,
    serviceFeeGuestThreshold: 6,
    serviceFeeRate: 0.125,
    totalPax: 21,
    zonePrice: () => 1_540,
  });

  assert.equal(pricing.seatingSubtotal, 32_340);
  assert.equal(pricing.bookingFeeAmount, 0);
  assert.equal(pricing.serviceFeeAmount, 4_042.5);
  assert.equal(pricing.total, 36_382.5);
});

test("new bookings use v2 while legacy fee compatibility remains v1-only", () => {
  const route = readFileSync(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261106160000_corporate_buyout_pricing_corrections.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(route, /feePolicyVersion: "payment-method-v2"/);
  assert.match(migration, /feePolicyVersion' = 'payment-method-v1'/);
  assert.doesNotMatch(migration, /feePolicyVersion' = 'payment-method-v2'/);
});
