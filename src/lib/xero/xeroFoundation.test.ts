import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateXeroDocumentTotals, isAccountingMappingApproved } from "./documentMath.ts";
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
  assert.equal(totals.totalCents, 11_369_001);
});

test("unapproved accounting mappings fail closed", () => {
  assert.equal(isAccountingMappingApproved({ accountCode: "200", approvedAt: null, taxCode: "OUTPUT" }), false);
  assert.equal(isAccountingMappingApproved({ accountCode: "200", approvedAt: "2026-10-11T10:00:00Z", taxCode: "OUTPUT" }), true);
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

test("admin integration stays bounded and presents disconnected truth", async () => {
  const [route, workspace] = await Promise.all([
    source("../../app/api/admin/xero/route.ts"),
    source("../../app/admin/XeroWorkspace.tsx"),
  ]);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(workspace, /Live sync paused/);
  assert.match(workspace, /Custom service lines never create guests, tickets or seats/);
  assert.doesNotMatch(workspace, /Xero is connected/);
});
