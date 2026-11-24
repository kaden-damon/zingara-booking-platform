import assert from "node:assert/strict";
import test from "node:test";
import { confirmGuestReductionComponents, previewGuestReduction, type GuestReductionBasis } from "./guestReductionPolicy.ts";

const basis: GuestReductionBasis = {
  bookingKind: "corporate", guestCount: 12, ticketAmount: 19430, gratuityAmount: 0,
  barTabAmount: 0, otherAmount: 10, totalAmount: 19440, amountPaid: 19440,
  performanceDate: "2026-12-02", performanceTime: "17:00:00",
  blockedReason: "Confirm invoice", componentConfirmationRequired: true,
};
// Explicit staff-confirmed example, not an inferred split or a live amendment.
const components = { ticketAmount: 14960, gratuityAmount: 2040, barTabAmount: 2440,
  otherAmount: 0, sourceDocument: "Reviewed invoice reference", confirmed: true };

test("reviewed Corporate split permits an eligible 12-to-11 bar transfer without repricing", () => {
  const confirmed = confirmGuestReductionComponents(basis, components)!;
  const a = previewGuestReduction(confirmed, 11, "bar-credit", new Date("2026-11-24T10:00:00Z"))!;
  assert.equal(a.barCreditAmount, 1246.67);
  assert.equal(a.barTabAmount, 3686.67);
  assert.equal(a.ticketGratuityAmount, 1870);
  assert.equal(a.gratuityRefundEligibleAmount, 170);
  assert.equal(a.refundReviewAmount, 170);
  assert.equal(a.totalRetainedValue, 19440);
  assert.equal(a.newOutstanding, 0);
  assert.deepEqual(a.confirmedComponents, components);
  assert.equal(basis.blockedReason, "Confirm invoice");
});

test("confirmed components retain exact seven-day boundary and late forfeiture", () => {
  const confirmed = confirmGuestReductionComponents(basis, components)!;
  const at = previewGuestReduction(confirmed, 11, "bar-credit", new Date("2026-11-25T15:00:00Z"))!;
  const late = previewGuestReduction(confirmed, 11, "review-refund", new Date("2026-11-25T15:00:01Z"))!;
  assert.equal(at.barCreditAmount, 1246.67);
  assert.equal(late.barCreditAmount, 0);
  assert.equal(late.forfeitedAmount, 1246.67);
  assert.equal(late.gratuityForfeitedAmount, 170);
  assert.equal(late.ticketGratuityAmount, 1870);
  assert.equal(late.barTabAmount, 2440);
});

test("missing, unconfirmed, negative, non-cent or mismatched invoice values cannot enable allocation", () => {
  for (const input of [undefined, null, {}, { ...components, confirmed: false },
    { ...components, sourceDocument: " " }, { ...components, sourceDocument: "x".repeat(501) },
    { ...components, ticketAmount: 0 }, { ...components, otherAmount: -1 },
    { ...components, gratuityAmount: NaN }, { ...components, gratuityAmount: "2040" },
    { ...components, gratuityAmount: 2040.001 }, { ...components, barTabAmount: 2441 }]) {
    assert.equal(confirmGuestReductionComponents(basis, input), null);
  }
});

test("no override of existing components, Buyouts, refunds or other blocked bases", () => {
  for (const blockedReason of [null, "Buyout: fixed terms", "Existing refund", "Existing allocation"]) {
    const b = { ...basis, blockedReason, componentConfirmationRequired: false };
    assert.equal(confirmGuestReductionComponents(b, components), null);
    assert.equal(confirmGuestReductionComponents(b, undefined), b);
  }
  assert.equal(confirmGuestReductionComponents({ ...basis, bookingKind: "standard" }, components), null);
});
