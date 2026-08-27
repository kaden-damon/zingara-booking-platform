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
