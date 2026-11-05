export type GratuityPolicy = "online-collected" | "pay-at-venue";

export type GratuityStatus =
  | { kind: "collected"; amount: number; label: string }
  | { kind: "payable"; amount: 0; label: string }
  | { kind: "review"; amount: number; label: string };

function money(value: number) {
  const [whole, cents] = Math.max(Number(value) || 0, 0).toFixed(2).split(".");
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

export function resolveGratuityStatus(input: {
  amountPaid?: number | null;
  bookingStatus?: string | null;
  gratuityPolicy?: GratuityPolicy | null;
  legacyCollectedAmount?: number | null;
  paymentStatus?: string | null;
  serviceFeeAmount?: number | null;
  totalAmount?: number | null;
}): GratuityStatus {
  const explicitLegacyAmount = Math.max(
    Number(input.legacyCollectedAmount) || 0,
    0,
  );
  const chargedAmount = Math.max(Number(input.serviceFeeAmount) || 0, 0);
  const amountPaid = Math.max(Number(input.amountPaid) || 0, 0);
  const totalAmount = Math.max(Number(input.totalAmount) || 0, 0);

  if (explicitLegacyAmount > 0) {
    return {
      amount: explicitLegacyAmount,
      kind: "collected",
      label: `GRATUITY COLLECTED: ${money(explicitLegacyAmount)}`,
    };
  }

  if (
    input.bookingStatus === "cancelled" ||
    input.paymentStatus === "refunded"
  ) {
    return {
      amount: chargedAmount,
      kind: "review",
      label: `GRATUITY REVIEW: ${money(chargedAmount)} CHARGED - CANCELLATION OR REFUND HISTORY`,
    };
  }

  if (input.gratuityPolicy === "pay-at-venue" || chargedAmount === 0) {
    return {
      amount: 0,
      kind: "payable",
      label: "GRATUITY PAYABLE AT VENUE",
    };
  }

  if (
    input.paymentStatus === "fully_paid" ||
    input.paymentStatus === "fully-paid"
  ) {
    if (totalAmount > 0 && amountPaid >= totalAmount) {
      return {
        amount: chargedAmount,
        kind: "collected",
        label: `GRATUITY COLLECTED: ${money(chargedAmount)}`,
      };
    }
  }

  return {
    amount: chargedAmount,
    kind: "review",
    label: `GRATUITY REVIEW: ${money(chargedAmount)} CHARGED - PAYMENT NOT FULLY SETTLED`,
  };
}
