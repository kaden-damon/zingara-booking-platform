import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewGuestReduction, type GuestReductionBasis } from "./guestReductionPolicy.ts";
import { resolveCorporateFunctionBriefFinancials } from "./corporateFunctionBriefFinancials.ts";
import { calculateTablePlanFinancialBreakdown } from "./exports/tablePlanFinance.ts";

const basis: GuestReductionBasis = {
  bookingKind: "standard", guestCount: 15, ticketAmount: 18740,
  gratuityAmount: 2344, barTabAmount: 0, otherAmount: 10, totalAmount: 21094,
  amountPaid: 8250, performanceDate: "2026-12-01", performanceTime: "17:00:00", blockedReason: null,
};
const early = new Date("2026-11-26T10:00:00Z");
const late = new Date("2026-12-01T10:00:00Z");

test("BUG39 reported deposit reduction releases unpaid charges, not imaginary refunds", () => {
  const a = previewGuestReduction(basis, 14, "review-refund", early)!;
  assert.equal(a.totalRetainedValue, 19688.40);
  assert.equal(a.newOutstanding, 11438.40);
  assert.equal(a.refundReviewAmount, 0);
  assert.equal(a.manualResolutionRequired, false);
  assert.equal(a.gratuityReviewAmount, 0);
  assert.equal(a.ticketGratuityAmount, 2187.73);
});

for (const bookingKind of ["standard", "corporate"] as const) {
  for (const amountPaid of [0, 550, 8250, 20000, 21094]) {
    for (const now of [early, late]) {
      test(`${bookingKind} receipts ${amountPaid}, ${now === early ? "early" : "late"}: allocations reconcile`, () => {
        const b = { ...basis, bookingKind, performanceDate: "2026-12-04", amountPaid };
        const a = previewGuestReduction(b, 14, "bar-credit", now)!;
        const total = a.ticketAmount + a.ticketGratuityAmount + a.gratuityReviewAmount +
          a.gratuityForfeitedAmount + a.forfeitedAmount + a.refundReviewAmount + a.barTabAmount + a.otherAmount;
        assert.equal(Math.round(total * 100), Math.round(a.totalRetainedValue * 100));
        assert.equal(a.newOutstanding, Math.round((a.totalRetainedValue - amountPaid) * 100) / 100);
        assert.ok(a.barCreditAmount + a.refundReviewAmount <= amountPaid);
        assert.ok(a.ticketPaidAmount + a.ticketGratuityPaidAmount <= amountPaid);
        assert.ok(a.ticketPaidAmount <= a.ticketAmount);
        if (amountPaid === 0) {
          assert.equal(a.barCreditAmount, 0);
          assert.equal(a.gratuityForfeitedAmount, 0);
          assert.equal(a.manualResolutionRequired, false);
        }
        if (now === late && bookingKind === "corporate") {
          assert.equal(a.forfeitedAmount, a.releasedTicketValue);
          assert.equal(a.barCreditAmount, 0);
          assert.equal(a.refundReviewAmount, 0);
        }
      });
    }
  }
}

test("unpaid gratuity is not reported as collected on the Function Brief", () => {
  const a = { ...previewGuestReduction({ ...basis, amountPaid: 0 }, 14, "review-refund", early)!, policyApplied: true };
  const result = resolveCorporateFunctionBriefFinancials({
    addonsTotal: 0, amountPaid: 0, discountAmount: 0, serviceFee: 2344,
    subtotalAmount: 21094, totalAmount: a.totalRetainedValue,
    notes: "__zingara_booking_meta__:" + JSON.stringify({ valueAllocation: a }),
  });
  assert.equal(result.ticketGratuityPaid, 0);
  assert.equal(result.fullPaymentAmount, 0);
  const tablePlan = calculateTablePlanFinancialBreakdown({
    bookingOrigin: "admin_staff", confirmedPaidAmount: 0, guestCount: 14,
    paymentStatus: "pending_payment", totalAmount: a.totalRetainedValue,
    valueAllocation: { ...a, paymentMethod: "unknown" },
  }, []);
  assert.equal(tablePlan.totalPaid, 0);
  assert.equal(tablePlan.ticketGratuityAmount, 0);
});

test("migration patches only existing guarded functions and revokes stale payment links", () => {
  const sql = readFileSync("supabase/migrations/20261126110000_partial_payment_guest_reductions.sql", "utf8");
  for (const marker of ["GUEST_REDUCTION_BASIS_DRIFT", "GUEST_REDUCTION_TRANSACTION_DRIFT", "booking_payment_links", "b.amount_paid > b.total_amount", "balance_outstanding is distinct", "released-forfeited"]) assert.ok(sql.includes(marker), marker);
  assert.doesNotMatch(sql, /(?:update|insert into|delete from)\s+public\.(?:payments|payment_refunds|legacy_booking_payment_evidence|staff_profiles)\b/i);
  assert.doesNotMatch(sql, /grant execute|create table|alter table|enforce_full_payment_ticket_issuance/);
});
