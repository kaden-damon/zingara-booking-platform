import type { XeroDocumentCommand } from "./accountingAdapter.ts";
import type { XeroMappingCategory } from "./mappings.ts";

type StoredLine = {
  description: string;
  mappingCategory?: string | null;
  quantity: string | number;
  taxRatePercent?: string | number | null;
  unitPrice: string | number;
};

export type QueueableXeroDocument = {
  company_id: string | null;
  contact_customer_id: string | null;
  customer_email: string | null;
  customer_name: string;
  document_date: string;
  id: string;
  kind: "invoice" | "quote";
  line_amount_type: "exclusive" | "inclusive" | "no-tax";
  lines: StoredLine[];
  local_reference: string;
  source_booking_id: string | null;
  source_corporate_request_id: string | null;
  status: string;
  valid_until: string | null;
  venue: "cape-town" | "johannesburg";
  version: number;
};

export function documentMappingCategory(document: QueueableXeroDocument): XeroMappingCategory {
  if (document.source_corporate_request_id) return "corporate";
  if (document.source_booking_id) return "ticket_sales";
  throw new Error("Link this document to a booking or Corporate enquiry before preparing it for Xero.");
}

export function buildXeroDocumentSyncPayload(
  document: QueueableXeroDocument,
  mappings: Array<{ account_code: string | null; category: string; tax_code: string | null; tax_rate?: number | null }>,
) {
  if (!document.company_id && !document.contact_customer_id) throw new Error("Link a Company or customer before preparing this document for Xero.");
  const approvedByCategory = new Map(mappings.map((mapping) => [mapping.category, mapping]));
  const contactNumber = document.company_id ? `ZINGARA-COMPANY-${document.company_id}` : `ZINGARA-CUSTOMER-${document.contact_customer_id}`;
  const command: Omit<XeroDocumentCommand, "contactId"> = {
    currencyCode: "ZAR",
    date: document.document_date,
    dueDate: document.valid_until ?? undefined,
    lineAmountTypes: document.line_amount_type === "exclusive" ? "Exclusive" : document.line_amount_type === "inclusive" ? "Inclusive" : "NoTax",
    lines: document.lines.map((line) => {
      const category = line.mappingCategory?.trim();
      const mapping = category ? approvedByCategory.get(category) : null;
      if (!category || !mapping?.account_code || !mapping.tax_code) {
        throw new Error("Choose an approved accounting category for every invoice line.");
      }
      const lineTaxRate = Number(line.taxRatePercent ?? 0);
      const mappedTaxRate = Number(mapping.tax_rate ?? 0);
      if (!Number.isFinite(lineTaxRate) || Math.abs(lineTaxRate - mappedTaxRate) > 0.0001) {
        throw new Error(`The ${category.replaceAll("_", " ")} line does not match its approved VAT treatment.`);
      }
      return {
        description: line.description,
        mapping: { accountCode: mapping.account_code, category, taxCode: mapping.tax_code },
        quantity: Number(line.quantity),
        unitAmount: Number(line.unitPrice),
      };
    }),
    localReference: document.local_reference,
  };
  return {
    command,
    contact: { contactNumber, emailAddress: document.customer_email ?? "", name: document.customer_name },
    contactSource: { companyId: document.company_id, customerId: document.contact_customer_id },
    documentVersion: document.version,
    kind: document.kind,
  };
}
