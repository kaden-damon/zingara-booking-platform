import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion =
  "quote-invoice-management-2026-10-23-v2";
export const staffTourMetadataKey = "zingara_staff_tour_version";
export const staffTourAcknowledgementMetadataKey =
  "zingara_staff_tour_acknowledgement";
export const staffTourAcknowledgedAtMetadataKey =
  "zingara_staff_tour_acknowledged_at";
export const staffTourHistoryMetadataKey = "zingara_staff_tour_history";
export const staffTourOpenEvent = "zingara-open-staff-feature-walkthrough";

export type StaffTourAcknowledgement = "completed" | "skipped";

export type StaffTourAcknowledgementRecord = {
  acknowledgedAt: string;
  acknowledgement: StaffTourAcknowledgement;
  version: string;
};

export type StaffTourPage = {
  body: string;
  examples?: string[];
  id: string;
  supporting?: string;
  title: string;
};

export const staffTourPages: StaffTourPage[] = [
  {
    body: "Zingara keeps quotations, customer acceptance, invoice requests and document status together. Your available actions continue to follow your existing role and venue permissions.",
    id: "quote-invoice-overview",
    supporting: "Live Xero synchronisation remains paused until it is separately authorised.",
    title: "Quote & Invoice Management",
  },
  {
    body: "Sales staff can open an eligible Corporate enquiry or booking and choose Create Quote. Add the existing customer or company, approved line items, pricing and VAT, then save the draft.",
    id: "create-quotation",
    supporting: "Staff without quotation permission can still use the walkthrough, but cannot create or edit financial documents.",
    title: "Create Quotations",
  },
  {
    body: "From the saved quotation, use Send Quote. The customer receives the branded email, quotation PDF and approved banking confirmation, then opens a secure Zingara link to review and accept the exact version sent.",
    id: "send-and-accept",
    supporting: "Opening the link does not accept a quotation, and revised quotations require a new secure link.",
    title: "Send for Acceptance",
  },
  {
    body: "After authoritative customer acceptance, Sales receives a confirmation and Request Invoice becomes available. The request preserves the accepted quotation version and places it in the Accounts queue without creating an invoice.",
    id: "request-invoice",
    title: "Request an Invoice",
  },
  {
    body: "Tristan and Rachelle review Invoice Requested items in Reports → Accounting and use the existing Finance-authorised conversion workflow. Other staff can view permitted statuses but cannot bypass Accounts review.",
    id: "accounts-processing",
    supporting: "Wagheeda can receive approved reminders without receiving invoice-conversion permission.",
    title: "Accounts Processing",
  },
  {
    body: "Open Reports → Accounting to search quotations and invoices, filter Invoice Requested items and view acceptance, request, invoice, payment and sync statuses available to your role.",
    id: "document-statuses",
    supporting: "You can reopen this walkthrough at any time from the Academy dashboard.",
    title: "View Document Status",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  const metadata = user?.user_metadata;
  const acknowledgement = metadata?.[staffTourAcknowledgementMetadataKey];
  const acknowledgedAt = metadata?.[staffTourAcknowledgedAtMetadataKey];

  return (
    metadata?.[staffTourMetadataKey] === latestStaffTourVersion &&
    (acknowledgement === "completed" || acknowledgement === "skipped") &&
    typeof acknowledgedAt === "string" &&
    Number.isFinite(Date.parse(acknowledgedAt))
  );
}

export function getStaffTourAcknowledgementHistory(
  user: User | null | undefined,
) {
  const metadata = user?.user_metadata;
  const existingHistory = Array.isArray(
    metadata?.[staffTourHistoryMetadataKey],
  )
    ? (metadata[staffTourHistoryMetadataKey] as unknown[])
    : [];
  const history = existingHistory.filter(
    (record): record is StaffTourAcknowledgementRecord => {
      if (!record || typeof record !== "object") return false;
      const candidate = record as Partial<StaffTourAcknowledgementRecord>;
      return (
        typeof candidate.version === "string" &&
        (candidate.acknowledgement === "completed" ||
          candidate.acknowledgement === "skipped") &&
        typeof candidate.acknowledgedAt === "string" &&
        Number.isFinite(Date.parse(candidate.acknowledgedAt))
      );
    },
  );

  const version = metadata?.[staffTourMetadataKey];
  const acknowledgement = metadata?.[staffTourAcknowledgementMetadataKey];
  const acknowledgedAt = metadata?.[staffTourAcknowledgedAtMetadataKey];
  const hasValidCurrentRecord =
    typeof version === "string" &&
    (acknowledgement === "completed" || acknowledgement === "skipped") &&
    typeof acknowledgedAt === "string" &&
    Number.isFinite(Date.parse(acknowledgedAt));

  if (
    hasValidCurrentRecord &&
    !history.some((record) => record.version === version)
  ) {
    history.push({ acknowledgedAt, acknowledgement, version });
  }

  return history;
}
