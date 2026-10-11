import { createZingaraTextPdf } from "../exports/zingaraTextPdf.ts";
import type { XeroCalculatedLine, XeroLineAmountType } from "./documentMath";

export type XeroPdfDocument = {
  accountNumber: string | null;
  billingAddress: string | null;
  customerEmail: string | null;
  customerName: string;
  customerNotes: string | null;
  documentDate: string;
  guestCount: number | null;
  kind: "invoice" | "quote";
  lineAmountType: XeroLineAmountType;
  lines: XeroCalculatedLine[];
  localReference: string;
  paymentTerms: string | null;
  performanceDate: string | null;
  performanceTime: string | null;
  seatingSummary: string | null;
  sourceBookingReference: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  validUntil: string | null;
  venue: string;
  xeroDocumentNumber: string | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(cents / 100);
}

function venueLabel(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function taxLabel(document: XeroPdfDocument) {
  return document.lineAmountType === "no-tax" ? "-" : money(document.taxCents);
}

export function createXeroDocumentPdf(document: XeroPdfDocument) {
  const invoice = document.kind === "invoice";
  const identityRows = invoice
    ? [
        { label: "Invoice Date", value: document.documentDate },
        { label: "Account Number", value: document.accountNumber || "Awaiting Accounts" },
        { label: "Invoice Number", value: document.xeroDocumentNumber || "Awaiting Xero" },
        { label: "Reference", value: document.sourceBookingReference || document.localReference },
      ]
    : [
        { label: "Quote", value: document.localReference },
        { label: "Date", value: document.documentDate },
        { label: "Reference", value: document.sourceBookingReference || "Not linked" },
        { label: "Valid until", value: document.validUntil || "Not set" },
      ];

  const totalsRows = invoice
    ? [
        { label: "Subtotal", value: money(document.subtotalCents) },
        { label: document.lineAmountType === "no-tax" ? "Total No VAT 0%" : "VAT", value: taxLabel(document) },
        { label: "Invoice Total ZAR", value: money(document.totalCents) },
        { label: "Total Net Payments ZAR", value: "Review verified payments in Zingara" },
        { label: "Amount Due ZAR", value: "Awaiting Accounts" },
      ]
    : [
        { label: "SUB-TOTAL", value: money(document.subtotalCents) },
        { label: "VAT", value: taxLabel(document) },
        { label: "TOTAL", value: money(document.totalCents) },
      ];

  return createZingaraTextPdf({
    footer: "Local Zingara operational document. Not issued by Xero.",
    sections: [
      { title: invoice ? "Invoice Details" : "Quote Details", rows: identityRows },
      { title: "Customer", rows: [
        { label: "Customer / Company", value: document.customerName },
        { label: "Email", value: document.customerEmail || "Not recorded" },
        { label: "Billing address", value: document.billingAddress || "Not recorded" },
      ] },
      { title: "Performance", rows: [
        { label: "Venue", value: venueLabel(document.venue) },
        { label: "Date / time", value: [document.performanceDate, document.performanceTime].filter(Boolean).join(" at ") || "Not linked" },
        { label: "Seating", value: document.seatingSummary || "Not recorded" },
        { label: "Pax", value: document.guestCount === null ? "Not recorded" : String(document.guestCount) },
      ] },
      { title: "Description | Quantity | Unit Price | VAT | Amount ZAR", rows: document.lines.map((line) => ({
        value: `${line.description} | ${line.quantity} | ${line.unitPrice} | ${line.taxRatePercent || "No VAT"} | ${money(line.totalCents)}`,
      })) },
      { title: "Totals", rows: totalsRows },
      { title: "Terms", rows: [
        { label: "Payment terms", value: document.paymentTerms || "Not set" },
        { label: "Customer notes", value: document.customerNotes || "None" },
      ] },
    ],
    subtitle: `${document.localReference} | ${document.customerName} | ${document.status.replaceAll("_", " ")}`,
    title: invoice ? "Tax Invoice Draft" : "Cost Estimate Quote",
  });
}
