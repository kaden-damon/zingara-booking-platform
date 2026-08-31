import { createHash } from "node:crypto";

export const corporateEnquiryImportMetadataPrefix =
  "__zingara_corporate_enquiry_import__:";

export type CorporateEnquiryImportAction =
  | "CREATE ACTIVE ENQUIRY"
  | "CREATE CANCELLED/ARCHIVED ENQUIRY"
  | "HOLD - MANUAL REVIEW"
  | "SKIP - ALREADY EXISTS";

export type CorporateEnquirySourceRow = {
  companyName: string;
  contactName: string;
  contactNumber: string;
  email: string;
  guestCount: number | null;
  guestCountText: string;
  invoiceState: string;
  paymentState: string;
  quoteState: string;
  requestedDate: string | null;
  requestedDateText: string;
  seatingPreference: string;
  sourceFile: string;
  sourceRow: number;
  sourceSheet: string;
  statusNote: string;
};

export type CorporateEnquiryExistingIdentity = {
  companyName: string;
  contactName: string;
  contactNumber: string | null;
  email: string | null;
  guestCount: number | null;
  preferredDate: string | null;
  reference?: string;
  sourceFingerprint?: string | null;
};

export type CorporateEnquiryImportDecision = {
  action: CorporateEnquiryImportAction;
  fingerprint: string;
  match?: CorporateEnquiryExistingIdentity;
  reason: string;
};

export type CorporateEnquiryImportRecord = {
  archived_at: string | null;
  company_name: string;
  contact_name: string;
  contact_number: string | null;
  email: string | null;
  guest_count: number | null;
  linked_booking_id: null;
  linked_booking_reference: null;
  notes: string;
  preferred_event_date: string | null;
  request_type: "corporate_booking";
  seating_preference: string | null;
  source: "Data Import";
  status: "cancelled" | "corporate_tentative" | "quote_sent";
};

function normalizedText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeCorporateEnquiryEmail(value: string | null | undefined) {
  return (
    (value ?? "")
      .trim()
      .toLowerCase()
      .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0] ?? ""
  );
}

export function normalizeCorporateEnquiryPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");

  return digits.length >= 9 ? digits.slice(-9) : "";
}

export function normalizeCorporateRequestedDate(value: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);

    return {
      requestedDate: date.toISOString().slice(0, 10),
      requestedDateText: date.toISOString().slice(0, 10),
    };
  }

  const requestedDateText = String(value ?? "").trim().replace(/\s+/g, " ");
  const isoMatch = requestedDateText.match(/^\d{4}-\d{2}-\d{2}$/);

  if (isoMatch) {
    return { requestedDate: requestedDateText, requestedDateText };
  }

  const southAfricanDateMatch = requestedDateText.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  );

  if (southAfricanDateMatch) {
    return {
      requestedDate: `${southAfricanDateMatch[3]}-${southAfricanDateMatch[2].padStart(2, "0")}-${southAfricanDateMatch[1].padStart(2, "0")}`,
      requestedDateText,
    };
  }

  return { requestedDate: null, requestedDateText };
}

export function getCorporateEnquirySourceFingerprint(
  row: CorporateEnquirySourceRow,
) {
  const canonicalRow = [
    row.sourceSheet,
    String(row.sourceRow),
    row.contactName.trim(),
    row.companyName.trim(),
    normalizeCorporateEnquiryEmail(row.email),
    normalizeCorporateEnquiryPhone(row.contactNumber),
    row.requestedDate ?? "",
    row.requestedDateText.trim(),
    row.guestCountText.trim(),
    row.seatingPreference.trim(),
    row.quoteState.trim(),
    row.invoiceState.trim(),
    row.paymentState.trim(),
    row.statusNote.trim(),
  ].join("\u001f");

  return createHash("sha256").update(canonicalRow).digest("hex");
}

function isStrongCorporateEnquiryMatch(
  row: CorporateEnquirySourceRow,
  existing: CorporateEnquiryExistingIdentity,
) {
  const sourceEmail = normalizeCorporateEnquiryEmail(row.email);
  const existingEmail = normalizeCorporateEnquiryEmail(existing.email);

  if (sourceEmail && sourceEmail === existingEmail) {
    return true;
  }

  const sourcePhone = normalizeCorporateEnquiryPhone(row.contactNumber);
  const existingPhone = normalizeCorporateEnquiryPhone(existing.contactNumber);

  if (sourcePhone && sourcePhone === existingPhone) {
    return true;
  }

  return (
    normalizedText(row.contactName) === normalizedText(existing.contactName) &&
    normalizedText(row.companyName) === normalizedText(existing.companyName) &&
    Boolean(row.requestedDate) &&
    row.requestedDate === existing.preferredDate &&
    row.guestCount !== null &&
    row.guestCount === existing.guestCount
  );
}

export function classifyCorporateEnquiryImport(
  row: CorporateEnquirySourceRow,
  existingRecords: CorporateEnquiryExistingIdentity[],
): CorporateEnquiryImportDecision {
  const fingerprint = getCorporateEnquirySourceFingerprint(row);
  const fingerprintMatches = existingRecords.filter(
    (existing) => existing.sourceFingerprint === fingerprint,
  );

  if (fingerprintMatches.length === 1) {
    return {
      action: "SKIP - ALREADY EXISTS",
      fingerprint,
      match: fingerprintMatches[0],
      reason: "The exact imported source fingerprint already exists.",
    };
  }

  if (fingerprintMatches.length > 1) {
    return {
      action: "HOLD - MANUAL REVIEW",
      fingerprint,
      reason: "The imported source fingerprint exists more than once.",
    };
  }

  const strongMatches = existingRecords.filter((existing) =>
    isStrongCorporateEnquiryMatch(row, existing),
  );

  if (strongMatches.length === 1) {
    return {
      action: "SKIP - ALREADY EXISTS",
      fingerprint,
      match: strongMatches[0],
      reason: "An authoritative email, phone, or composite identity already exists.",
    };
  }

  if (strongMatches.length > 1) {
    return {
      action: "HOLD - MANUAL REVIEW",
      fingerprint,
      reason: "More than one strong production identity matches this source row.",
    };
  }

  const nameOnlyMatch = existingRecords.find(
    (existing) =>
      normalizedText(row.contactName) === normalizedText(existing.contactName),
  );

  if (nameOnlyMatch) {
    return {
      action: "HOLD - MANUAL REVIEW",
      fingerprint,
      match: nameOnlyMatch,
      reason: "A name-only overlap is insufficient for automatic import.",
    };
  }

  if (/\bcancelled\b/i.test(`${row.paymentState} ${row.statusNote}`)) {
    return {
      action: "CREATE CANCELLED/ARCHIVED ENQUIRY",
      fingerprint,
      reason: "The source explicitly records this enquiry as cancelled.",
    };
  }

  return {
    action: "CREATE ACTIVE ENQUIRY",
    fingerprint,
    reason: "No authoritative production match exists.",
  };
}

export function buildCorporateEnquiryImportRecord(
  row: CorporateEnquirySourceRow,
  decision: CorporateEnquiryImportDecision,
  context: {
    importedAt: string;
    importedByStaffId: string;
    sourceChecksum: string;
  },
): CorporateEnquiryImportRecord {
  if (
    decision.action !== "CREATE ACTIVE ENQUIRY" &&
    decision.action !== "CREATE CANCELLED/ARCHIVED ENQUIRY"
  ) {
    throw new Error("Only approved create decisions can become import records.");
  }

  const cancelled = decision.action === "CREATE CANCELLED/ARCHIVED ENQUIRY";
  const quoteSent = /^yes$/i.test(row.quoteState.trim());
  const metadata = {
    fingerprint: decision.fingerprint,
    importedAt: context.importedAt,
    importedByStaffId: context.importedByStaffId,
    guestCountText: row.guestCountText,
    invoiceState: row.invoiceState,
    paymentState: row.paymentState,
    quoteState: row.quoteState,
    requestedDateText: row.requestedDateText,
    sourceChecksum: context.sourceChecksum,
    sourceFile: row.sourceFile,
    sourceRow: row.sourceRow,
    sourceSheet: row.sourceSheet,
    statusNote: row.statusNote,
  };

  return {
    archived_at: cancelled ? context.importedAt : null,
    company_name: row.companyName.trim(),
    contact_name: row.contactName.trim(),
    contact_number: row.contactNumber.trim() || null,
    email: normalizeCorporateEnquiryEmail(row.email) || null,
    guest_count: row.guestCount,
    linked_booking_id: null,
    linked_booking_reference: null,
    notes: `${corporateEnquiryImportMetadataPrefix}${JSON.stringify(metadata)}`,
    preferred_event_date: row.requestedDate,
    request_type: "corporate_booking",
    seating_preference: row.seatingPreference.trim() || null,
    source: "Data Import",
    status: cancelled
      ? "cancelled"
      : quoteSent
        ? "quote_sent"
        : "corporate_tentative",
  };
}

export function assertCorporateEnquiryImportPlan(
  decisions: CorporateEnquiryImportDecision[],
  expected: { creates: number; holds: number; skips: number; sourceRows: number },
) {
  const creates = decisions.filter((decision) =>
    decision.action.startsWith("CREATE "),
  ).length;
  const holds = decisions.filter(
    (decision) => decision.action === "HOLD - MANUAL REVIEW",
  ).length;
  const skips = decisions.filter(
    (decision) => decision.action === "SKIP - ALREADY EXISTS",
  ).length;

  if (
    decisions.length !== expected.sourceRows ||
    creates !== expected.creates ||
    holds !== expected.holds ||
    skips !== expected.skips
  ) {
    throw new Error("Corporate enquiry import snapshot no longer matches review.");
  }
}
