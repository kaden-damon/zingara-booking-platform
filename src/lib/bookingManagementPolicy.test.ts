import assert from "node:assert/strict";
import test from "node:test";

import {
  isGuestManageableStandardBooking,
  resolveBookingCancellationPolicy,
} from "./bookingManagementPolicy.ts";

const payment = (amount: number) => ({
  amount,
  id: `payment-${amount}`,
  method: "payfast",
  paymentStatus: "fully_paid",
  providerTransactionId: `provider-${amount}`,
  transactionFeeAmount: 10,
});

function standard(now: string, overrides = {}) {
  return resolveBookingCancellationPolicy({
    bookingKind: "standard",
    depositAmount: 2_000,
    now: new Date(now),
    payments: [payment(5_000)],
    performanceDate: "2026-10-10",
    performanceTime: "19:30:00",
    refunds: [],
    totalAmount: 5_000,
    ...overrides,
  });
}

test("standard cancellation before and exactly at five-day cutoff is full-refund eligible", () => {
  assert.equal(standard("2026-10-05T17:29:59.000Z").fullRefundWindow, true);
  assert.equal(standard("2026-10-05T17:30:00.000Z").refundableAmount, 5_000);
});

test("one second inside five days forfeits persisted deposit only", () => {
  const policy = standard("2026-10-05T17:30:01.000Z");
  assert.equal(policy.fullRefundWindow, false);
  assert.equal(policy.forfeitedAmount, 2_000);
  assert.equal(policy.refundableAmount, 3_000);
  assert.equal(policy.manualRefundRequired, true);
});

test("deposit-only payment inside five days produces no refund", () => {
  const policy = standard("2026-10-06T00:00:00.000Z", {
    payments: [payment(2_000)],
  });
  assert.equal(policy.forfeitedAmount, 2_000);
  assert.equal(policy.refundableAmount, 0);
});

test("no payment never fabricates a refund", () => {
  const policy = standard("2026-10-01T00:00:00.000Z", { payments: [] });
  assert.equal(policy.paidAmount, 0);
  assert.equal(policy.refundableAmount, 0);
});

test("accepted refund cannot be refunded twice", () => {
  const policy = standard("2026-10-01T00:00:00.000Z", {
    refunds: [{ amount: 5_000, status: "accepted" }],
  });
  assert.equal(policy.previousRefundAmount, 5_000);
  assert.equal(policy.refundableAmount, 0);
});

test("corporate exact seven-day cutoff is full and one second inside forfeits paid value", () => {
  const atCutoff = resolveBookingCancellationPolicy({
    bookingKind: "corporate",
    depositAmount: 4_000,
    now: new Date("2026-10-03T17:30:00.000Z"),
    payments: [payment(10_000)],
    performanceDate: "2026-10-10",
    performanceTime: "19:30:00",
    refunds: [],
    totalAmount: 10_000,
  });
  const inside = resolveBookingCancellationPolicy({
    ...{
      bookingKind: "corporate" as const,
      depositAmount: 4_000,
      payments: [payment(10_000)],
      performanceDate: "2026-10-10",
      performanceTime: "19:30:00",
      refunds: [],
      totalAmount: 10_000,
    },
    now: new Date("2026-10-03T17:30:01.000Z"),
  });
  assert.equal(atCutoff.refundableAmount, 10_000);
  assert.equal(inside.refundableAmount, 0);
  assert.equal(inside.forfeitedAmount, 10_000);
});

test("manual evidence and multiple payments require manual refund handling", () => {
  const policy = standard("2026-10-01T00:00:00.000Z", {
    manualReceiptAmount: 1_000,
    payments: [payment(2_000), payment(2_000)],
  });
  assert.equal(policy.paidAmount, 5_000);
  assert.equal(policy.manualRefundRequired, true);
  assert.equal(policy.automaticRefundEligible, false);
});

test("guest self-service is strict Standard public and future only", () => {
  const base = {
    bookingOrigin: "customer_public",
    bookingSource: "online",
    bookingStatus: "confirmed",
    corporateRequestId: null,
    now: new Date("2026-09-23T10:00:00.000Z"),
    paymentStatus: "fully_paid",
    performanceDate: "2026-10-10",
    performanceTime: "19:30:00",
  };
  assert.equal(isGuestManageableStandardBooking(base), true);
  assert.equal(
    isGuestManageableStandardBooking({ ...base, bookingOrigin: "corporate" }),
    false,
  );
  assert.equal(
    isGuestManageableStandardBooking({ ...base, bookingSource: "admin" }),
    false,
  );
  assert.equal(
    isGuestManageableStandardBooking({ ...base, performanceDate: "2026-01-01" }),
    false,
  );
});
