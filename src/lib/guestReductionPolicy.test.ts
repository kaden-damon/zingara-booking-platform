import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { previewGuestReduction, readReductionAllocation, reductionAllocationSummary, type GuestReductionBasis } from "./guestReductionPolicy.ts";
import { resolveCorporateFunctionBriefFinancials } from "./corporateFunctionBriefFinancials.ts";
import { buildAuthoritativeBookingInvoiceDraft } from "./xero/bookingInvoice.ts";
import { calculateTablePlanFinancialBreakdown } from "./exports/tablePlanFinance.ts";

const basis: GuestReductionBasis = {
  bookingKind: "corporate", guestCount: 80, ticketAmount: 123200,
  gratuityAmount: 15400, barTabAmount: 0, otherAmount: 0, totalAmount: 138600, amountPaid: 138600,
  performanceDate: "2026-12-12", performanceTime: "17:00:00", blockedReason: null,
};
const early = new Date("2026-12-05T15:00:00Z");
const late = new Date("2026-12-05T15:00:01Z");
const notes = (a: unknown) => "__zingara_booking_meta__:" + JSON.stringify({valueAllocation:a});

test("Corporate late reduction forfeits removed tickets AND their gratuity, not remaining gratuity", () => {
  const a = previewGuestReduction(basis,71,"review-refund",late)!;
  assert.equal(a.forfeitedAmount,13860);
  assert.equal(a.gratuityForfeitedAmount,1732.5);
  assert.equal(a.ticketGratuityAmount,13667.5);
  assert.equal(a.gratuityTransferred,0);
  assert.equal(a.refundReviewAmount,0);
  assert.equal(a.gratuityReviewAmount,0);
  assert.equal(a.barTabAmount,0);
  assert.equal(a.manualResolutionRequired,false);
});

test("Corporate exact cutoff retains eligible refund treatment, never moves gratuity to bar", () => {
  const a=previewGuestReduction(basis,71,"bar-credit",early)!;
  assert.equal(a.fullRefundWindow,true);
  assert.equal(a.forfeitedAmount,0);
  assert.equal(a.barCreditAmount,13860);
  assert.equal(a.gratuityForfeitedAmount,0);
  assert.equal(a.gratuityRefundEligibleAmount,1732.5);
  assert.equal(a.refundReviewAmount,1732.5);
  assert.equal(a.ticketGratuityAmount,13667.5);
});

test("Standard exact five-day cutoff and one second late use R550 per cancelled guest", () => {
  const b={...basis,bookingKind:"standard" as const,guestCount:10,ticketAmount:12500,gratuityAmount:0,totalAmount:12500,amountPaid:12500};
  const a=previewGuestReduction(b,8,"review-refund",new Date("2026-12-07T15:00:00Z"))!;
  const l=previewGuestReduction(b,8,"bar-credit",new Date("2026-12-07T15:00:01Z"))!;
  assert.equal(a.forfeitedAmount,0);
  assert.equal(a.refundReviewAmount,2500);
  assert.equal(l.forfeitedAmount,1100);
  assert.equal(l.barCreditAmount,1400);
  assert.equal(l.barTabAmount,1400);
});

test("Standard historical prepaid gratuity is preserved proportionately with unresolved portion held", () => {
  const a=previewGuestReduction({...basis,bookingKind:"standard"},71,"review-refund",late)!;
  assert.equal(a.gratuityReviewAmount,1732.5);
  assert.equal(a.ticketGratuityAmount,13667.5);
  assert.equal(a.gratuityForfeitedAmount,0);
});

test("verified native R550 deposits never create bar/refund credit from unpaid ticket value", () => {
  const b={...basis,bookingKind:"standard" as const,gratuityAmount:0,ticketAmount:123200,otherAmount:10,totalAmount:123210,depositOnly:true,amountPaid:44000};
  for (const disposition of ["bar-credit","review-refund"] as const) {
    const a=previewGuestReduction(b,71,disposition,new Date("2026-12-01T00:00:00Z"))!;
    assert.equal(a.releasedTicketValue,13860);
    assert.equal(a.releasedUnpaidAmount,8910);
    assert.equal(a.eligibleTicketAmount,4950);
    assert.equal(a.barCreditAmount+a.refundReviewAmount,4950);
    assert.equal(a.totalRetainedValue,114300);
    assert.equal(a.newOutstanding,70300);
    assert.equal(a.ticketPaidAmount,39050);
  }
  const late=previewGuestReduction(b,71,"review-refund",new Date("2026-12-12T00:00:00Z"))!;
  assert.equal(late.forfeitedAmount,4950);
  assert.equal(late.refundReviewAmount,0);
  assert.equal(late.barCreditAmount,0);
});

test("every allocation reconciles retained value to exact cents with no duplicate bar/refund", () => {
  for(const kind of ["standard","corporate"] as const) for(const date of [early,late,new Date("2026-12-12T15:00:00Z")]) {
    for(const count of [1,23,71,79]) for(const disposition of ["bar-credit","review-refund"] as const) {
      const a=previewGuestReduction({...basis,bookingKind:kind},count,disposition,date)!;
      const total=a.ticketAmount+a.ticketGratuityAmount+a.gratuityReviewAmount+a.gratuityForfeitedAmount+a.forfeitedAmount+a.refundReviewAmount+a.barTabAmount+a.otherAmount;
      assert.equal(Math.round(total*100),13860000);
      assert.equal(a.barCreditAmount + a.refundReviewAmount - a.gratuityRefundEligibleAmount,a.eligibleTicketAmount);
    }
  }
});

test("Buyout, ambiguous historical and partially paid bases are not automatically repriced", () => {
  for(const blockedReason of ["Buyout: fixed contract", "Existing allocation", "Deposit arrangement"]) {
    assert.equal(previewGuestReduction({...basis,blockedReason},71),null);
  }
  for(const n of [0,-1,2.5,80,81,NaN]) assert.equal(previewGuestReduction(basis,n),null);
});

test("Function Brief uses current allocations while immutable original evidence remains unchanged", () => {
  const a={...previewGuestReduction(basis,71,"review-refund",late)!,policyApplied:true};
  const evidence={source_ticket_amount:123200,ticket_gratuity_amount:15400,bar_tab_paid_amount:0,bar_gratuity_amount:0};
  const f=resolveCorporateFunctionBriefFinancials({addonsTotal:0,amountPaid:138600,bookingOrigin:"data_import",bookingStatus:"confirmed",discountAmount:0,evidence,
    notes:notes(a),paymentStatus:"fully_paid",serviceFee:0,subtotalAmount:138600,totalAmount:138600});
  assert.equal(f.ticketGratuityPaid,13667.5);
  assert.equal(f.ticketValue,109340);
  assert.equal(f.barTabAmount,0);
  assert.match(f.reductionSummary!,/forfeited gratuity R1732.50/);
  assert.equal(evidence.ticket_gratuity_amount,15400);
});

test("native and imported Table Plan allocation receipts reconcile without extra gratuity or negative balances", () => {
  for (const origin of ["admin_staff","data_import"]) {
    const a={...previewGuestReduction(basis,71,"review-refund",late)!,policyApplied:true,paymentMethod:"unknown" as const};
    const f=calculateTablePlanFinancialBreakdown({bookingOrigin:origin,confirmedPaidAmount:138600,guestCount:71,paymentStatus:"fully_paid",totalAmount:138600,valueAllocation:a},[]);
    assert.equal(f.toPay,0);
    assert.equal(f.ticketGratuityAmount,13667.5);
    assert.equal(f.barTabPaidAmount,0);
    assert.equal(f.methodUnknownPaid+f.ticketGratuityAmount,138600);
  }
  const a={...previewGuestReduction({...basis,bookingKind:"standard",gratuityAmount:0,ticketAmount:123200,otherAmount:10,totalAmount:123210,depositOnly:true,amountPaid:44000},71,"review-refund",new Date("2026-12-12T00:00:00Z"))!,policyApplied:true,paymentMethod:"unknown" as const};
  const f=calculateTablePlanFinancialBreakdown({bookingOrigin:"admin_staff",confirmedPaidAmount:44000,guestCount:71,paymentStatus:"deposit_paid",totalAmount:114300,valueAllocation:a},[]);
  assert.equal(f.toPay,70290);
  assert.equal(f.methodUnknownPaid,44000);
});

test("legacy bar allocations are reflected correctly without rewriting them", () => {
  const f=resolveCorporateFunctionBriefFinancials({addonsTotal:0,amountPaid:138600,discountAmount:0,notes:notes({ticketAmount:109340,ticketGratuityAmount:0,barTabAmount:29260}),serviceFee:0,subtotalAmount:138600,totalAmount:138600,evidence:{source_ticket_amount:123200,ticket_gratuity_amount:15400}});
  assert.equal(f.ticketGratuityPaid,0);
  assert.equal(f.barTabAmount,29260);
});

test("allocation reporting rejects invalid money and accounting cannot silently invoice retained sums as tickets", () => {
  const a={...previewGuestReduction(basis,71,"review-refund",late)!,policyApplied:true};
  assert.match(reductionAllocationSummary(notes(a)),/remaining gratuity R13667.50/);
  assert.equal(readReductionAllocation(notes({...a,forfeitedAmount:"bad"})),null);
  assert.throws(()=>buildAuthoritativeBookingInvoiceDraft({addonsTotal:0,bookingReference:"TEST",bookingNotes:notes(a),discountAmount:0,revenueCategory:"corporate",serviceFee:0,subtotalAmount:138600,totalAmount:138600}),/Accounts must reconcile/);
});

test("server transaction protects permissions, revisions, locks, idempotency and preview boundary", async () => {
  const sql=await readFile(new URL("../../supabase/migrations/20261123150000_guest_reduction_cancellation_policy.sql",import.meta.url),"utf8");
  for(const marker of ["RECONCILIATION_PERMISSION_REQUIRED","booking_edit_locks","for update","for share","BOOKING_REVISION_CHANGED","p_expected_preview","request_id=p_request_id","GUEST_REDUCTION_POLICY_REVIEW_REQUIRED","gratuity_forfeited:=cancelled_gratuity","refund_status"]) assert.ok(sql.includes(marker),marker);
  assert.doesNotMatch(sql,/(update|delete from|insert into) public\.(payments|payment_refunds|legacy_booking_payment_evidence|xero_documents)\b/i);
  assert.match(sql,/raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end/);
});

test("public checkout discloses deadlines and Buyout exclusions before payment", async () => {
  const component=await readFile(new URL("../app/components/CancellationPolicyNotice.tsx",import.meta.url),"utf8");
  for(const text of ["5 days","7 days","R550","prepaid gratuity","bar credit","Buyouts"]) assert.ok(component.includes(text));
  for(const path of ["../app/book/page.tsx","../app/corporate/payment/page.tsx","../app/payment/[token]/payment-link-client.tsx"]) {
    assert.match(await readFile(new URL(path,import.meta.url),"utf8"),/<CancellationPolicyNotice/);
  }
});
