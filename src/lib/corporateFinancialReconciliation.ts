import type {
  CorporateConversionPaymentBasis,
  CorporateConversionReview,
} from "./corporateConversionReview";
import type {
  CorporateRequest,
  ImportedCorporateFinancialReconciliation,
  PaymentStatus,
  SeatingZoneId,
} from "./zingaraDemo";

export const importedCorporateMetadataPrefix =
  "__zingara_corporate_enquiry_import__:";

export type ImportedCorporateFinancialDraft = {
  additionalAmount: string;
  amountPaid: string;
  gratuityAmount: string;
  notes: string;
  paymentMethod: ImportedCorporateFinancialReconciliation["paymentMethod"];
  ticketObligation: string;
};

export function getImportedCorporateProvenance(
  request: Pick<CorporateRequest, "notes" | "source">,
) {
  if (
    request.source !== "Data Import" ||
    !request.notes.startsWith(importedCorporateMetadataPrefix)
  ) {
    return null;
  }

  try {
    const metadata = JSON.parse(
      request.notes.slice(importedCorporateMetadataPrefix.length),
    ) as {
      fingerprint?: unknown;
      paymentState?: unknown;
      sourceFile?: unknown;
      sourceRow?: unknown;
      sourceSheet?: unknown;
    };

    return {
      fingerprint: String(metadata.fingerprint ?? "").trim(),
      paymentState: String(metadata.paymentState ?? "").trim(),
      sourceFile: String(metadata.sourceFile ?? "").trim(),
      sourceRow: Number(metadata.sourceRow),
      sourceSheet: String(metadata.sourceSheet ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function importedEnquiryClaimsPayment(
  request: Pick<CorporateRequest, "notes" | "source">,
) {
  if (request.source !== "Data Import") return false;
  const provenance = getImportedCorporateProvenance(request);
  return provenance === null || /\bpaid\b/i.test(provenance.paymentState);
}

export function validateImportedCorporateFinancialDraft(
  draft: ImportedCorporateFinancialDraft,
) {
  const errors: Partial<Record<keyof ImportedCorporateFinancialDraft, string>> = {};
  const ticketObligation = Number(draft.ticketObligation);
  const gratuityAmount = Number(draft.gratuityAmount || "0");
  const additionalAmount = Number(draft.additionalAmount || "0");
  const amountPaid = Number(draft.amountPaid);
  const totalObligation = ticketObligation + gratuityAmount + additionalAmount;

  if (
    draft.ticketObligation.trim() === "" ||
    !Number.isFinite(ticketObligation) ||
    ticketObligation < 0
  ) {
    errors.ticketObligation = "Enter the authoritative ticket obligation.";
  }
  if (!Number.isFinite(gratuityAmount) || gratuityAmount < 0) {
    errors.gratuityAmount = "Gratuity cannot be negative.";
  }
  if (!Number.isFinite(additionalAmount) || additionalAmount < 0) {
    errors.additionalAmount = "Additional amounts cannot be negative.";
  }
  if (
    draft.amountPaid.trim() === "" ||
    !Number.isFinite(amountPaid) ||
    amountPaid < 0
  ) {
    errors.amountPaid = "Enter the authoritative amount paid, including R0.00.";
  } else if (Number.isFinite(totalObligation) && amountPaid > totalObligation) {
    errors.amountPaid = "Amount paid cannot exceed the total obligation.";
  }
  if (!draft.notes.trim()) {
    errors.notes = "Record the source and reconciliation basis.";
  }
  if (totalObligation <= 0 && draft.paymentMethod !== "COMP") {
    errors.ticketObligation = "A non-complimentary reconciliation requires an obligation.";
  }
  if (
    draft.paymentMethod === "COMP" &&
    (totalObligation !== 0 || amountPaid !== 0)
  ) {
    errors.paymentMethod = "Complimentary evidence requires R0 obligation and R0 paid.";
  }

  return errors;
}

export function parseImportedCorporateFinancialDraft(
  draft: ImportedCorporateFinancialDraft,
) {
  if (Object.keys(validateImportedCorporateFinancialDraft(draft)).length > 0) {
    return null;
  }

  return {
    additionalAmount: Number(draft.additionalAmount || "0"),
    amountPaid: Number(draft.amountPaid),
    gratuityAmount: Number(draft.gratuityAmount || "0"),
    notes: draft.notes.trim(),
    paymentMethod: draft.paymentMethod,
    ticketObligation: Number(draft.ticketObligation),
  };
}

function getPaymentBasis(
  evidence: ImportedCorporateFinancialReconciliation,
): CorporateConversionPaymentBasis {
  if (evidence.paymentMethod === "COMP") return "complimentary";
  if (evidence.amountPaid === evidence.totalObligation) return "invoice-paid";
  if (evidence.amountPaid > 0) return "deposit";
  return "invoice-outstanding";
}

function getPaymentStatus(
  evidence: ImportedCorporateFinancialReconciliation,
): PaymentStatus {
  if (evidence.paymentMethod === "COMP") return "comp-vip";
  if (evidence.amountPaid === evidence.totalObligation) return "fully-paid";
  if (evidence.amountPaid > 0) return "deposit-paid";
  return "pending-payment";
}

export function getReconciledConversionFinancials(
  evidence: ImportedCorporateFinancialReconciliation,
  context: {
    pax: number;
    showId: string;
    venue: CorporateConversionReview["venue"];
    zoneId: SeatingZoneId;
  },
): CorporateConversionReview {
  return {
    amountPaid: evidence.amountPaid,
    outstandingAmount: evidence.outstandingAmount,
    paymentBasis: getPaymentBasis(evidence),
    paymentStatus: getPaymentStatus(evidence),
    pax: context.pax,
    showId: context.showId,
    ticketTotal: evidence.totalObligation,
    venue: context.venue,
    zoneId: context.zoneId,
  };
}
