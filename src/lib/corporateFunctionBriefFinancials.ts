import { serviceFeeRate } from "./bookingAddons.ts";
import { includedBookingFeeAmount } from "./bookingFees.ts";
import { readCorporateBuyoutAgreement } from "./corporateBuyoutAgreement.ts";
import { reductionAllocationSummary } from "./guestReductionPolicy.ts";
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
  reductionSummary?: string;
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

export type FunctionBriefBuyoutRow = {
  package_snapshot?: { displayName?: string } | null;
  commercial_base_amount: number;
  commercial_vat_amount: number;
  commercial_gratuity_amount: number;
  commercial_additional_guest_amount: number;
  commercial_total_amount: number;
};

export function resolveFunctionBriefBuyoutComposition(
  row: FunctionBriefBuyoutRow | null,
  booking: { addonsTotal: number; serviceFee: number; totalAmount: number; notes?: string | null },
) {
  const agreement = readCorporateBuyoutAgreement(booking.notes, booking.totalAmount);
  if (agreement && row &&
    Math.round(row.commercial_base_amount * 100) === Math.round((agreement.originalBase - agreement.discount) * 100) &&
    row.commercial_vat_amount === agreement.vat && row.commercial_gratuity_amount === agreement.gratuity &&
    row.commercial_additional_guest_amount === 0 && booking.serviceFee === agreement.gratuity &&
    Math.round(booking.addonsTotal * 100) === agreement.addons.reduce((s, a) => s + Math.round(a.amount * 100), 0) &&
    Math.round((row.commercial_total_amount + booking.addonsTotal) * 100) === Math.round(booking.totalAmount * 100)) {
    return { packageName: agreement.packageName, packageBaseAmount: agreement.originalBase - agreement.discount,
      vatAmount: agreement.vat };
  }
  const packageName = row?.package_snapshot?.displayName?.trim() || null;
  const values = row ? [row.commercial_base_amount, row.commercial_vat_amount,
    row.commercial_gratuity_amount, row.commercial_total_amount,
    row.commercial_additional_guest_amount] : [];
  const valid = row && values.every(value => typeof value === "number" &&
    Number.isFinite(value) && value >= 0);
  const current = valid && booking.addonsTotal === 0 &&
    row.commercial_additional_guest_amount === 0 &&
    Math.round(row.commercial_total_amount * 100) === Math.round(booking.totalAmount * 100) &&
    Math.round(row.commercial_gratuity_amount * 100) === Math.round(booking.serviceFee * 100) &&
    Math.round(row.commercial_base_amount * 100) + Math.round(row.commercial_vat_amount * 100) +
      Math.round(row.commercial_gratuity_amount * 100) === Math.round(booking.totalAmount * 100);
  // Package identity is historical; its amounts must not replace a later agreement.
  return { packageName, packageBaseAmount: current ? row.commercial_base_amount : null,
    vatAmount: current ? row.commercial_vat_amount : null };
}

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
      valueAllocation?: { ticketAmount: number; ticketGratuityAmount: number; ticketGratuityPaidAmount?: number; barTabAmount: number; barGratuityAmount?: number };
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
  const allocation = metadata?.valueAllocation;
  if (allocation && [allocation.ticketAmount, allocation.ticketGratuityAmount, allocation.barTabAmount].every(
    (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
  )) {
    return {
      addOns: getAddOns(metadata?.addons ?? [], money(input.addonsTotal), 0),
      barGratuityPaid: money(allocation.barGratuityAmount ?? input.evidence?.bar_gratuity_amount),
      barTabAmount: allocation.barTabAmount, bookingFeeAmount: 0,
      fullPaymentAmount: money(input.amountPaid),
      ticketGratuityPaid: allocation.ticketGratuityPaidAmount ?? allocation.ticketGratuityAmount, ticketValue: allocation.ticketAmount,
      reductionSummary: reductionAllocationSummary(input.notes) || "Existing retained-value allocation shown. Original receipts and historical gratuity evidence remain unchanged.",
    };
  }
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
