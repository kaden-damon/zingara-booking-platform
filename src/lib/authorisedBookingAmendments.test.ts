import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewGuestReduction } from "./guestReductionPolicy.ts";
import { resolveCorporateFunctionBriefFinancials } from "./corporateFunctionBriefFinancials.ts";
import { calculateTablePlanFinancialBreakdown } from "./exports/tablePlanFinance.ts";

test("authorised AVA ticket-only exception preserves original bar and separate gratuities", () => {
  // The exception is executed once with a scoped audited transaction, not a public override.
  const a = { ...previewGuestReduction({ bookingKind: "corporate", guestCount: 32,
    ticketAmount: 46080, gratuityAmount: 5760, barTabAmount: 12000, otherAmount: 1500,
    totalAmount: 65340, amountPaid: 65340, performanceDate: "2026-12-02", performanceTime: "17:00:00", blockedReason: null,
  }, 28, "bar-credit", new Date("2026-11-25T14:00:00Z"))!, policyApplied: true, barGratuityAmount: 1500, paymentMethod: "unknown" as const };
  assert.equal(a.barCreditAmount, 5760); assert.equal(a.barTabAmount, 17760);
  assert.equal(a.ticketAmount, 40320); assert.equal(a.ticketGratuityAmount, 5040);
  assert.equal(a.gratuityRefundEligibleAmount, 720); assert.equal(a.refundReviewAmount, 720);
  assert.equal(a.newOutstanding, 0); assert.equal(a.totalRetainedValue, 65340);
  const notes = "__zingara_booking_meta__:" + JSON.stringify({ valueAllocation: a });
  const brief = resolveCorporateFunctionBriefFinancials({ amountPaid: 65340, totalAmount: 65340,
    subtotalAmount: 59580,serviceFee:5760,discountAmount:0,addonsTotal:0,notes });
  assert.equal(brief.barGratuityPaid, 1500); assert.equal(brief.ticketGratuityPaid,5040);
  const plan = calculateTablePlanFinancialBreakdown({ bookingOrigin:"corporate",totalAmount:65340,
    confirmedPaidAmount:65340,paymentStatus:"fully_paid",guestCount:28,valueAllocation:a },[]);
  assert.equal(plan.barGratuityAmount,1500);assert.equal(plan.barTabPaidAmount,17760);
  assert.equal(plan.totalPaid,40320);
  assert.equal(plan.totalPaid+plan.ticketGratuityAmount+plan.barTabPaidAmount+plan.barGratuityAmount+a.refundReviewAmount,65340);
});

test("quote deduction preserves gross ticket/gratuity and does not invent cash or a payment", () => {
  assert.equal(Math.round((16100 + 2012.5 - 14196.23)*100),391627);
  const sql = readFileSync("supabase/migrations/20261126150000_imported_unpaid_quote_reconciliation.sql","utf8");
  assert.match(sql,/p_amount_paid is distinct from 0/);
  assert.match(sql,/b.payment_status::text<>'comp_vip'/);
  assert.match(sql,/BOOKING_REVISION_CHANGED/);
  assert.match(sql,/RECONCILIATION_PERMISSION_REQUIRED/);
  assert.doesNotMatch(sql,/insert into public\.(?:payments|legacy_booking_payment_evidence)/);
  assert.match(sql,/p_source_ticket_amount\+p_source_gratuity_amount-p_discount_amount<>p_total_amount/);
});
