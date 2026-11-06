import { serviceFeeRate } from "./bookingAddons.ts";
import { includedBookingFeeAmount } from "./bookingFees.ts";
import {
  resolveGratuityStatus,
  type GratuityPolicy,
} from "./gratuityTransition.ts";

type FinancialAddon = {
  description?: string;
  id: string;
  name: string;
  price: number;
  quantity?: number;
};

type LegacyPaymentEvidence = {
  bar_gratuity_amount?: number | null;
  bar_tab_paid_amount?: number | null;
  source_ticket_amount?: number | null;
  ticket_gratuity_amount?: number | null;
} | null;

export type FunctionBriefAddon = {
  amount: number;
  description: string;
  gratuityPaid: number;
  name: string;
  quantity: number;
};

export type CorporateFunctionBriefFinancials = {
  addOns: FunctionBriefAddon[];
  barGratuityPaid: number;
  barTabAmount: number;
  bookingFeeAmount: number;
  fullPaymentAmount: number;
  ticketGratuityPaid: number;
  ticketValue: number;
};

type BookingFinancialInput = {
  addonsTotal: number;
  amountPaid: number;
  bookingOrigin?: string | null;
  bookingStatus?: string | null;
  discountAmount: number;
  evidence?: LegacyPaymentEvidence;
  notes?: string | null;
  paymentStatus?: string | null;
  serviceFee: number;
  subtotalAmount: number;
  totalAmount: number;
};

const metadataPrefix = "__zingara_booking_meta__:";

function money(value: unknown) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function parseMetadata(notes: string | null | undefined) {
  if (!notes?.startsWith(metadataPrefix)) return null;
  try {
    return JSON.parse(notes.slice(metadataPrefix.length)) as {
      addons?: FinancialAddon[];
      commercialModel?: string;
      gratuityPolicy?: GratuityPolicy;
    pricingProvenance?: { bookingFeeAmount?: number };
    };
  } catch {
    return null;
  }
}

function isBarTab(addon: Pick<FinancialAddon, "id" | "name">) {
  return addon.id === "corporate-bar-tab" || /^bar\s*tab\b/i.test(addon.name.trim());
}

function getAddOns(
  addons: FinancialAddon[],
  authoritativeTotal: number,
  evidenceBarTabAmount: number,
) {
  const lines = addons
    .filter((addon) => money(addon.price) > 0)
    .map((addon) => ({
      amount: money(addon.price),
      description: String(addon.description ?? "").trim(),
      gratuityPaid: 0,
      name: String(addon.name || "Add-on").trim(),
      quantity: Math.max(1, Math.trunc(Number(addon.quantity) || 1)),
    }));
  if (evidenceBarTabAmount > 0 && !addons.some(isBarTab)) {
    lines.push({
      amount: evidenceBarTabAmount,
      description: "Historical payment evidence",
      gratuityPaid: 0,
      name: "Bar Tab",
      quantity: 1,
    });
  }
  const describedTotal = money(lines.reduce((sum, addon) => sum + addon.amount, 0));
  const unexplained = money(authoritativeTotal - describedTotal);
  if (unexplained > 0) {
    lines.push({
      amount: unexplained,
      description: "",
      gratuityPaid: 0,
      name: "Other Add-ons",
      quantity: 1,
    });
  }
  return lines;
}

export function resolveCorporateFunctionBriefFinancials(
  input: BookingFinancialInput,
): CorporateFunctionBriefFinancials {
  const metadata = parseMetadata(input.notes);
  const addonsTotal = money(input.addonsTotal);
  const metadataAddons = metadata?.addons ?? [];
  const evidenceBarTabAmount = money(input.evidence?.bar_tab_paid_amount);
  const metadataBarTabAmount = money(
    metadataAddons
      .filter(isBarTab)
      .reduce((sum, addon) => sum + money(addon.price), 0),
  );
  const barTabAmount = metadataBarTabAmount || evidenceBarTabAmount;
  const addOns = getAddOns(metadataAddons, addonsTotal, evidenceBarTabAmount);
  const explicitTicketGratuity = money(input.evidence?.ticket_gratuity_amount);
  const explicitBarGratuity = money(input.evidence?.bar_gratuity_amount);
  const chargedGratuity = money(input.serviceFee);
  const gratuityStatus = resolveGratuityStatus({
    amountPaid: input.amountPaid,
    bookingStatus: input.bookingStatus,
    gratuityPolicy: metadata?.gratuityPolicy,
    legacyCollectedAmount: money(explicitTicketGratuity + explicitBarGratuity),
    paymentStatus: input.paymentStatus,
    serviceFeeAmount: chargedGratuity,
    totalAmount: input.totalAmount,
  });
  const gratuityCollected = gratuityStatus.kind === "collected";
  const calculatedBarGratuity = money(barTabAmount * serviceFeeRate);
  const barGratuityPaid = explicitBarGratuity > 0
    ? explicitBarGratuity
    : gratuityCollected
      ? Math.min(calculatedBarGratuity, chargedGratuity)
      : 0;
  const ticketGratuityPaid = explicitTicketGratuity > 0
    ? explicitTicketGratuity
    : gratuityCollected
      ? money(chargedGratuity - barGratuityPaid)
      : 0;

  let remainingBarGratuity = barGratuityPaid;
  for (const line of addOns) {
    if (remainingBarGratuity <= 0 || !/^bar\s*tab\b/i.test(line.name)) continue;
    const allocation = Math.min(money(line.amount * serviceFeeRate), remainingBarGratuity);
    line.gratuityPaid = allocation;
    remainingBarGratuity = money(remainingBarGratuity - allocation);
  }

  const explicitTicketValue = money(input.evidence?.source_ticket_amount);
  // Legacy Corporate rows include add-ons in subtotal; newer rows keep them
  // separate. The paid/quoted total is the common authoritative boundary.
  const ticketGross = money(
    money(input.totalAmount) - chargedGratuity - addonsTotal,
  );
  const usesEmbeddedBookingFee =
    explicitTicketValue === 0 &&
    input.bookingOrigin !== "data_import" &&
    metadata?.commercialModel !== "fixed-buyout-package";
  const bookingFeeAmount = usesEmbeddedBookingFee
    ? money(
        metadata?.pricingProvenance?.bookingFeeAmount ??
          (ticketGross > 0 ? includedBookingFeeAmount : 0),
      )
    : 0;
  const ticketValue = explicitTicketValue > 0
    ? explicitTicketValue
    : money(ticketGross - bookingFeeAmount);

  return {
    addOns,
    barGratuityPaid,
    barTabAmount,
    bookingFeeAmount,
    fullPaymentAmount: money(input.amountPaid),
    ticketGratuityPaid,
    ticketValue,
  };
}
