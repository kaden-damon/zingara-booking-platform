import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertDirectBookingInvoiceSyncEligibility,
  assertInitialInvoiceSyncEligibility,
} from "./activation.ts";

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

test("connection controls present only the action appropriate to the current sync state", async () => {
  const panel = await source("src/app/admin/XeroConnectionPanel.tsx");
  assert.match(panel, /current\?\.tenant_id && !current\.sync_paused && <button[^>]*>[\s\S]*?Pause Sync/);
  assert.match(panel, /current\?\.tenant_id && current\.sync_paused && <button[^>]*>[\s\S]*?Enable Sync/);
  assert.doesNotMatch(panel, /disabled=\{busy \|\| current\.sync_paused\}[\s\S]*Pause Sync/);
  assert.match(panel, /quietButton[\s\S]*Disconnect/);
});

const directBooking = {
  amount_paid: 18_125,
  archived_at: null,
  balance_outstanding: 0,
  booking_status: "confirmed",
  id: "booking-1",
  payment_status: "fully_paid",
  total_amount: 18_125,
};

const directInvoice = {
  created_at: "2026-10-29T10:00:00.000Z",
  kind: "invoice",
  source_booking_id: "booking-1",
  source_quote_id: null,
  status: "draft",
  total_cents: 1_812_500,
};

test("direct booking invoices require exact fully paid booking evidence", () => {
  const input = {
    activationAt: "2026-10-23T10:00:00.000Z",
    booking: directBooking,
    canConvertRequestedQuote: true,
    connectionStatus: "connected",
    invoice: directInvoice,
    liveSyncAuthorised: true,
    syncPaused: false,
    verifiedPaymentTotal: 18_125,
    webhookConfigured: true,
  };
  assert.doesNotThrow(() => assertDirectBookingInvoiceSyncEligibility(input));
  assert.throws(
    () => assertDirectBookingInvoiceSyncEligibility({ ...input, verifiedPaymentTotal: 16_875 }),
    /do not reconcile exactly/,
  );
  assert.throws(
    () => assertDirectBookingInvoiceSyncEligibility({ ...input, booking: { ...directBooking, balance_outstanding: 1 } }),
    /do not reconcile exactly/,
  );
  assert.throws(
    () => assertDirectBookingInvoiceSyncEligibility({ ...input, booking: { ...directBooking, payment_status: "deposit_paid" } }),
    /not an active, fully paid booking/,
  );
  assert.throws(
    () => assertDirectBookingInvoiceSyncEligibility({ ...input, canConvertRequestedQuote: false }),
    /Tristan or Rachelle/,
  );
});

test("approved bulk booking invoices permit reconciled outstanding balances", () => {
  assert.doesNotThrow(() => assertDirectBookingInvoiceSyncEligibility({
    activationAt: "2026-10-20T10:00:00.000Z",
    allowOutstanding: true,
    booking: {
      amount_paid: 250,
      archived_at: null,
      balance_outstanding: 750,
      booking_status: "confirmed",
      id: "booking-1",
      payment_status: "deposit_paid",
      total_amount: 1000,
    },
    canConvertRequestedQuote: true,
    connectionStatus: "connected",
    invoice: {
      created_at: "2026-10-29T10:00:00.000Z",
      kind: "invoice",
      source_booking_id: "booking-1",
      source_quote_id: null,
      status: "draft",
      total_cents: 100000,
    },
    liveSyncAuthorised: true,
    syncPaused: false,
    verifiedPaymentTotal: 250,
    webhookConfigured: true,
  }));
});
