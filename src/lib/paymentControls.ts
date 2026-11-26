const blockedBookingStatuses = new Set([
  "cancelled",
  "completed",
  "refunded",
]);

const blockedPaymentStatuses = new Set([
  "cancelled",
  "comp-vip",
  "comp_vip",
  "fully-paid",
  "fully_paid",
  "refunded",
]);

function toMoneyCents(value: number | null | undefined) {
  return Math.max(Math.round((Number(value) || 0) * 100), 0);
}

export function calculateOutstandingAmount(
  totalAmount: number | null | undefined,
  confirmedPaidAmount: number | null | undefined,
) {
  return (
    Math.max(
      toMoneyCents(totalAmount) - toMoneyCents(confirmedPaidAmount),
      0,
    ) / 100
  );
}

// A requested deposit is not a receipt. Keep contractual/imported balances intact.
export function resolveBookingOutstandingBalance(input: {
  bookingOrigin?: string | null;
  bookingSource?: string | null;
  bookingStatus?: string | null;
  paymentStatus?: string | null;
  totalAmount: number;
  confirmedPaidAmount: number;
  recordedOutstanding?: number | null;
}) {
  const native = input.bookingOrigin === "admin_staff" || input.bookingOrigin === "customer_public";
  const active = ["new", "confirmed", "pending-payment", "pending_payment", "checked-in", "checked_in"].includes(input.bookingStatus ?? "");
  if (native && active && (!input.bookingSource || ["admin", "online"].includes(input.bookingSource)) &&
    ["pending-payment", "pending_payment"].includes(input.paymentStatus ?? "") && input.confirmedPaidAmount === 0) {
    return calculateOutstandingAmount(input.totalAmount, 0);
  }
  return input.recordedOutstanding ?? calculateOutstandingAmount(input.totalAmount, input.confirmedPaidAmount);
}

export function isPaymentLinkEligible(input: {
  archived?: boolean;
  bookingStatus?: string | null;
  paymentStatus?: string | null;
  totalAmount?: number | null;
  confirmedPaidAmount?: number | null;
}) {
  if (input.archived || blockedBookingStatuses.has(input.bookingStatus ?? "")) {
    return false;
  }

  if (blockedPaymentStatuses.has(input.paymentStatus ?? "")) {
    return false;
  }

  return (
    calculateOutstandingAmount(
      input.totalAmount,
      input.confirmedPaidAmount,
    ) > 0
  );
}
