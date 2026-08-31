export type DineplanLegacyPaymentInput = {
  advertisedTicketAmount: number;
  paymentAmount: number;
  paymentNotes: string;
};

export type DineplanLegacyPaymentClassification = {
  barGratuityAmount: number;
  barTabPaidAmount: number;
  classificationReason:
    | "explicit_comp_or_trade_exchange"
    | "explicit_deposit_eft"
    | "explicit_full_card"
    | "explicit_full_ticket_aswin_eft_convention"
    | "method_unknown"
    | "numeric_payment_aswin_card_prepayment_convention"
    | "payment_pending";
  complimentary: boolean;
  complimentaryAmount: number;
  fullCardAmount: number;
  fullEftAmount: number;
  halaalMealsAmount: number;
  kosherMealsAmount: number;
  prePaidCardAmount: number;
  prePaidEftAmount: number;
  sourceTicketAmount: number;
  ticketGratuityAmount: number;
};

function toMoney(value: number | null | undefined) {
  return Math.max(Math.round((Number(value) || 0) * 100), 0) / 100;
}

function parseMoney(value: string) {
  let normalized = value.replace(/[^0-9.,]/g, "");

  if (!normalized) {
    return 0;
  }

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    const [whole, decimal] = normalized.split(/,(?=[^,]*$)/);
    normalized =
      decimal?.length === 2
        ? `${whole.replace(/,/g, "")}.${decimal}`
        : normalized.replace(/,/g, "");
  } else {
    const parts = normalized.split(".");

    if (parts.length > 2) {
      normalized = `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
    }
  }

  return toMoney(Number(normalized));
}

function getLabeledAmounts(notes: string, label: RegExp) {
  const expression = new RegExp(
    `(?:${label.source})\\s*[:=-]?\\s*\\(?\\s*R?\\s*([0-9][0-9 ,.]*[0-9])`,
    "gi",
  );

  return Array.from(notes.matchAll(expression), (match) =>
    parseMoney(match[1]),
  );
}

function getLastLabeledAmount(notes: string, label: RegExp) {
  return getLabeledAmounts(notes, label).at(-1) ?? 0;
}

function getExplicitFullAmount(notes: string) {
  const match = notes.match(
    /paid\s+in\s+full(?:\s+excluding\s+gratuity)?\s*\(?\s*R?\s*([0-9][0-9 ,.]*[0-9])/i,
  );

  return match ? parseMoney(match[1]) : 0;
}

export function classifyDineplanLegacyPayment(
  input: DineplanLegacyPaymentInput,
): DineplanLegacyPaymentClassification {
  const notes = input.paymentNotes.replace(/\s+/g, " ").trim();
  const paymentAmount = toMoney(input.paymentAmount);
  const advertisedTicketAmount = toMoney(input.advertisedTicketAmount);
  const ticketAmount = getLastLabeledAmount(notes, /tickets?/i);
  const barGratuityAmount = getLastLabeledAmount(notes, /bar\s+gratuity/i);
  const showGratuityAmount = getLastLabeledAmount(notes, /show\s+gratuity/i);
  const generalGratuities = getLabeledAmounts(notes, /gratuity/i);
  const ticketGratuityAmount =
    showGratuityAmount ||
    generalGratuities.filter((amount) => amount !== barGratuityAmount).at(-1) ||
    0;
  const barTabPaidAmount = getLastLabeledAmount(
    notes,
    /(?:bar|bat)\s+tab|paid\s+a\s+bar/i,
  );
  const halaalMealsAmount = getLastLabeledAmount(
    notes,
    /(?:strictly\s+)?halaal\s+meals?/i,
  );
  const kosherMealsAmount = getLastLabeledAmount(notes, /kosher\s+meals?/i);
  const complimentary =
    /\b(?:comp|comps|complimentary|tradex|trade\s+exchange)\b/i.test(notes);
  const pending = /payment\s+pending/i.test(notes);
  const card = /\b(?:ccard|ccar|credit\s*card|online\s*card)\b/i.test(notes);
  const eft = /\b(?:eft|bank\s+transfer)\b/i.test(notes);
  const full = /paid\s+in\s+full/i.test(notes) || ticketAmount > 0;
  const deposit = /\b(?:deposit|pre[- ]?pay)/i.test(notes);
  const result: DineplanLegacyPaymentClassification = {
    barGratuityAmount,
    barTabPaidAmount,
    classificationReason: "method_unknown",
    complimentary,
    complimentaryAmount: complimentary ? advertisedTicketAmount : 0,
    fullCardAmount: 0,
    fullEftAmount: 0,
    halaalMealsAmount,
    kosherMealsAmount,
    prePaidCardAmount: 0,
    prePaidEftAmount: 0,
    sourceTicketAmount: ticketAmount,
    ticketGratuityAmount,
  };

  if (complimentary) {
    result.classificationReason = "explicit_comp_or_trade_exchange";
    return result;
  }

  if (pending) {
    result.classificationReason = "payment_pending";
    return result;
  }

  if (full) {
    let resolvedTicketAmount =
      ticketAmount || getExplicitFullAmount(notes) || paymentAmount;

    if (!ticketAmount && /plus\s+(?:show\s+)?gratuity/i.test(notes)) {
      resolvedTicketAmount = advertisedTicketAmount || resolvedTicketAmount;
    }

    result.sourceTicketAmount = resolvedTicketAmount;

    if (card) {
      result.fullCardAmount = resolvedTicketAmount;
      result.classificationReason = "explicit_full_card";
    } else {
      result.fullEftAmount = resolvedTicketAmount;
      result.classificationReason =
        "explicit_full_ticket_aswin_eft_convention";
    }

    return result;
  }

  if (deposit && eft && paymentAmount > 0) {
    result.prePaidEftAmount = paymentAmount;
    result.classificationReason = "explicit_deposit_eft";
    return result;
  }

  if (paymentAmount > 0) {
    result.prePaidCardAmount = paymentAmount;
    result.classificationReason =
      "numeric_payment_aswin_card_prepayment_convention";
  }

  return result;
}
