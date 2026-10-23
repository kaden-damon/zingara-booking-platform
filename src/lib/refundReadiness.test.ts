import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRefundEligibilityRows } from "./refundReadiness.ts";

const booking = (overrides: Record<string, unknown> = {}) => ({
  amount_paid: 100,
  booking_reference: "ZNG-REFUND",
  booking_status: "confirmed",
  id: "booking-1",
  payment_status: "fully_paid",
  ...overrides,
});
const payment = (overrides: Record<string, unknown> = {}) => ({
  amount: 100,
  booking_id: "booking-1",
  ...overrides,
});

test("refund readiness preserves single-provider-payment eligibility", () => {
  const rows = buildRefundEligibilityRows({
    bookings: [booking()],
    payments: [payment()],
    readinessReason: "",
    ready: true,
    refunds: [],
  });

  assert.deepEqual(rows, [
    { bookingReference: "ZNG-REFUND", eligible: true, reason: null },
  ]);
});

test("refund readiness remains fail-closed for multiple payments and active refunds", () => {
  const multiple = buildRefundEligibilityRows({
    bookings: [booking()],
    payments: [payment({ amount: 50 }), payment({ amount: 50 })],
    readinessReason: "",
    ready: true,
    refunds: [],
  });
  assert.equal(multiple[0].eligible, false);
  assert.match(multiple[0].reason ?? "", /multi-transaction/);

  const reconciliation = buildRefundEligibilityRows({
    bookings: [booking()],
    payments: [payment()],
    readinessReason: "",
    ready: true,
    refunds: [
      { booking_id: "booking-1", refund_status: "reconciliation_required" },
    ],
  });
  assert.equal(reconciliation[0].eligible, false);
  assert.match(reconciliation[0].reason ?? "", /requires reconciliation/);
});

test("refund readiness route paginates payments and bounds booking filters", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/refund/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /readinessPageSize = 1000/);
  assert.match(route, /readinessBatchConcurrency = 4/);
  assert.match(route, /\.range\(from, to\)/);
  assert.match(route, /bookings!inner/);
  assert.doesNotMatch(route, /\.in\("id", bookingIds\)/);
  assert.doesNotMatch(route, /\.in\("booking_id", bookingIds\)/);
});
