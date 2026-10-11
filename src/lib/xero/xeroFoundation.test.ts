import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateXeroDocumentTotals, isAccountingMappingApproved } from "./documentMath.ts";
import { createXeroDocumentPdf } from "./documentPdf.ts";
import { canCreateXeroInvoice, canCreateXeroQuote } from "./access.ts";
import { getXeroRetryDecision, MockXeroTransport } from "./mockTransport.ts";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("AL-015 mixed-rate quote reconciles to R49,995 without inventing VAT", () => {
  const totals = calculateXeroDocumentTotals([
    { description: "Dinner, show and Zingara welcome drink", quantity: "22", unitPrice: "1540", taxCode: null, taxRatePercent: null },
    { description: "Dinner, show and Zingara welcome drink", quantity: "8", unitPrice: "1320", taxCode: null, taxRatePercent: null },
    { description: "Gratuity", quantity: "1", unitPrice: "4235", taxCode: null, taxRatePercent: null },
    { description: "Gratuity", quantity: "1", unitPrice: "1320", taxCode: null, taxRatePercent: null },
  ], "no-tax");
  assert.equal(totals.subtotalCents, 4_999_500);
  assert.equal(totals.taxCents, 0);
  assert.equal(totals.totalCents, 4_999_500);
});

test("INV-1237 supports four-decimal unit prices and mixed Standard/No VAT lines", () => {
  const totals = calculateXeroDocumentTotals([
    { description: "Middle Ring Dinner, show and Zingara welcome drink", quantity: "73", unitPrice: "1182.6087", taxCode: "OUTPUT", taxRatePercent: "15" },
    { description: "Show Gratuity 12.5%", quantity: "1", unitPrice: "12410", taxCode: "NONE", taxRatePercent: null },
    { description: "Halal surcharge", quantity: "4", unitPrice: "434.7826", taxCode: "OUTPUT", taxRatePercent: "15" },
  ], "exclusive");
  assert.equal(totals.lines[0].subtotalCents, 8_633_044);
  assert.equal(totals.lines[2].totalCents, 200_000);
  assert.equal(totals.lines[0].taxCents, 1_294_956);
  assert.equal(totals.totalCents, 11_369_000);
});

test("approved discounts use negative unit prices without allowing invalid quantities", () => {
  const totals = calculateXeroDocumentTotals([
    { description: "Dinner and show", quantity: "10", unitPrice: "1000", taxCode: null, taxRatePercent: null },
    { description: "Approved discount", quantity: "1", unitPrice: "-500", taxCode: null, taxRatePercent: null },
  ], "no-tax");
  assert.equal(totals.totalCents, 950_000);
  assert.throws(() => calculateXeroDocumentTotals([
    { description: "Invalid", quantity: "-1", unitPrice: "100", taxCode: null, taxRatePercent: null },
  ], "no-tax"), /valid positive number/);
  assert.throws(() => calculateXeroDocumentTotals([
    { description: "Excess discount", quantity: "1", unitPrice: "-1", taxCode: null, taxRatePercent: null },
  ], "no-tax"), /cannot make the document total negative/);
});

test("inclusive, exclusive and no-VAT treatments remain distinct", () => {
  const line = [{ description: "Approved service", quantity: "1", unitPrice: "115.0000", taxCode: "OUTPUT", taxRatePercent: "15" }];
  assert.deepEqual(calculateXeroDocumentTotals(line, "inclusive"), {
    lines: [{ ...line[0], subtotalCents: 10_000, taxCents: 1_500, totalCents: 11_500 }],
    subtotalCents: 10_000, taxCents: 1_500, totalCents: 11_500,
  });
  assert.equal(calculateXeroDocumentTotals(line, "exclusive").totalCents, 13_225);
  assert.equal(calculateXeroDocumentTotals(line, "no-tax").totalCents, 11_500);
  assert.throws(() => calculateXeroDocumentTotals([{ ...line[0], description: "" }], "no-tax"), /line description/);
  assert.throws(() => calculateXeroDocumentTotals([{ ...line[0], unitPrice: "1.00001" }], "no-tax"), /no more than 4 decimal places/);
});

test("unapproved accounting mappings fail closed", () => {
  assert.equal(isAccountingMappingApproved({ accountCode: "200", approvedAt: null, taxCode: "OUTPUT" }), false);
  assert.equal(isAccountingMappingApproved({ accountCode: "200", approvedAt: "2026-10-11T10:00:00Z", taxCode: "OUTPUT" }), true);
});

test("Sales, Box Office and Accounts actions preserve the existing permission model", () => {
  assert.equal(canCreateXeroQuote(["bookings:manage"]), true);
  assert.equal(canCreateXeroQuote(["analytics:read"]), false);
  assert.equal(canCreateXeroInvoice({ permissions: ["bookings:reconcile"], roleName: "Box Office Manager" }), true);
  assert.equal(canCreateXeroInvoice({ permissions: ["analytics:read"], roleName: "Finance" }), true);
  assert.equal(canCreateXeroInvoice({ permissions: ["bookings:manage"], roleName: "Box Office" }), false);
});

test("mock transport makes mutation retries idempotent and classifies retryable failures", async () => {
  const transport = new MockXeroTransport([{ data: { InvoiceID: "inv-1" }, status: 200 }]);
  const input = { body: {}, idempotencyKey: "invoice:local-1:v1", method: "POST" as const, path: "/Invoices", tenantId: "tenant-1" };
  const first = await transport.request(input);
  const second = await transport.request(input);
  assert.deepEqual(first, second);
  assert.equal(transport.calls.length, 2);
  assert.equal(getXeroRetryDecision(429, 3).retryable, true);
  assert.equal(getXeroRetryDecision(403, 1).retryable, false);
});

test("schema is server-only, versioned, paused and blocks local issued invoices", async () => {
  const migration = await source("../../../supabase/migrations/20261011130000_phase_49_xero_disconnected_foundation.sql");
  assert.match(migration, /sync_paused boolean not null default true/);
  assert.match(migration, /xero_document_versions_no_update/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /xero_issued_invoice_authority/);
  assert.match(migration, /create_xero_document_draft_atomic/);
  assert.match(migration, /accept_xero_quote_atomic/);
  assert.match(migration, /convert_xero_quote_to_invoice_draft_atomic/);
  assert.match(migration, /xero_documents_one_invoice_per_quote_idx/);
  assert.match(migration, /revoke all on public\.xero_connections[\s\S]*from public, anon, authenticated/);
});

test("draft revisions are atomic, versioned and cannot alter accepted or Xero-linked documents", async () => {
  const migration = await source("../../../supabase/migrations/20261011213000_phase_49_0a_xero_draft_revision.sql");
  assert.match(migration, /for update/);
  assert.match(migration, /v_document\.version <> p_expected_version/);
  assert.match(migration, /v_document\.status not in \('draft', 'revised'\)/);
  assert.match(migration, /v_document\.accepted_at is not null/);
  assert.match(migration, /v_document\.xero_document_id is not null/);
  assert.match(migration, /insert into public\.xero_document_versions/);
});

test("quote and invoice PDFs keep local/Xero and payment truth explicit", () => {
  const line = calculateXeroDocumentTotals([
    { description: "A long approved commercial description that remains readable when the document is rendered", quantity: "2", unitPrice: "1000.0000", taxCode: "OUTPUT", taxRatePercent: "15" },
  ], "exclusive");
  const base = {
    accountNumber: "AC-100", billingAddress: "1 Loop Street, Cape Town", customerEmail: "accounts@example.test",
    customerName: "Example Company", customerNotes: "Approved terms", documentDate: "2026-10-11", guestCount: 2,
    lineAmountType: "exclusive" as const, lines: line.lines, localReference: "ZQ-TEST", paymentTerms: "Payment before the show",
    performanceDate: "2026-10-20", performanceTime: "19:30", seatingSummary: "Middle Ring", sourceBookingReference: "ZNG-TEST",
    status: "draft", subtotalCents: line.subtotalCents, taxCents: line.taxCents, totalCents: line.totalCents,
    validUntil: "2026-10-18", venue: "cape-town", xeroDocumentNumber: null,
  };
  const quoteText = new TextDecoder().decode(createXeroDocumentPdf({ ...base, kind: "quote" }));
  const invoiceText = new TextDecoder().decode(createXeroDocumentPdf({ ...base, kind: "invoice" }));
  assert.match(quoteText, /Cost Estimate Quote/);
  assert.match(invoiceText, /Tax Invoice Draft/);
  assert.match(invoiceText, /Invoice Number: Awaiting Xero/);
  assert.match(invoiceText, /Total Net Payments ZAR: Review verified payments in Zingara/);
  assert.match(invoiceText, /Local Zingara operational document\. Not issued by Xero\./);
});

test("admin integration stays bounded and presents disconnected truth", async () => {
  const [route, workspace, adminPage] = await Promise.all([
    source("../../app/api/admin/xero/route.ts"),
    source("../../app/admin/XeroWorkspace.tsx"),
    source("../../app/admin/page.tsx"),
  ]);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /canCreateInvoice/);
  assert.match(route, /prefillBookingReference/);
  assert.match(route, /prefillCorporateRequestId/);
  assert.match(route, /resolveSourceCorporateRequest/);
  assert.match(route, /resolveSourceBooking/);
  assert.match(route, /The linked booking is outside this venue/);
  assert.match(route, /Add a valid billing email/);
  assert.match(route, /Add a billing address/);
  assert.match(workspace, /Live sync paused/);
  assert.match(workspace, /pageSize: "10"/);
  assert.match(workspace, /Create Invoice Draft/);
  assert.match(workspace, /initialCorporateRequestId/);
  assert.match(adminPage, /canManageBookings && !openCorporateRequest\.linkedBookingReference/);
  assert.match(adminPage, /section=xero&quoteRequest=/);
  assert.match(workspace, /Edit Draft/);
  assert.match(workspace, /Review & Accept/);
  assert.match(workspace, /Custom service lines never create guests, tickets or seats/);
  assert.doesNotMatch(workspace, /Xero is connected/);
});
