import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertInitialInvoiceSyncEligibility } from "./activation.ts";

const root = new URL("../../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

const eligible = {
  activationAt: "2026-10-23T10:00:00.000Z",
  canConvertRequestedQuote: true,
  connectionStatus: "connected",
  invoice: {
    created_at: "2026-10-23T10:00:01.000Z",
    kind: "invoice",
    source_quote_id: "quote-1",
    status: "draft",
  },
  liveSyncAuthorised: true,
  quote: {
    accepted_version: 2,
    id: "quote-1",
    invoice_requested_at: "2026-10-23T09:59:00.000Z",
    invoice_requested_version: 2,
    kind: "quote",
    status: "converted",
  },
  syncPaused: false,
  webhookConfigured: true,
};

test("initial activation admits only future accepted-requested invoice conversions", () => {
  assert.doesNotThrow(() => assertInitialInvoiceSyncEligibility(eligible));
  assert.throws(
    () => assertInitialInvoiceSyncEligibility({ ...eligible, invoice: { ...eligible.invoice, created_at: "2026-10-23T09:59:59.000Z" } }),
    /Pre-activation invoice drafts/,
  );
  assert.throws(
    () => assertInitialInvoiceSyncEligibility({ ...eligible, quote: { ...eligible.quote, invoice_requested_version: 1 } }),
    /Invoice Request evidence/,
  );
  assert.throws(
    () => assertInitialInvoiceSyncEligibility({ ...eligible, invoice: { ...eligible.invoice, kind: "quote" } }),
    /Only an invoice converted/,
  );
});

test("initial activation fails closed for security, permission and connection gaps", () => {
  assert.throws(() => assertInitialInvoiceSyncEligibility({ ...eligible, webhookConfigured: false }), /webhook/);
  assert.throws(() => assertInitialInvoiceSyncEligibility({ ...eligible, liveSyncAuthorised: false }), /paused/);
  assert.throws(() => assertInitialInvoiceSyncEligibility({ ...eligible, syncPaused: true }), /paused/);
  assert.throws(() => assertInitialInvoiceSyncEligibility({ ...eligible, canConvertRequestedQuote: false }), /Tristan or Rachelle/);
});

test("activation records an immutable cutoff and never bulk-releases old outbox rows", async () => {
  const [migration, connectionRoute, documentRoute, reconciliation, syncRoute, webhookRoute, workspace] = await Promise.all([
    source("supabase/migrations/20261023110000_phase_50_4g_xero_controlled_activation.sql"),
    source("src/app/api/admin/xero/connection/route.ts"),
    source("src/app/api/admin/xero/route.ts"),
    source("src/lib/xero/liveReconciliation.ts"),
    source("src/app/api/admin/xero/sync/route.ts"),
    source("src/app/api/xero/webhook/route.ts"),
    source("src/app/admin/XeroWorkspace.tsx"),
  ]);
  assert.match(migration, /live_sync_activated_at = coalesce\(live_sync_activated_at, clock_timestamp\(\)\)/);
  assert.match(migration, /xero_live_sync_activated/);
  assert.match(connectionRoute, /activate_xero_connection_atomic/);
  assert.match(connectionRoute, /Configure and validate the Xero webhook/);
  assert.doesNotMatch(connectionRoute, /from\("xero_sync_outbox"\)\.update\(\{ status: "pending"/);
  assert.match(documentRoute, /assertInitialInvoiceSyncEligibility/);
  assert.match(documentRoute, /const status = "pending"/);
  assert.match(migration, /complete_xero_document_sync_atomic/);
  assert.match(migration, /queue_xero_invoice_sync_atomic/);
  assert.match(migration, /XERO_INVOICE_CONVERTER_NOT_AUTHORISED/);
  assert.match(migration, /operation='document\.sync'/);
  assert.match(syncRoute, /eq\("operation", "document\.sync"\)/);
  assert.match(webhookRoute, /allowedTenantIds\.has\(event\.tenantId\)/);
  assert.match(reconciliation, /linkedProviderRows/);
  assert.doesNotMatch(reconciliation, /missing_xero/);
  assert.match(workspace, /Create in Xero/);
  assert.doesNotMatch(workspace, /Prepare for Xero/);
});
