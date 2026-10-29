import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bulkInvoiceBlockers,
  canManageBulkInvoices,
  paymentPosition,
} from "./bulkInvoicing.ts";

test("bulk invoicing is restricted to the two approved Accounts identities", () => {
  assert.equal(canManageBulkInvoices("1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d"), true);
  assert.equal(canManageBulkInvoices("3ea8ff16-d914-477b-95fc-23380e71019a"), true);
  assert.equal(canManageBulkInvoices("00000000-0000-0000-0000-000000000000"), false);
});

test("payment position accepts full, partial and unpaid reconciled bookings", () => {
  assert.equal(paymentPosition({ amountPaid: 100, outstanding: 0, total: 100 }), "fully_paid");
  assert.equal(paymentPosition({ amountPaid: 25, outstanding: 75, total: 100 }), "partially_paid");
  assert.equal(paymentPosition({ amountPaid: 0, outstanding: 100, total: 100 }), "unpaid");
  assert.equal(paymentPosition({ amountPaid: 25, outstanding: 70, total: 100 }), "unreconciled");
});

test("missing billing data and existing invoices fail closed", () => {
  assert.deepEqual(bulkInvoiceBlockers({
    billingAddress: "",
    customerEmail: "",
    customerName: "",
    existingInvoice: true,
    paymentPosition: "unreconciled",
    venue: null,
  }), [
    "Invoice already exists",
    "Missing customer or Company name",
    "Missing billing email",
    "Missing billing address",
    "Missing performance venue",
    "Booking financials do not reconcile",
  ]);
});

test("bulk posting remains behind its disabled Production feature flag", async () => {
  const route = await readFile(new URL("../../app/api/admin/xero/bulk-invoices/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../../app/admin/XeroBulkInvoicingPanel.tsx", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../../supabase/migrations/20261029183000_phase_58_bulk_invoicing.sql", import.meta.url), "utf8");
  assert.match(route, /bulkInvoicePostingEnabled/);
  assert.match(route, /awaiting separate accounting approval/);
  assert.match(workspace, /Bulk Xero posting is off/);
  assert.match(migration, /selected_count between 1 and 50/);
  assert.match(migration, /source_quote_id is not null/);
  assert.match(migration, /source_booking_id is null/);
});
