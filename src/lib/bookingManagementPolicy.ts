export type ManagedBookingKind = "corporate" | "standard";

export type BookingManagementPayment = {
  amount: number;
  id: string;
  method: string | null;
  paymentStatus: string;
  providerGrossAmount?: number | null;
  providerTransactionId?: string | null;
  transactionFeeAmount?: number | null;
};

export type BookingManagementRefund = {
  amount: number;
  status: string;
};

export type BookingCancellationPolicyInput = {
  bookingFeeAmount?: number;
  bookingKind: ManagedBookingKind;
  depositAmount?: number | null;
  manualReceiptAmount?: number;
  now: Date;
  payments: BookingManagementPayment[];
  performanceDate: string;
  performanceTime: string;
  refunds: BookingManagementRefund[];
  totalAmount: number;
};

export type BookingCancellationPolicy = {
  automaticRefundEligible: boolean;
  bookingFeeAmount: number;
  bookingKind: ManagedBookingKind;
  cutoffAt: string;
  cutoffDays: number;
  depositAmount: number | null;
  feeTreatment: "existing-full-refund-path" | "manual-review" | "none";
  forfeitedAmount: number;
  fullRefundWindow: boolean;
  manualRefundRequired: boolean;
  paidAmount: number;
  performanceStartsAt: string;
  policySummary: string;
  previousRefundAmount: number;
  refundableAmount: number;
  refundState:
    | "automatic-full-refund-eligible"
    | "manual-refund-required"
    | "no-refund"
    | "refund-in-progress";
  transactionFeeAmount: number;
};

const successfulPaymentStatuses = new Set(["deposit_paid", "fully_paid"]);
const activeRefundStatuses = new Set([
  "accepted",
  "processing",
  "reconciliation_required",
]);

function money(value: number | null | undefined) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getPerformanceStart(
  performanceDate: string,
  performanceTime: string,
) {
  const time = /^\d{2}:\d{2}/.test(performanceTime)
    ? performanceTime.slice(0, 8)
    : "00:00:00";
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const value = new Date(`${performanceDate}T${normalizedTime}+02:00`);

  if (Number.isNaN(value.getTime())) {
    throw new Error("PERFORMANCE_TIME_INVALID");
  }

  return value;
}

export function isGuestManageableStandardBooking(input: {
  archivedAt?: string | null;
  bookingOrigin?: string | null;
  bookingSource?: string | null;
  bookingStatus?: string | null;
  corporateRequestId?: string | null;
  paymentStatus?: string | null;
  performanceDate: string;
  performanceTime: string;
  now: Date;
}) {
  if (
    input.archivedAt ||
    input.bookingOrigin !== "customer_public" ||
    input.bookingSource !== "online" ||
    input.corporateRequestId ||
    input.paymentStatus === "comp_vip" ||
    !["new", "confirmed", "pending_payment"].includes(
      input.bookingStatus ?? "",
    )
  ) {
    return false;
  }

  return (
    getPerformanceStart(input.performanceDate, input.performanceTime).getTime() >
    input.now.getTime()
  );
}

export function resolveBookingCancellationPolicy(
  input: BookingCancellationPolicyInput,
): BookingCancellationPolicy {
  const performanceStart = getPerformanceStart(
    input.performanceDate,
    input.performanceTime,
  );
  const cutoffDays = input.bookingKind === "corporate" ? 7 : 5;
  const cutoffAt = new Date(
    performanceStart.getTime() - cutoffDays * 24 * 60 * 60 * 1000,
  );
  const fullRefundWindow = input.now.getTime() <= cutoffAt.getTime();
  const successfulPayments = input.payments.filter((payment) =>
    successfulPaymentStatuses.has(payment.paymentStatus),
  );
  const paymentAmount = money(
    successfulPayments.reduce((total, payment) => total + payment.amount, 0),
  );
  const manualReceiptAmount = money(input.manualReceiptAmount);
  const paidAmount = money(paymentAmount + manualReceiptAmount);
  const previousRefundAmount = money(
    input.refunds
      .filter((refund) => activeRefundStatuses.has(refund.status))
      .reduce((total, refund) => total + refund.amount, 0),
  );
  const remainingPaid = money(Math.max(paidAmount - previousRefundAmount, 0));
  const transactionFeeAmount = money(
    successfulPayments.reduce(
      (total, payment) => total + Number(payment.transactionFeeAmount ?? 0),
      0,
    ),
  );
  const depositAmount =
    input.depositAmount == null ? null : money(input.depositAmount);
  let refundableAmount = 0;
  let forfeitedAmount = 0;
  let manualRefundRequired = false;

  if (fullRefundWindow) {
    refundableAmount = remainingPaid;
  } else if (input.bookingKind === "corporate") {
    forfeitedAmount = remainingPaid;
  } else if (depositAmount == null) {
    manualRefundRequired = remainingPaid > 0;
  } else {
    forfeitedAmount = money(Math.min(remainingPaid, depositAmount));
    refundableAmount = money(Math.max(remainingPaid - depositAmount, 0));
  }

  const hasOpenRefund = input.refunds.some((refund) =>
    ["processing", "reconciliation_required"].includes(refund.status),
  );
  const singlePayFastPayment =
    successfulPayments.length === 1 &&
    successfulPayments[0].method === "payfast" &&
    Boolean(successfulPayments[0].providerTransactionId);
  const isFullProviderRefund =
    refundableAmount > 0 &&
    refundableAmount === remainingPaid &&
    manualReceiptAmount === 0;
  const automaticRefundEligible =
    !hasOpenRefund &&
    !manualRefundRequired &&
    singlePayFastPayment &&
    isFullProviderRefund;

  if (refundableAmount > 0 && !automaticRefundEligible) {
    manualRefundRequired = true;
  }

  const refundState = hasOpenRefund
    ? "refund-in-progress"
    : refundableAmount <= 0
      ? "no-refund"
      : automaticRefundEligible
        ? "automatic-full-refund-eligible"
        : "manual-refund-required";
  const policySummary = fullRefundWindow
    ? `${input.bookingKind === "corporate" ? "Corporate" : "Standard"} cancellation is at least ${cutoffDays} days before the performance.`
    : input.bookingKind === "corporate"
      ? "Corporate cancellation is inside 7 days; the paid booking amount is forfeited."
      : depositAmount == null
        ? "Standard cancellation is inside 5 days, but the persisted deposit basis is unavailable. Accounts review is required."
        : "Standard cancellation is inside 5 days; the persisted deposit is forfeited and only paid value above it may be refundable.";

  return {
    automaticRefundEligible,
    bookingFeeAmount: money(input.bookingFeeAmount),
    bookingKind: input.bookingKind,
    cutoffAt: cutoffAt.toISOString(),
    cutoffDays,
    depositAmount,
    feeTreatment:
      refundableAmount <= 0
        ? "none"
        : automaticRefundEligible
          ? "existing-full-refund-path"
          : "manual-review",
    forfeitedAmount,
    fullRefundWindow,
    manualRefundRequired,
    paidAmount,
    performanceStartsAt: performanceStart.toISOString(),
    policySummary,
    previousRefundAmount,
    refundableAmount,
    refundState,
    transactionFeeAmount,
  };
}

export function getBookingManagementStateFingerprint(input: {
  bookingStatus: string;
  guestCount: number;
  paymentStatus: string;
  policy: BookingCancellationPolicy;
  showId: string;
  updatedAt: string;
}) {
  return JSON.stringify({
    bookingStatus: input.bookingStatus,
    guestCount: input.guestCount,
    paidAmount: input.policy.paidAmount,
    paymentStatus: input.paymentStatus,
    previousRefundAmount: input.policy.previousRefundAmount,
    refundableAmount: input.policy.refundableAmount,
    showId: input.showId,
    updatedAt: input.updatedAt,
  });
}
