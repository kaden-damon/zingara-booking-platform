import assert from "node:assert/strict";
import test from "node:test";

import { resolveCorporateFunctionBriefFinancials, resolveFunctionBriefBuyoutComposition } from "./corporateFunctionBriefFinancials.ts";

const grandSociety = {
  package_snapshot: { displayName: "The Grand Society" },
  commercial_base_amount: 742_500, commercial_vat_amount: 111_375,
  commercial_gratuity_amount: 92_812.50, commercial_total_amount: 946_687.50,
  commercial_additional_guest_amount: 0,
};

test("Function Brief uses reconciled persisted package components, not a new pricing calculation", () => {
  assert.deepEqual(resolveFunctionBriefBuyoutComposition(grandSociety, {
    addonsTotal: 0, serviceFee: 92_812.50, totalAmount: 946_687.50,
  }), { packageName: "The Grand Society", packageBaseAmount: 742_500, vatAmount: 111_375 });
});

test("historical package VAT cannot override a later agreed obligation or add-on adjustment", () => {
  for (const booking of [
    { addonsTotal: 0, serviceFee: 73_750, totalAmount: 684_400 },
    { addonsTotal: 100, serviceFee: 92_825, totalAmount: 946_800 },
  ]) {
    assert.deepEqual(resolveFunctionBriefBuyoutComposition(grandSociety, booking), {
      packageName: "The Grand Society", packageBaseAmount: null, vatAmount: null,
    });
  }
});

test("missing, inconsistent and invalid package evidence never fabricates VAT", () => {
  const booking = { addonsTotal: 0, serviceFee: 92_812.50, totalAmount: 946_687.50 };
  assert.equal(resolveFunctionBriefBuyoutComposition(null, booking).vatAmount, null);
  for (const row of [
    { ...grandSociety, commercial_vat_amount: Number.NaN },
    { ...grandSociety, commercial_vat_amount: -1 },
    { ...grandSociety, commercial_base_amount: 742_499.99 },
    { ...grandSociety, commercial_additional_guest_amount: 1 },
  ]) assert.equal(resolveFunctionBriefBuyoutComposition(row, booking).vatAmount, null);
});

const referenceNotes = `__zingara_booking_meta__:${JSON.stringify({
  addons: [{
    id: "custom-bar-tab",
    kind: "custom",
    name: "Bar Tab",
    price: 2900,
    pricingType: "priced",
    quantity: 29,
    unitPrice: 100,
  }],
})}`;

test("reconciles Pulling Power Media without changing historical values", () => {
  const financials = resolveCorporateFunctionBriefFinancials({
    addonsTotal: 2900,
    amountPaid: 47632.5,
    bookingOrigin: "corporate",
    bookingStatus: "confirmed",
    discountAmount: 0,
    notes: referenceNotes,
    paymentStatus: "fully_paid",
    serviceFee: 4953,
    subtotalAmount: 42679.5,
    totalAmount: 47632.5,
  });

  assert.equal(financials.fullPaymentAmount, 47632.5);
  assert.equal(financials.ticketValue, 39769.5);
  assert.equal(financials.bookingFeeAmount, 10);
  assert.equal(financials.ticketGratuityPaid, 4590.5);
  assert.equal(financials.barTabAmount, 2900);
  assert.equal(financials.barGratuityPaid, 362.5);
  assert.equal(
    financials.ticketValue + financials.bookingFeeAmount +
      financials.ticketGratuityPaid + financials.barTabAmount +
      financials.barGratuityPaid,
    47632.5,
  );
});

test("does not describe charged gratuity as paid before settlement", () => {
  const financials = resolveCorporateFunctionBriefFinancials({
    addonsTotal: 2900,
    amountPaid: 10000,
    bookingOrigin: "corporate",
    bookingStatus: "pending_payment",
    discountAmount: 0,
    notes: referenceNotes,
    paymentStatus: "deposit_paid",
    serviceFee: 4953,
    subtotalAmount: 42679.5,
    totalAmount: 47632.5,
  });

  assert.equal(financials.ticketGratuityPaid, 0);
  assert.equal(financials.barGratuityPaid, 0);
});

test("fixed Buyout packages do not acquire the ordinary booking fee", () => {
  const notes = `__zingara_booking_meta__:${JSON.stringify({
    commercialModel: "fixed-buyout-package",
  })}`;
  const financials = resolveCorporateFunctionBriefFinancials({
    addonsTotal: 0,
    amountPaid: 752250,
    bookingOrigin: "corporate",
    bookingStatus: "confirmed",
    discountAmount: 0,
    notes,
    paymentStatus: "fully_paid",
    serviceFee: 73750,
    subtotalAmount: 678500,
    totalAmount: 752250,
  });

  assert.equal(financials.bookingFeeAmount, 0);
  assert.equal(financials.ticketValue, 678500);
  assert.equal(financials.ticketGratuityPaid, 73750);
});

test("reconciles newer Corporate rows where add-ons sit outside subtotal", () => {
  const notes = `__zingara_booking_meta__:${JSON.stringify({
    addons: [{
      id: "corporate-bar-tab",
      kind: "catalogue",
      name: "Bar Tab",
      price: 9600,
      pricingType: "operational",
      quantity: 1,
      unitPrice: 9600,
    }],
  })}`;
  const financials = resolveCorporateFunctionBriefFinancials({
    addonsTotal: 9600,
    amountPaid: 85050,
    bookingOrigin: "corporate",
    bookingStatus: "confirmed",
    discountAmount: 0,
    notes,
    paymentStatus: "fully_paid",
    serviceFee: 11100,
    subtotalAmount: 64350,
    totalAmount: 85050,
  });

  assert.equal(financials.ticketValue, 64340);
  assert.equal(financials.bookingFeeAmount, 10);
  assert.equal(financials.barTabAmount, 9600);
  assert.equal(
    financials.ticketValue + financials.bookingFeeAmount +
      financials.ticketGratuityPaid + financials.barTabAmount +
      financials.barGratuityPaid,
    85050,
  );
});

test("explicit imported evidence remains authoritative", () => {
  const financials = resolveCorporateFunctionBriefFinancials({
    addonsTotal: 1500,
    amountPaid: 0,
    bookingOrigin: "data_import",
    bookingStatus: "confirmed",
    discountAmount: 0,
    evidence: {
      bar_gratuity_amount: 187.5,
      bar_tab_paid_amount: 1500,
      source_ticket_amount: 20000,
      ticket_gratuity_amount: 2500,
    },
    notes: null,
    paymentStatus: "pending_payment",
    serviceFee: 0,
    subtotalAmount: 0,
    totalAmount: 24187.5,
  });

  assert.equal(financials.ticketValue, 20000);
  assert.equal(financials.ticketGratuityPaid, 2500);
  assert.equal(financials.barTabAmount, 1500);
  assert.equal(financials.barGratuityPaid, 187.5);
});
