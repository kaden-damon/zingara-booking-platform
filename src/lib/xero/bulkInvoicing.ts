import { approvedInvoiceConversionStaffProfileIds } from "./invoiceRequests.ts";

export const bulkInvoiceBatchLimit = 50;
export const bulkInvoiceChunkSize = 10;
export const bulkInvoiceEligibleBookingStatuses = [
  "new",
  "pending_payment",
  "confirmed",
  "checked_in",
  "completed",
] as const;

const authorisedStaffIds = new Set<string>(
  Object.values(approvedInvoiceConversionStaffProfileIds),
);

export function canManageBulkInvoices(staffProfileId: string | null | undefined) {
  return Boolean(staffProfileId && authorisedStaffIds.has(staffProfileId));
}

export function bulkInvoicePostingEnabled() {
  return process.env.XERO_BULK_INVOICE_POSTING_AUTHORISED === "true";
}

export function paymentPosition(input: {
  amountPaid: number;
  outstanding: number;
  total: number;
}) {
  const paid = Math.round(input.amountPaid * 100);
  const outstanding = Math.round(input.outstanding * 100);
  const total = Math.round(input.total * 100);
  if (paid < 0 || outstanding < 0 || total <= 0 || paid + outstanding !== total) {
    return "unreconciled" as const;
  }
  if (paid === 0) return "unpaid" as const;
  if (outstanding === 0) return "fully_paid" as const;
  return "partially_paid" as const;
}

export function bulkInvoiceBlockers(input: {
  billingAddress: string;
  customerEmail: string;
  customerName: string;
  existingInvoice: boolean;
  paymentPosition: ReturnType<typeof paymentPosition>;
  venue: string | null;
}) {
  const blockers: string[] = [];
  if (input.existingInvoice) blockers.push("Invoice already exists");
  if (!input.customerName.trim()) blockers.push("Missing customer or Company name");
  if (!input.customerEmail.trim()) blockers.push("Missing billing email");
  if (!input.billingAddress.trim()) blockers.push("Missing billing address");
  if (!input.venue) blockers.push("Missing performance venue");
  if (input.paymentPosition === "unreconciled") blockers.push("Booking financials do not reconcile");
  return blockers;
}
