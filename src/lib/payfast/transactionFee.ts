export const payFastTransactionFeeAmount = 10;

function toMoneyCents(value: number | null | undefined) {
  return Math.max(Math.round((Number(value) || 0) * 100), 0);
}

export function calculatePayFastTransactionAmounts(
  bookingAppliedAmount: number | null | undefined,
) {
  const bookingAppliedCents = toMoneyCents(bookingAppliedAmount);
  const transactionFeeCents =
    bookingAppliedCents > 0 ? toMoneyCents(payFastTransactionFeeAmount) : 0;

  return {
    bookingAppliedAmount: bookingAppliedCents / 100,
    providerGrossAmount: (bookingAppliedCents + transactionFeeCents) / 100,
    transactionFeeAmount: transactionFeeCents / 100,
  };
}

export function calculatePayFastBookingReconciliation(
  bookingTotal: number | null | undefined,
  previousBookingAmountPaid: number | null | undefined,
  bookingAppliedAmount: number | null | undefined,
) {
  const totalCents = toMoneyCents(bookingTotal);
  const previousPaidCents = Math.min(
    toMoneyCents(previousBookingAmountPaid),
    totalCents,
  );
  const appliedCents = toMoneyCents(bookingAppliedAmount);
  const cumulativePaidCents = Math.min(
    previousPaidCents + appliedCents,
    totalCents,
  );

  return {
    amountPaid: cumulativePaidCents / 100,
    outstandingAmount: (totalCents - cumulativePaidCents) / 100,
  };
}
