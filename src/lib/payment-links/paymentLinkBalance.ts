export type PaymentLinkBalanceMetadata = Record<string, unknown> | null;

export function isPaymentLinkBalanceSnapshotCurrent(input: {
  amountPaid: number;
  metadata: PaymentLinkBalanceMetadata;
  outstandingAmount: number;
  totalAmount: number;
}) {
  const checkoutAmount = Number(input.metadata?.checkoutAmount);

  if (!Number.isFinite(checkoutAmount) || checkoutAmount <= 0) {
    return false;
  }

  const amountPaidSnapshot = Number(input.metadata?.amountPaidSnapshot);
  const totalAmountSnapshot = Number(input.metadata?.totalAmountSnapshot);

  if (
    Number.isFinite(amountPaidSnapshot) &&
    Number.isFinite(totalAmountSnapshot)
  ) {
    return (
      amountPaidSnapshot === input.amountPaid &&
      totalAmountSnapshot === input.totalAmount
    );
  }

  if (input.metadata?.manualCheckout === true) {
    return input.amountPaid === 0 && checkoutAmount <= input.outstandingAmount;
  }

  return checkoutAmount === input.outstandingAmount;
}
