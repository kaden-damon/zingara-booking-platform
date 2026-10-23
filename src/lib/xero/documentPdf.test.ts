import assert from "node:assert/strict";
import test from "node:test";

import { calculateXeroDocumentTotals, type XeroDocumentLineInput } from "./documentMath.ts";
import { createXeroDocumentPdf, type XeroPdfDocument } from "./documentPdf.ts";

function documentFixture(kind: "invoice" | "quote", lines: XeroDocumentLineInput[]): XeroPdfDocument {
  const totals = calculateXeroDocumentTotals(lines, "exclusive");
  return {
    accountNumber: "SAMPLE-001",
    billingAddress: "18 Sample Avenue, Rosebank, Johannesburg, 2196",
    customerEmail: "accounts@example.test",
    customerName: "Zingara Visual Approval Company",
    customerNotes: "Synthetic visual approval document.",
    documentDate: "2026-10-23",
    guestCount: 18,
    kind,
    lineAmountType: "exclusive",
    lines: totals.lines,
    localReference: kind === "invoice" ? "ZI-SAMPLE-001" : "ZQ-SAMPLE-001",
    paymentTerms: "Synthetic sample only.",
    performanceDate: "2026-12-10",
    performanceTime: "18:00",
    seatingSummary: "Golden Circle and Middle Ring",
    sourceBookingReference: "SAMPLE-NOT-A-BOOKING",
    status: "draft",
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    validUntil: "2026-10-25",
    venue: "johannesburg",
    xeroDocumentNumber: null,
  };
}

function pdfText(document: XeroPdfDocument) {
  return new TextDecoder().decode(createXeroDocumentPdf(document));
}

function pageCount(pdf: string) {
  return pdf.match(/\/Type \/Page\b/g)?.length ?? 0;
}

const representativeLines: XeroDocumentLineInput[] = [
  { description: "Golden Circle dinner, show and welcome drink", quantity: "12", unitPrice: "1450.0000", taxCode: "OUTPUT", taxRatePercent: "15" },
  { description: "Show gratuity 12.5%", quantity: "1", unitPrice: "3112.5000", taxCode: "NONE", taxRatePercent: null },
  { description: "Approved commercial discount", quantity: "1", unitPrice: "-750.0000", taxCode: "NONE", taxRatePercent: null },
];

test("quotation and invoice retain their approved page formats and selectable text", () => {
  const quote = pdfText(documentFixture("quote", representativeLines));
  const invoice = pdfText(documentFixture("invoice", representativeLines));

  assert.match(quote, /\/MediaBox \[0 0 595 842\]/);
  assert.match(invoice, /\/MediaBox \[0 0 612 792\]/);
  assert.equal(pageCount(quote), 1);
  assert.equal(pageCount(invoice), 2);
  assert.match(quote, /Zingara Visual Approval Company/);
  assert.match(invoice, /Terms and Conditions/);
  assert.match(invoice, /Page 2 of 2/);
});

test("long line-item collections overflow onto continuation pages without losing totals", () => {
  const lines = Array.from({ length: 32 }, (_, index) => ({
    description: `Approved service line ${index + 1} with a deliberately long description that must wrap cleanly`,
    quantity: "1",
    unitPrice: "100.0000",
    taxCode: "OUTPUT",
    taxRatePercent: "15",
  }));
  const quote = pdfText(documentFixture("quote", lines));
  const invoice = pdfText(documentFixture("invoice", lines));

  assert.ok(pageCount(quote) > 1);
  assert.ok(pageCount(invoice) > 2);
  assert.match(quote, /COST ESTIMATE QUOTE - CONTINUED/);
  assert.match(invoice, /TAX INVOICE - CONTINUED/);
  assert.match(quote, /3 680,00/);
  assert.match(invoice, /3 680,00/);
});

test("templates never copy historical customer or banking data from the visual references", () => {
  const invoice = pdfText(documentFixture("invoice", representativeLines));

  assert.match(invoice, /approved Confirmation of Banking Details/);
  assert.doesNotMatch(invoice, /63170118468/);
  assert.doesNotMatch(invoice, /Fatima Ouanssaidi/);
  assert.doesNotMatch(invoice, /OnPoint PR/);
});
