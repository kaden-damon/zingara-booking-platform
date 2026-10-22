import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  approvedInvoiceConversionStaffProfileIds,
  canConvertRequestedQuote,
} from "./invoiceRequests.ts";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("invoice conversion is limited to verified Tristan and Rachelle identities with existing authority", () => {
  assert.equal(
    canConvertRequestedQuote(
      { active: true, id: approvedInvoiceConversionStaffProfileIds.tristanChetty },
      true,
    ),
    true,
  );
  assert.equal(
    canConvertRequestedQuote(
      { active: true, id: approvedInvoiceConversionStaffProfileIds.rachelleSmuts },
      true,
    ),
    true,
  );
  assert.equal(
    canConvertRequestedQuote(
      { active: true, id: "6ae026bc-8815-4fea-b56c-b2103eb0c093" },
      true,
    ),
    false,
  );
  assert.equal(
    canConvertRequestedQuote(
      { active: true, id: approvedInvoiceConversionStaffProfileIds.tristanChetty },
      false,
    ),
    false,
  );
  assert.equal(
    canConvertRequestedQuote(
      { active: false, id: approvedInvoiceConversionStaffProfileIds.rachelleSmuts },
      true,
    ),
    false,
  );
});

test("invoice request migration is atomic, version-bound, audited and default-off", async () => {
  const migration = await source(
    "../../../supabase/migrations/20261022140000_phase_50_13_invoice_requests.sql",
  );
  assert.match(migration, /request_xero_invoice_atomic/);
  assert.match(migration, /for update/);
  assert.match(migration, /accepted_version <> v_quote\.version/);
  assert.match(migration, /INVOICE_ALREADY_REQUESTED/);
  assert.match(migration, /xero_invoice_requested/);
  assert.match(migration, /invoice_requested_version <> v_quote\.accepted_version/);
  assert.match(migration, /xero_documents_one_invoice_per_quote_idx|INVOICE_ALREADY_EXISTS/);
  assert.match(migration, /'invoice-request-reminders', false/);
});

test("admin request and reminder paths remain bounded and keep Xero paused", async () => {
  const [route, workflow, runner, workspace, settings] = await Promise.all([
    source("../../app/api/admin/xero/route.ts"),
    source("../workflows/invoiceRequestReminders.ts"),
    source("../../app/api/workflows/run/route.ts"),
    source("../../app/admin/XeroWorkspace.tsx"),
    source("../../app/admin/EmailNotificationsSettings.tsx"),
  ]);
  assert.match(route, /action\?: "accept" \| "convert" \| "queue" \| "request-invoice"/);
  assert.match(route, /Only authorised Accounts staff can convert invoice requests/);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(workflow, /\.limit\(summaryLimit\)/);
  assert.match(workflow, /claimStaffEmailDelivery/);
  assert.match(workflow, /completeStaffEmailDelivery/);
  assert.match(workflow, /currentHour\(now\) !== scheduleHour/);
  assert.match(workflow, /escapeHtml\(request\.customer_name\)/);
  assert.match(workflow, /summaryLimit = 25/);
  assert.match(workflow, /VIEW INVOICE REQUESTS/);
  assert.match(workflow, /Zingara \| Invoices Awaiting Processing/);
  assert.match(runner, /runInvoiceRequestReminder/);
  assert.match(workspace, /Request Invoice/);
  assert.match(workspace, /Invoice Requested/);
  assert.match(workspace, /invoiceRequested/);
  assert.match(workflow, /invoiceRequested=true/);
  assert.match(settings, /Invoice Request Reminders/);
  assert.doesNotMatch(workflow, /XERO_LIVE_SYNC_AUTHORISED/);
});

test("quotation acceptance and banking confirmation fail closed with immutable evidence", async () => {
  const [migration, quoteRoute, publicRoute, bankingRoute, workspace] = await Promise.all([
    source("../../../supabase/migrations/20261022140000_phase_50_13_invoice_requests.sql"),
    source("../../app/api/admin/xero/route.ts"),
    source("../../app/api/quotes/[token]/route.ts"),
    source("../../app/api/admin/xero/banking-document/route.ts"),
    source("../../app/admin/XeroWorkspace.tsx"),
  ]);
  assert.match(migration, /xero_banking_documents/);
  assert.match(migration, /xero_active_banking_document/);
  assert.match(migration, /xero_quote_acceptance_links/);
  assert.match(migration, /token_hash/);
  assert.match(migration, /v_quote\.version<>v_link\.document_version/);
  assert.match(migration, /xero_quote_customer_accepted/);
  assert.match(migration, /status='revoked'/);
  assert.match(quoteRoute, /Confirmation of Banking Details PDF/);
  assert.match(quoteRoute, /VIEW & ACCEPT QUOTE/);
  assert.match(quoteRoute, /banking_document_id/);
  assert.match(quoteRoute, /filename: `\$\{current\.local_reference\}\.pdf`/);
  assert.match(quoteRoute, /filename: bankingDocument\.original_filename/);
  assert.match(quoteRoute, /contentDisposition: "attachment" as const/);
  assert.match(publicRoute, /accept_xero_quote_by_token_atomic/);
  assert.match(publicRoute, /quote-accepted/);
  assert.doesNotMatch(publicRoute, /convert_xero_quote_to_invoice/);
  assert.match(bankingRoute, /canReplaceBankingDocument/);
  assert.match(bankingRoute, /validateBankingPdf/);
  assert.match(workspace, /XeroBankingDocumentPanel/);
});

test("Xero workspace controls keep the rounded Zingara action language", async () => {
  const [workspace, connection, banking, acceptance] = await Promise.all([
    source("../../app/admin/XeroWorkspace.tsx"),
    source("../../app/admin/XeroConnectionPanel.tsx"),
    source("../../app/admin/XeroBankingDocumentPanel.tsx"),
    source("../../app/quote/[token]/QuoteAcceptanceClient.tsx"),
  ]);
  assert.match(workspace, /const primaryButton = "[^"]*rounded-full/);
  assert.match(workspace, /const secondaryButton = "[^"]*rounded-full/);
  assert.match(workspace, /overflow-x-auto rounded-xl border/);
  assert.match(workspace, /aria-label="Move line up"[\s\S]{0,500}rounded-full/);
  assert.match(connection, /role="tab"[^>]*rounded-full/);
  assert.match(connection, /matching Xero accounts`[^>]*>[\s\S]*rounded-full/);
  assert.match(banking, /rounded-full/);
  assert.match(acceptance, /ACCEPT QUOTATION/);
  assert.doesNotMatch(acceptance, /rounded-none/);
});
