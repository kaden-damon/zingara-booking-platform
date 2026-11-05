import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShowCalendarFinancialSummaries,
  type ShowCalendarFinancialBooking,
} from "./showCalendarFinancials.ts";

function booking(
  input: Partial<ShowCalendarFinancialBooking> &
    Pick<ShowCalendarFinancialBooking, "id" | "showId">,
): ShowCalendarFinancialBooking {
  return {
    amountPaid: 0,
    archivedAt: null,
    balanceOutstanding: 0,
    bookingStatus: "confirmed",
    ...input,
  };
}

test("calendar finance uses authoritative booking balances and preserves genuine zero shows", () => {
  const summaries = buildShowCalendarFinancialSummaries(
    ["paid-show", "zero-show"],
    [
      booking({
        amountPaid: 18125,
        balanceOutstanding: 4400,
        id: "booking-1",
        showId: "paid-show",
      }),
      booking({
        bookingStatus: "cancelled",
        amountPaid: 99999,
        balanceOutstanding: 99999,
        id: "cancelled-booking",
        showId: "paid-show",
      }),
    ],
    [],
    [],
  );

  assert.deepEqual(summaries, [
    {
      credit: null,
      depositCount: 0,
      depositTotal: 0,
      paid: 18125,
      refunded: 0,
      showId: "paid-show",
      unpaid: 4400,
    },
    {
      credit: null,
      depositCount: 0,
      depositTotal: 0,
      paid: 0,
      refunded: 0,
      showId: "zero-show",
      unpaid: 0,
    },
  ]);
});

test("calendar finance counts only confirmed deposits and accepted refund evidence", () => {
  const [summary] = buildShowCalendarFinancialSummaries(
    ["show-a"],
    [
      booking({ id: "active", showId: "show-a" }),
      booking({
        bookingStatus: "refunded",
        id: "refunded",
        showId: "show-a",
      }),
    ],
    [
      {
        amount: 5500,
        bookingId: "active",
        paymentStatus: "deposit_paid",
        paymentType: "deposit",
      },
      {
        amount: 1100,
        bookingId: "active",
        paymentStatus: "pending_payment",
        paymentType: "deposit",
      },
      {
        amount: 2200,
        bookingId: "refunded",
        paymentStatus: "deposit_paid",
        paymentType: "deposit",
      },
    ],
    [
      {
        bookingId: "refunded",
        refundAmount: 2200,
        refundStatus: "accepted",
      },
      {
        bookingId: "active",
        refundAmount: 3300,
        refundStatus: "processing",
      },
    ],
  );

  assert.equal(summary.depositCount, 1);
  assert.equal(summary.depositTotal, 5500);
  assert.equal(summary.refunded, 2200);
  assert.equal(summary.credit, null);
});
