import assert from "node:assert/strict";
import test from "node:test";
import { previewGuestReduction, readReductionAllocation, type GuestReductionBasis } from "./guestReductionPolicy.ts";

const basis: GuestReductionBasis = {
  bookingKind: "standard", guestCount: 12, ticketAmount: 17270,
  gratuityAmount: 0, barTabAmount: 0, otherAmount: 10, totalAmount: 17280,
  amountPaid: 6600, depositOnly: true, blockedReason: null,
  performanceDate: "2026-12-13", performanceTime: "17:00:00",
};
const early = new Date("2026-11-26T10:00:00Z");
test("reference split reallocates paid deposit reserves without inventing receipts or removing its saved fee", () => {
  const a = previewGuestReduction(basis, 9, "outstanding-balance", early)!;
  assert.equal(a.ticketAmount, 12952.5);
  assert.equal(a.ticketPaidAmount, 6600);
  assert.equal(a.ticketAmount - a.ticketPaidAmount, 6352.5);
  assert.equal(a.outstandingBalanceAllocationAmount, 1650);
  assert.equal(a.totalRetainedValue, 12962.5);
  assert.equal(a.newOutstanding, 6362.5);
  assert.equal(a.refundReviewAmount, 0);
  assert.equal(a.manualResolutionRequired, false);
});
for (const [bookingKind, days] of [["standard", 5], ["corporate", 7]] as const) {
  test(`${bookingKind}: exact boundary permitted; one second late cannot allocate forfeitures`, () => {
    const cutoff = new Date(`2026-12-${String(13 - days).padStart(2, "0")}T15:00:00Z`);
    const b = { ...basis, bookingKind };
    assert.ok(previewGuestReduction(b, 9, "outstanding-balance", cutoff));
    assert.equal(previewGuestReduction(b, 9, "outstanding-balance", new Date(+cutoff + 1000)), null);
  });
}
test("allocation stops at balance; excess remains refundable and original receipts reconcile", () => {
  const b = { ...basis, ticketAmount: 7200, totalAmount: 7210 };
  const a = previewGuestReduction(b, 9, "outstanding-balance", early)!;
  assert.equal(a.outstandingBalanceAllocationAmount, 460);
  assert.equal(a.newOutstanding, 0);
  assert.equal(a.refundReviewAmount, 1190);
  assert.equal(a.totalRetainedValue, 6600);
  assert.equal(a.ticketPaidAmount, 5400);
  assert.equal(a.ticketPaidAmount + a.refundReviewAmount + a.otherAmount, 6600);
  assert.equal(a.manualResolutionRequired, true);
});
test("no allocation without eligible paid funds or an outstanding balance", () => {
  for (const b of [{ ...basis, depositOnly: false, amountPaid: 0 },
    { ...basis, depositOnly: false, amountPaid: 17280 },
    { ...basis, depositOnly: false, amountPaid: 6000 },
    { ...basis, blockedReason: "Buyout: separate contract" }]) {
    assert.equal(previewGuestReduction(b, 9, "outstanding-balance", early), null);
  }
});
test("refund and bar choices retain their existing values", () => {
  const refund = previewGuestReduction(basis, 9, "review-refund", early)!;
  const bar = previewGuestReduction(basis, 9, "bar-credit", early)!;
  assert.equal(refund.refundReviewAmount, 1650);
  assert.equal(bar.barCreditAmount, 1650);
  assert.equal(refund.newOutstanding, 8012.5);
  assert.equal(bar.newOutstanding, 8012.5);
});

test("persisted allocation rejects invalid balance amounts without breaking old records", () => {
  const a = { ...previewGuestReduction(basis, 9, "outstanding-balance", early), policyApplied: true };
  const parse = (v: unknown) => readReductionAllocation("__zingara_booking_meta__:" + JSON.stringify({ valueAllocation: v }));
  assert.ok(parse(a));
  assert.ok(parse({ ...a, outstandingBalanceAllocationAmount: undefined }));
  for (const value of [-1, "1650", null]) assert.equal(parse({ ...a, outstandingBalanceAllocationAmount: value }), null);
});
