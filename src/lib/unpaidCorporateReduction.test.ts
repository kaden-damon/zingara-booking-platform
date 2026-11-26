import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewGuestReduction, type GuestReductionBasis } from "./guestReductionPolicy.ts";

const basis: GuestReductionBasis = {
  bookingKind: "corporate", guestCount: 60, ticketAmount: 86400,
  gratuityAmount: 10800, barTabAmount: 0, otherAmount: 0, totalAmount: 97200,
  amountPaid: 0, performanceDate: "2027-02-27", performanceTime: "17:00:00", blockedReason: null,
};
const early = new Date("2026-11-26T11:00:00Z");

test("Meditech original 60-to-20 quote releases R64800 unpaid, not a refund", () => {
  const p = previewGuestReduction(basis, 20, undefined, early)!;
  assert.equal(p.ticketAmount, 28800);
  assert.equal(p.ticketGratuityAmount, 3600);
  assert.equal(p.totalRetainedValue, 32400);
  assert.equal(p.newOutstanding, 32400);
  assert.equal(p.releasedUnpaidAmount, 57600);
  for (const field of ["refundReviewAmount", "eligibleTicketAmount", "barCreditAmount", "ticketPaidAmount", "ticketGratuityPaidAmount", "gratuityRefundEligibleAmount"] as const) assert.equal(p[field], 0, field);
  assert.equal(p.manualResolutionRequired, false);
});

test("missing or invalid payment evidence cannot silently mean fully paid", () => {
  for (const amountPaid of [undefined, null, NaN, -1, 97201]) {
    assert.equal(previewGuestReduction({ ...basis, amountPaid } as GuestReductionBasis, 20, undefined, early), null);
  }
});

test("partial and fully paid quotes preserve existing eligible-fund allocations", () => {
  for (const paid of [0, 10000, 33000, 80000, 97200]) {
    for (const disposition of ["review-refund", "bar-credit"] as const) {
      const p = previewGuestReduction({ ...basis, amountPaid: paid }, 20, disposition, early)!;
      assert.ok(p.refundReviewAmount + p.barCreditAmount <= paid);
      assert.equal(p.newOutstanding, Math.max(0, p.totalRetainedValue - paid));
      assert.equal(Math.round(100 * (p.ticketAmount + p.ticketGratuityAmount + p.refundReviewAmount + p.barTabAmount)), Math.round(100 * p.totalRetainedValue));
    }
  }
});

test("a saved quote already lowered without reducing guests must not be mistaken for the original quote", () => {
  const p = previewGuestReduction({ ...basis, totalAmount: 32400, ticketAmount: 21600 }, 20, undefined, early)!;
  assert.equal(p.newOutstanding, 10800);
  assert.notEqual(p.newOutstanding, 32400, "manual pricing repair must not be silently inferred");
});

test("unpaid persistence patch retains guards, receipts and historical rows", () => {
  const sql = readFileSync("supabase/migrations/20261126140000_unpaid_reduction_financial_components.sql", "utf8");
  assert.match(sql, /4f38a4b71037c73ce338f0f9ebfb2f86/);
  assert.match(sql, /early and b.amount_paid=0/);
  assert.match(sql, /serviceFeeAmount/);
  assert.match(sql, /then remaining_gratuity else service_fee/);
  assert.doesNotMatch(sql, /(?:insert into|delete from)\s+public\.|grant execute|create table|alter table/);
  assert.doesNotMatch(sql, /update\s+public\.(?:payments|payment_refunds|tickets|legacy_booking_payment_evidence)/);
});
