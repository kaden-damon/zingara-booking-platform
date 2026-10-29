import {
  calculateXeroDocumentTotals,
  type XeroCalculatedLine,
  type XeroDocumentLineInput,
  type XeroLineAmountType,
} from "./documentMath.ts";
import { canConvertRequestedQuote } from "./invoiceRequests.ts";

export type CreditLineSelection = {
  lineIndex: number;
  quantity: string;
  unitPrice: string;
};

export function canManageXeroCreditNotes(
  staffProfile: { active?: boolean; id?: string | null } | null | undefined,
  hasInvoiceAuthority: boolean,
) {
  return canConvertRequestedQuote(staffProfile, hasInvoiceAuthority);
}

function decimalMagnitude(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Choose a valid credit amount.");
  return Math.abs(parsed);
}

export function buildCreditNoteLines(input: {
  amountType: XeroLineAmountType;
  invoiceLines: XeroCalculatedLine[];
  selections: CreditLineSelection[];
}) {
  if (!input.selections.length) throw new Error("Choose at least one invoice line.");
  const seen = new Set<number>();
  const lines: XeroDocumentLineInput[] = input.selections.map((selection) => {
    if (!Number.isInteger(selection.lineIndex) || seen.has(selection.lineIndex)) {
      throw new Error("Each invoice line may be credited once per draft.");
    }
    seen.add(selection.lineIndex);
    const original = input.invoiceLines[selection.lineIndex];
    if (!original) throw new Error("The selected invoice line is no longer available.");
    const quantity = decimalMagnitude(selection.quantity);
    const originalQuantity = decimalMagnitude(original.quantity);
    const unitPrice = Number(selection.unitPrice);
    const originalUnitPrice = Number(original.unitPrice);
    if (
      quantity <= 0 ||
      quantity > originalQuantity ||
      !Number.isFinite(unitPrice) ||
      Math.abs(unitPrice) > Math.abs(originalUnitPrice) ||
      Math.sign(unitPrice) !== Math.sign(originalUnitPrice)
    ) {
      throw new Error("A credit line cannot exceed its original invoice line.");
    }
    return {
      description: original.description,
      mappingCategory: original.mappingCategory ?? null,
      quantity: selection.quantity,
      taxCode: original.taxCode,
      taxRatePercent: original.taxRatePercent,
      unitPrice: selection.unitPrice,
    };
  });
  const totals = calculateXeroDocumentTotals(lines, input.amountType);
  if (totals.totalCents <= 0) throw new Error("The credit note total must be greater than zero.");
  return totals;
}

export function remainingCreditCents(invoiceTotalCents: number, creditedCents: number) {
  return Math.max(0, invoiceTotalCents - creditedCents);
}

export function isCreditNotePostingAuthorised() {
  return process.env.XERO_CREDIT_NOTE_POSTING_AUTHORISED === "true";
}
