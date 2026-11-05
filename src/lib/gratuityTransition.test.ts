import assert from "node:assert/strict";
import test from "node:test";

import { resolveGratuityStatus } from "./gratuityTransition.ts";

test("identifies fully settled historical gratuity as collected", () => {
  assert.deepEqual(
    resolveGratuityStatus({
      amountPaid: 11_250,
      paymentStatus: "fully_paid",
      serviceFeeAmount: 1_250,
      totalAmount: 11_250,
    }),
    {
      amount: 1_250,
      kind: "collected",
      label: "GRATUITY COLLECTED: R1,250.00",
    },
  );
});

test("does not infer partial gratuity allocation", () => {
  const status = resolveGratuityStatus({
    amountPaid: 3_300,
    paymentStatus: "deposit_paid",
    serviceFeeAmount: 1_250,
    totalAmount: 11_250,
  });

  assert.equal(status.kind, "review");
  assert.match(status.label, /PAYMENT NOT FULLY SETTLED/);
});

test("new venue-paid policy never reports online collection", () => {
  assert.equal(
    resolveGratuityStatus({ gratuityPolicy: "pay-at-venue" }).label,
    "GRATUITY PAYABLE AT VENUE",
  );
});

test("explicit legacy evidence takes precedence", () => {
  assert.equal(
    resolveGratuityStatus({
      legacyCollectedAmount: 2_970,
      paymentStatus: "deposit_paid",
      serviceFeeAmount: 0,
    }).label,
    "GRATUITY COLLECTED: R2,970.00",
  );
});

test("cancelled and refunded financial histories require review", () => {
  assert.match(
    resolveGratuityStatus({
      amountPaid: 11_250,
      bookingStatus: "cancelled",
      paymentStatus: "fully_paid",
      serviceFeeAmount: 1_250,
      totalAmount: 11_250,
    }).label,
    /CANCELLATION OR REFUND HISTORY/,
  );
});
