export type FinancialReconciliationInput = {
  amountPaid: number;
  reason: string;
  totalAmount: number;
};

export function toMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function getReconciledPaymentStatus(
  totalAmount: number,
  amountPaid: number,
) {
  if (amountPaid <= 0) return "pending_payment" as const;
  if (amountPaid >= totalAmount) return "fully_paid" as const;
  return "deposit_paid" as const;
}

export function validateFinancialReconciliation(
  input: FinancialReconciliationInput,
) {
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return "Booking obligation must be greater than zero.";
  }

  if (!Number.isFinite(input.amountPaid) || input.amountPaid < 0) {
    return "Amount paid cannot be negative.";
  }

  if (toMoney(input.amountPaid) > toMoney(input.totalAmount)) {
    return "Amount paid cannot exceed the booking obligation.";
  }

  if (!input.reason.trim()) {
    return "Reason for adjustment is required.";
  }

  return null;
}

export function validateGuestCountReconciliation(input: {
  guestCount: number;
  reason: string;
}) {
  if (!Number.isInteger(input.guestCount) || input.guestCount <= 0) {
    return "Guest count must be a positive whole number.";
  }

  if (!input.reason.trim()) {
    return "Reason for change is required.";
  }

  return null;
}
