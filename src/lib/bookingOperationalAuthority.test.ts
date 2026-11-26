import assert from "node:assert/strict";
import test from "node:test";
import { bookingOperationalStaffIds, hasBookingOperationalAuthority, validateOperationalFinancialComponents } from "./bookingOperationalAuthority.ts";
import { previewGuestReduction, type GuestReductionBasis } from "./guestReductionPolicy.ts";
import { calculateAddedGuestFinancials, resolveAddedGuestPricingBasis } from "./addedGuestFinancials.ts";

test("only the eight verified active profiles receive commercial authority", () => {
  assert.equal(new Set(bookingOperationalStaffIds).size, 8);
  for (const id of bookingOperationalStaffIds) {
    assert.equal(hasBookingOperationalAuthority({ id, active: true }), true);
    assert.equal(hasBookingOperationalAuthority({ id, active: false }), false);
  }
  for (const id of ["db2f3649-040c-41de-b734-1ab9f0d814db", "Nomza", "Tao", "unrelated"]) {
    assert.equal(hasBookingOperationalAuthority({ id, active: true }), false);
  }
  assert.equal(hasBookingOperationalAuthority(null), false);
});

const components = { ticketAmount: 5760, gratuityAmount: 0, barTabAmount: 0, otherAmount: 0,
  forfeitedAmount: 0, gratuityForfeitedAmount: 0, refundReviewAmount: 0, gratuityReviewAmount: 0, discountAmount: 0 };
test("agreed financial components reconcile without inventing receipts", () => {
  assert.equal(validateOperationalFinancialComponents(components, 5760), true);
  for (const amount of [-1, NaN, Infinity, 0.001]) {
    assert.equal(validateOperationalFinancialComponents({ ...components, otherAmount: amount }, 5760), false);
  }
  assert.equal(validateOperationalFinancialComponents({ ...components, otherAmount: 10 }, 5760), false);
  assert.equal(validateOperationalFinancialComponents({ ...components, discountAmount: 100 }, 5660), true);
});

const basis: GuestReductionBasis = { bookingKind: "corporate", guestCount: 10, ticketAmount: 14400,
  gratuityAmount: 1800, barTabAmount: 0, otherAmount: 0, totalAmount: 16200, amountPaid: 16200,
  performanceDate: "2026-11-27", performanceTime: "17:00:00", blockedReason: null };
const late = new Date("2026-11-26T12:00:00Z");
test("direct commercial bar allocation includes only cancelled paid tickets and gratuity", () => {
  const original = previewGuestReduction(basis, 8, "bar-credit", late)!;
  assert.equal(original.forfeitedAmount, 2880);
  assert.equal(original.gratuityForfeitedAmount, 360);
  const a = previewGuestReduction({ ...basis, operationalAuthority: true,
    operationalException: { waivePenalty: true, transferGratuity: true } }, 8, "bar-credit", late)!;
  assert.equal(a.fullRefundWindow, false);
  assert.equal(a.forfeitedAmount, 0);
  assert.equal(a.gratuityForfeitedAmount, 0);
  assert.equal(a.barTabAmount, 3240);
  assert.equal(a.ticketGratuityAmount, 1440);
  assert.equal(a.refundReviewAmount, 0);
  assert.equal(a.gratuityRefundEligibleAmount, 0);
  assert.equal(a.totalRetainedValue, 16200);
});

test("unpaid commercial reductions never create paid bar credit", () => {
  const a = previewGuestReduction({ ...basis, amountPaid: 0, operationalAuthority: true,
    operationalException: { waivePenalty: true, transferGratuity: true } }, 8, "review-refund", late)!;
  assert.equal(a.barTabAmount, 0);
  assert.equal(a.refundReviewAmount, 0);
  assert.equal(a.gratuityTransferred, 0);
});

test("later guest increases reuse the saved net ticket and actual gratuity agreement", () => {
  const pricing = resolveAddedGuestPricingBasis({ metadata: { partySize: 4, operationalFinancialAgreement: components }, bookingOrigin: "data_import" });
  assert.equal(pricing.source, "staff-agreed");
  assert.equal(pricing.unitAmount, 1440);
  const a = calculateAddedGuestFinancials({ basis: pricing, currentGuestCount: 4, newGuestCount: 6, currentOutstanding: 5760 });
  assert.equal(a.additionalAmount, 2880);
});
