import { resolveBookingCancellationPolicy } from "./bookingManagementPolicy.ts";

export type GuestReductionBasis = {
  bookingKind: "standard" | "corporate";
  performanceDate: string;
  performanceTime: string;
  guestCount: number;
  ticketAmount: number;
  gratuityAmount: number;
  barTabAmount: number;
  otherAmount: number;
  totalAmount: number;
  blockedReason: string | null;
  depositOnly?: boolean;
  amountPaid: number;
  componentConfirmationRequired?: boolean;
  preserveFinancials?: boolean;
  componentRecoverySource?: string | null;
  contractComponentsKnown?: boolean;
  confirmedComponents?: GuestReductionComponents;
  operationalAuthority?: boolean;
  operationalException?: { waivePenalty: boolean; transferGratuity: boolean };
  retainedAmounts?: { forfeitedAmount: number; gratuityForfeitedAmount: number; refundReviewAmount: number; gratuityReviewAmount: number };
};

export type GuestReductionComponents = {
  ticketAmount: number;
  gratuityAmount: number;
  barTabAmount: number;
  otherAmount: number;
  sourceDocument: string;
  confirmed: true;
};

export const corporateComponentsMissing = "The Corporate quote must establish separate ticket and gratuity components before allocation.";

// Only the missing Corporate breakdown can be resolved here; other guards remain.
export function confirmGuestReductionComponents(basis: GuestReductionBasis, input: unknown): GuestReductionBasis | null {
  if (!basis.componentConfirmationRequired || basis.bookingKind !== "corporate") return input === undefined ? basis : null;
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const fields = ["ticketAmount", "gratuityAmount", "barTabAmount", "otherAmount"] as const;
  if (c.confirmed !== true || typeof c.sourceDocument !== "string" || !c.sourceDocument.trim() || c.sourceDocument.trim().length > 500 ||
    fields.some(key => typeof c[key] !== "number" || !Number.isFinite(c[key]) || (c[key] as number) < 0 ||
      !Number.isSafeInteger(Math.round((c[key] as number) * 100)) || Math.abs((c[key] as number) * 100 - Math.round((c[key] as number) * 100)) > 0.000001) ||
    (c.ticketAmount as number) <= 0 || fields.reduce((sum, key) => sum + Math.round((c[key] as number) * 100), 0) !== Math.round(basis.totalAmount * 100)) return null;
  const confirmedComponents: GuestReductionComponents = {
    ticketAmount: c.ticketAmount as number, gratuityAmount: c.gratuityAmount as number,
    barTabAmount: c.barTabAmount as number, otherAmount: c.otherAmount as number,
    sourceDocument: c.sourceDocument.trim(), confirmed: true,
  };
  return { ...basis, ...confirmedComponents, blockedReason: null, confirmedComponents };
}

export type GuestReductionDisposition = "review-refund" | "bar-credit" | "outstanding-balance";
const cents = (n: number) => Math.round(n * 100);

export function previewGuestReduction(
  basis: GuestReductionBasis,
  newGuestCount: number,
  disposition: GuestReductionDisposition = "review-refund",
  now = new Date(),
) {
  if (basis.preserveFinancials || basis.blockedReason || !Number.isFinite(basis.amountPaid) || basis.amountPaid < 0 ||
    basis.amountPaid > basis.totalAmount || !Number.isInteger(newGuestCount) || newGuestCount < 1 ||
    newGuestCount >= basis.guestCount) return null;
  const removed = basis.guestCount - newGuestCount;
  const released = cents(basis.ticketAmount) - Math.round(cents(basis.ticketAmount) * newGuestCount / basis.guestCount);
  const remainingGratuity = Math.round(cents(basis.gratuityAmount) * newGuestCount / basis.guestCount);
  const gratuityReview = cents(basis.gratuityAmount) - remainingGratuity;
  const policy = resolveBookingCancellationPolicy({
    bookingKind: basis.bookingKind, depositAmount: 550 * removed,
    manualReceiptAmount: released / 100, now, payments: [], refunds: [],
    performanceDate: basis.performanceDate, performanceTime: basis.performanceTime,
    totalAmount: released / 100,
  });
  const exception = basis.operationalAuthority ? basis.operationalException : undefined;
  const penaltyWaived = exception?.waivePenalty === true;
  const forfeited = penaltyWaived ? 0 : cents(policy.forfeitedAmount);
  const outstanding = Math.max(0, cents(basis.totalAmount) - cents(basis.amountPaid));
  // Release outstanding obligations first; a balance is not a paid refund/credit.
  const releasedUnpaid = basis.depositOnly ? released - 55000 * removed : Math.min(outstanding, released - forfeited);
  const releasedPaid = released - releasedUnpaid;
  const unpaidGratuity = basis.depositOnly ? 0 : Math.min(gratuityReview, Math.max(0, outstanding - releasedUnpaid));
  const paidGratuity = gratuityReview - unpaidGratuity;
  const eligible = Math.max(0, releasedPaid - forfeited);
  const gratuityForfeited = basis.bookingKind === "corporate" && !policy.fullRefundWindow && !penaltyWaived ? paidGratuity : 0;
  const gratuityRefundEligible = basis.bookingKind === "corporate" && (policy.fullRefundWindow || penaltyWaived) ? paidGratuity : 0;
  const transferredGratuity = disposition === "bar-credit" && exception?.transferGratuity && (policy.fullRefundWindow || penaltyWaived) ? paidGratuity : 0;
  const unresolvedGratuity = paidGratuity - gratuityForfeited - gratuityRefundEligible - (basis.bookingKind === "standard" ? transferredGratuity : 0);
  const ticketCredit = disposition === "bar-credit" ? eligible : 0;
  const barCredit = ticketCredit + transferredGratuity;
  const retainedOutstanding = Math.max(0, outstanding - releasedUnpaid - unpaidGratuity);
  if (disposition === "outstanding-balance" && ((!policy.fullRefundWindow && !penaltyWaived) || retainedOutstanding <= 0 || eligible <= 0)) return null;
  const balanceAllocation = disposition === "outstanding-balance" ? Math.min(eligible, retainedOutstanding) : 0;
  return {
    ...(basis.confirmedComponents ? { confirmedComponents: basis.confirmedComponents } : {}),
    ...(exception ? { operationalException: exception } : {}),
    version: 1,
    previousGuestCount: basis.guestCount, guestCount: newGuestCount,
    bookingKind: basis.bookingKind, cutoffAt: policy.cutoffAt,
    fullRefundWindow: policy.fullRefundWindow,
    disposition,
    ticketAmount: (cents(basis.ticketAmount) - released) / 100,
    ticketPaidAmount: (basis.depositOnly ? Math.min(cents(basis.ticketAmount) - released, 55000 * newGuestCount + balanceAllocation) : Math.max(0, cents(basis.ticketAmount) - released - retainedOutstanding + balanceAllocation)) / 100,
    releasedTicketValue: released / 100,
    releasedUnpaidAmount: releasedUnpaid / 100,
    ticketGratuityAmount: remainingGratuity / 100,
    ticketGratuityPaidAmount: Math.max(0, remainingGratuity - Math.max(0, outstanding - releasedUnpaid - unpaidGratuity - cents(basis.ticketAmount) + released)) / 100,
    gratuityReviewAmount: unresolvedGratuity / 100 + (basis.retainedAmounts?.gratuityReviewAmount ?? 0),
    gratuityForfeitedAmount: gratuityForfeited / 100 + (basis.retainedAmounts?.gratuityForfeitedAmount ?? 0),
    gratuityRefundEligibleAmount: (gratuityRefundEligible - (basis.bookingKind === "corporate" ? transferredGratuity : 0)) / 100,
    gratuityTransferred: transferredGratuity / 100,
    forfeitedAmount: forfeited / 100 + (basis.retainedAmounts?.forfeitedAmount ?? 0),
    eligibleTicketAmount: eligible / 100,
    refundReviewAmount: (eligible - ticketCredit - balanceAllocation + gratuityRefundEligible - (basis.bookingKind === "corporate" ? transferredGratuity : 0)) / 100 + (basis.retainedAmounts?.refundReviewAmount ?? 0),
    outstandingBalanceAllocationAmount: balanceAllocation / 100,
    barCreditAmount: barCredit / 100,
    barTabAmount: (cents(basis.barTabAmount) + barCredit) / 100,
    otherAmount: basis.otherAmount,
    totalRetainedValue: (cents(basis.totalAmount) - releasedUnpaid - unpaidGratuity - balanceAllocation) / 100,
    newOutstanding: (retainedOutstanding - balanceAllocation) / 100,
    manualResolutionRequired: eligible > ticketCredit + balanceAllocation || unresolvedGratuity > 0 || gratuityRefundEligible > transferredGratuity || Number(basis.retainedAmounts?.refundReviewAmount) > 0 || Number(basis.retainedAmounts?.gratuityReviewAmount) > 0,
  };
}

export function readReductionAllocation(notes?: string | null) {
  const prefix = "__zingara_booking_meta__:";
  if (!notes?.startsWith(prefix)) return null;
  try {
    const metadata = JSON.parse(notes.slice(prefix.length));
    const a = metadata.valueAllocation;
    const fields = ["ticketAmount", "ticketGratuityAmount", "barTabAmount", "forfeitedAmount", "gratuityForfeitedAmount", "refundReviewAmount", "gratuityReviewAmount"];
    return a?.version === 1 && a?.policyApplied === true &&
      (a.outstandingBalanceAllocationAmount === undefined || typeof a.outstandingBalanceAllocationAmount === "number" && Number.isFinite(a.outstandingBalanceAllocationAmount) && a.outstandingBalanceAllocationAmount >= 0) && fields.every(
      (key) => typeof a[key] === "number" && Number.isFinite(a[key]) && a[key] >= 0,
    ) ? a as ReturnType<typeof previewGuestReduction> : null;
  } catch { return null; }
}

export function reductionAllocationSummary(notes?: string | null) {
  const a = readReductionAllocation(notes);
  if (!a) return "";
  return `Guest reduction: tickets R${a.ticketAmount.toFixed(2)}; remaining gratuity R${a.ticketGratuityAmount.toFixed(2)}; forfeited tickets R${a.forfeitedAmount.toFixed(2)}; forfeited gratuity R${a.gratuityForfeitedAmount.toFixed(2)}; bar R${a.barTabAmount.toFixed(2)}; refund review R${a.refundReviewAmount.toFixed(2)}; gratuity review R${a.gratuityReviewAmount.toFixed(2)}; unpaid ticket balance released R${(a.releasedUnpaidAmount ?? 0).toFixed(2)}${a.outstandingBalanceAllocationAmount ? `; allocated towards balance R${a.outstandingBalanceAllocationAmount.toFixed(2)}` : ""}. No automatic refund or additional gratuity charge.`;
}
