import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDineplanLegacyPayment,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./dineplanLegacyPaymentEvidence.ts";

test("maps ordinary numeric Dineplan payments to card prepayments", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 5_280,
    paymentAmount: 2_200,
    paymentNotes: "",
  });

  assert.equal(result.prePaidCardAmount, 2_200);
  assert.equal(result.fullCardAmount, 0);
});

test("uses explicit card evidence for a full ticket payment", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 10_560,
    paymentAmount: 11_880,
    paymentNotes:
      "Paid in full plus gratuity (R11,880), Tickets R10,560, Gratuity R1,320, ccard",
  });

  assert.equal(result.fullCardAmount, 10_560);
  assert.equal(result.ticketGratuityAmount, 1_320);
});

test("uses Aswin's convention for explicit full payment without card evidence", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 18_480,
    paymentAmount: 20_790,
    paymentNotes:
      "Invoice total R20,790, Tickets R18,480, Gratuity R2,310, paid in full",
  });

  assert.equal(result.fullEftAmount, 18_480);
  assert.equal(result.ticketGratuityAmount, 2_310);
});

test("maps an explicit EFT deposit without treating it as card", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 5_280,
    paymentAmount: 1_100,
    paymentNotes: "Deposit paid by EFT",
  });

  assert.equal(result.prePaidEftAmount, 1_100);
  assert.equal(result.prePaidCardAmount, 0);
});

test("keeps comp ticket value separate from bar and gratuity", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 47_700,
    paymentAmount: 0,
    paymentNotes:
      "Dinner and show comps. Paid a bar R15,000 plus bar gratuity R1,875 and show gratuity R5,962.50",
  });

  assert.equal(result.complimentary, true);
  assert.equal(result.complimentaryAmount, 47_700);
  assert.equal(result.barTabPaidAmount, 15_000);
  assert.equal(result.barGratuityAmount, 1_875);
  assert.equal(result.ticketGratuityAmount, 5_962.5);
  assert.equal(result.fullCardAmount + result.fullEftAmount, 0);
});

test("extracts tickets rather than invoice totals and never double counts", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 18_480,
    paymentAmount: 20_790,
    paymentNotes:
      "Invoice total: R20,790 Tickets: R18,480 Gratuity: R2,310 Paid in full",
  });
  const ticketReceipts =
    result.fullCardAmount +
    result.prePaidCardAmount +
    result.prePaidEftAmount +
    result.fullEftAmount;

  assert.equal(ticketReceipts, 18_480);
  assert.equal(result.ticketGratuityAmount, 2_310);
});

test("fails closed when a financial note proves no payment method", () => {
  const result = classifyDineplanLegacyPayment({
    advertisedTicketAmount: 0,
    paymentAmount: 0,
    paymentNotes: "Payment pending",
  });

  assert.equal(result.classificationReason, "payment_pending");
  assert.equal(
    result.fullCardAmount +
      result.prePaidCardAmount +
      result.prePaidEftAmount +
      result.fullEftAmount,
    0,
  );
});
