import assert from "node:assert/strict";
import test from "node:test";

import { calculateBookingAddonFinancialUpdate } from "./bookingAddons.ts";
import { calculatePublicBookingPricing } from "./pricing.ts";

test("new online pricing excludes gratuity above six guests", () => {
  const pricing = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_320,
    includeGratuity: false,
    partySize: 6,
    paymentOption: "full",
    zoneId: "middle-ring",
  });

  assert.equal(pricing.serviceFeeAmount, 0);
  assert.equal(pricing.total, pricing.discountedSubtotal);
});

test("existing gratuity policy remains available for internal pricing", () => {
  const pricing = calculatePublicBookingPricing({
    authoritativePricePerPerson: 1_320,
    includeGratuity: true,
    partySize: 6,
    paymentOption: "full",
    zoneId: "middle-ring",
  });

  assert.equal(pricing.serviceFeeAmount, 990);
});

test("add-on amendments preserve each booking's original gratuity treatment", () => {
  const venuePaid = calculateBookingAddonFinancialUpdate({
    amountPaid: 0,
    currentServiceFee: 0,
    currentTotalAmount: 7_920,
    newAddonsTotal: 600,
    oldAddonsTotal: 0,
    partySize: 6,
    subtotalAmount: 7_920,
  });
  const historical = calculateBookingAddonFinancialUpdate({
    amountPaid: 0,
    currentServiceFee: 990,
    currentTotalAmount: 8_910,
    newAddonsTotal: 600,
    oldAddonsTotal: 0,
    partySize: 6,
    subtotalAmount: 7_920,
  });

  assert.equal(venuePaid.serviceFee, 0);
  assert.equal(historical.serviceFee, 1_065);
});
