export type TablePlanFinancialPayment = {
  amount: number;
  method: string | null;
  payment_status: string;
  payment_type: string;
  provider_transaction_id?: string | null;
  provider_gross_amount?: number | null;
  transaction_fee_amount?: number | null;
};

export type TablePlanLegacyPaymentEvidence = {
  bar_gratuity_amount?: number;
  bar_tab_paid_amount?: number;
  booking_id: string;
  complimentary: boolean;
  complimentary_amount?: number;
  full_card_amount: number;
  full_eft_amount: number;
  halaal_meals_amount?: number;
  kosher_meals_amount?: number;
  pre_paid_card_amount: number;
  pre_paid_eft_amount: number;
  source_ticket_amount?: number;
  ticket_gratuity_amount?: number;
};

export type TablePlanFinancialBreakdown = {
  barGratuityAmount: number;
  barTabPaidAmount: number;
  complimentaryAmount: number;
  fullCard: number;
  fullEft: number;
  methodUnknownPaid: number;
  prePaidCard: number;
  prePaidEft: number;
  halaalMealsAmount: number;
  kosherMealsAmount: number;
  statusLabel: string;
  ticketGratuityAmount: number;
  totalPaid: number;
  toPay: number;
};

export const tablePlanCurrencyNumberFormat =
  '"R" #,##0.00;[Red]"-R" #,##0.00;"R" 0.00';

export function getDineplanZoneReceiptFormula(
  firstDataRow: number,
  finalDataRow: number,
) {
  return `SUM(H${firstDataRow}:K${finalDataRow})`;
}

type TablePlanFinancialInput = {
  confirmedPaidAmount: number;
  guestCount: number;
  outstandingAmount: number;
  paymentStatus: string;
  totalAmount: number;
};

function toMoney(value: number | null | undefined) {
  return Math.max(Math.round((Number(value) || 0) * 100), 0) / 100;
}

function getPaymentBucket(payment: TablePlanFinancialPayment) {
  const normalizedMethod = (payment.method ?? "").trim().toLowerCase();
  const isCard =
    [
      "card",
      "cc",
      "credit card",
      "credit-card",
      "online",
      "payfast",
      "payment link",
      "payment-link",
    ].includes(normalizedMethod) ||
    (normalizedMethod === "platform" &&
      Boolean(payment.provider_transaction_id?.trim()));
  const isEft = ["eft", "bank transfer", "bank-transfer"].includes(
    normalizedMethod,
  );

  if (!isCard && !isEft) {
    return null;
  }

  if (payment.payment_type === "deposit") {
    return isCard ? "prePaidCard" : "prePaidEft";
  }

  if (
    payment.payment_type === "balance" ||
    payment.payment_type === "full_payment"
  ) {
    return isCard ? "fullCard" : "fullEft";
  }

  return null;
}

export function calculateTablePlanFinancialBreakdown(
  input: TablePlanFinancialInput,
  payments: TablePlanFinancialPayment[],
  legacyEvidence?: TablePlanLegacyPaymentEvidence | null,
): TablePlanFinancialBreakdown {
  const totalAmount = toMoney(input.totalAmount);
  const authoritativePaid = toMoney(input.confirmedPaidAmount);
  const toPay = toMoney(input.outstandingAmount);
  const isComplimentary = legacyEvidence
    ? legacyEvidence.complimentary === true
    : input.paymentStatus === "comp_vip" || totalAmount === 0;
  const breakdown: TablePlanFinancialBreakdown = {
    barGratuityAmount: toMoney(legacyEvidence?.bar_gratuity_amount),
    barTabPaidAmount: toMoney(legacyEvidence?.bar_tab_paid_amount),
    complimentaryAmount: isComplimentary
      ? toMoney(legacyEvidence?.complimentary_amount) || totalAmount
      : 0,
    fullCard: 0,
    fullEft: 0,
    methodUnknownPaid: 0,
    prePaidCard: 0,
    prePaidEft: 0,
    halaalMealsAmount: toMoney(legacyEvidence?.halaal_meals_amount),
    kosherMealsAmount: toMoney(legacyEvidence?.kosher_meals_amount),
    statusLabel: isComplimentary
      ? "Complimentary"
      : toPay === 0
        ? "Fully Paid"
        : input.paymentStatus === "deposit_paid" || authoritativePaid > 0
          ? "Deposit Paid"
          : `Outstanding R${toPay.toLocaleString("en-ZA", {
              maximumFractionDigits: 2,
              minimumFractionDigits: 0,
            })}`,
    ticketGratuityAmount: toMoney(legacyEvidence?.ticket_gratuity_amount),
    totalPaid: isComplimentary ? 0 : authoritativePaid,
    toPay: isComplimentary ? 0 : toPay,
  };
  let classifiedPaid = 0;

  if (legacyEvidence) {
    const evidenceAmounts = [
      legacyEvidence.full_card_amount,
      legacyEvidence.pre_paid_card_amount,
      legacyEvidence.pre_paid_eft_amount,
      legacyEvidence.full_eft_amount,
    ].map(toMoney);

    for (const [bucket, evidenceAmount] of [
      ["fullCard", evidenceAmounts[0]],
      ["prePaidCard", evidenceAmounts[1]],
      ["prePaidEft", evidenceAmounts[2]],
      ["fullEft", evidenceAmounts[3]],
    ] as const) {
      breakdown[bucket] += evidenceAmount;
      classifiedPaid += evidenceAmount;
    }

    const recoveredAncillaryAmount =
      breakdown.ticketGratuityAmount +
      breakdown.barTabPaidAmount +
      breakdown.barGratuityAmount +
      breakdown.halaalMealsAmount +
      breakdown.kosherMealsAmount;
    breakdown.methodUnknownPaid = isComplimentary
      ? 0
      : toMoney(
          authoritativePaid - classifiedPaid - recoveredAncillaryAmount,
        );
    breakdown.totalPaid = toMoney(
      classifiedPaid + breakdown.methodUnknownPaid,
    );

    if (!isComplimentary && breakdown.totalPaid > 0 && breakdown.toPay === 0) {
      breakdown.statusLabel = "Fully Paid";
    }

    return breakdown;
  }

  for (const payment of payments) {
    if (
      !["deposit_paid", "fully_paid"].includes(payment.payment_status) ||
      toMoney(payment.amount) <= 0
    ) {
      continue;
    }

    const bucket = getPaymentBucket(payment);

    if (!bucket) {
      continue;
    }

    const availableAmount = Math.max(breakdown.totalPaid - classifiedPaid, 0);
    const classifiedAmount = Math.min(toMoney(payment.amount), availableAmount);

    breakdown[bucket] += classifiedAmount;
    classifiedPaid += classifiedAmount;
  }

  breakdown.methodUnknownPaid = toMoney(
    breakdown.totalPaid - classifiedPaid,
  );

  return breakdown;
}
