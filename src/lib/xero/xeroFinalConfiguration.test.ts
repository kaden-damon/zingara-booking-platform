import assert from "node:assert/strict";
import test from "node:test";
import { XeroAccountingAdapter } from "./accountingAdapter.ts";
import { buildXeroDocumentSyncPayload, type QueueableXeroDocument } from "./queue.ts";
import { calculateXeroDocumentTotals } from "./documentMath.ts";
import { executeXeroOperation } from "./operations.ts";
import { resolveXeroPaymentAccount } from "./mappings.ts";
import { updatesXeroDocumentIdentity, runXeroOutboxWorker, type XeroWorkerStore } from "./worker.ts";
import { MockXeroTransport } from "./transport.ts";

const response = (data: unknown) => ({ correlationId: "mock", data, retryAfterSeconds: null, status: 200 });

test("payment destinations use the separate approved immutable bank IDs, never a ledger code or stale payload account", () => {
  const mappings = [{ category: "payfast_clearing_account", account_id: "payfast-id", account_type: "BANK", approved_at: "2026-10-21" }, { category: "eft_payment_account", account_id: "fnb-id", account_type: "BANK", approved_at: "2026-10-21" }];
  assert.equal(resolveXeroPaymentAccount("successful_payfast", mappings), "payfast-id");
  assert.equal(resolveXeroPaymentAccount("structured_manual", mappings), "fnb-id");
  assert.throws(() => resolveXeroPaymentAccount("reconciled_import", mappings), /manual reconciliation/);
  assert.throws(() => resolveXeroPaymentAccount("successful_payfast", mappings.map((mapping) => ({ ...mapping, approved_at: null }))), /Approve/);
  assert.throws(() => resolveXeroPaymentAccount("structured_manual", mappings.map((mapping) => ({ ...mapping, account_type: "CURRLIAB" }))), /Approve/);
});

test("credit note allocation uses the official Allocations wrapper and original invoice identity with a stable retry key", async () => {
  const transport = new MockXeroTransport([response({ Allocations: [{ AllocationID: "allocation-id", Amount: 100 }] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant");
  const input = { amount: 100, creditNoteId: "approved-credit", invoiceId: "original-invoice" };
  const first = await adapter.allocateCreditNote(input, "existing-refund-key:allocation");
  const retry = await adapter.allocateCreditNote(input, "existing-refund-key:allocation");
  assert.deepEqual(first, retry);
  assert.deepEqual(transport.calls[0].body, { Allocations: [{ Amount: 100, Invoice: { InvoiceID: "original-invoice" } }] });
  assert(transport.calls.every((call) => call.path === "/CreditNotes/approved-credit/Allocations" && call.idempotencyKey === "existing-refund-key:allocation"));
});

test("credit note and payment completion retain the original invoice identity", async () => {
  let originalInvoiceId = "original-invoice";
  for (const operation of ["payment.allocate", "credit_note.create", "credit_note.allocate"]) {
    const store: XeroWorkerStore = {
      claim: async () => [{ attemptCount: 0, documentId: "local-invoice", id: "mock-outbox", idempotencyKey: "mock-key", operation, payload: {}, tenantId: "tenant" }],
      connection: async () => ({ configured: true, connected: true, mappingsApproved: true, syncPaused: false }),
      complete: async (item, result) => { if (updatesXeroDocumentIdentity(item.operation)) originalInvoiceId = result.providerId!; },
      fail: async () => { assert.fail("The mocked completion should succeed."); },
    };
    await runXeroOutboxWorker({ store, workerId: "mock-worker", execute: async () => ({ providerId: "payment-or-credit-id" }) });
    assert.equal(originalInvoiceId, "original-invoice");
  }
});

function document(venue: "cape-town" | "johannesburg", discount: number, corporate: boolean, kind: "invoice" | "quote" = "invoice"): QueueableXeroDocument {
  return { company_id: "company", contact_customer_id: null, customer_email: null, customer_name: "Mock company", document_date: "2026-10-21", id: "document", kind, line_amount_type: "inclusive", lines: [{ description: "Sale", mappingCategory: corporate ? "corporate" : "ticket_sales", quantity: "2", taxRatePercent: "15", unitPrice: "500" }, { description: "Existing approved discount", mappingCategory: "discounts", quantity: "1", taxRatePercent: "15", unitPrice: String(-discount) }], local_reference: "MOCK", source_booking_id: corporate ? null : "booking", source_corporate_request_id: corporate ? "request" : null, status: "draft", valid_until: null, venue, version: 2 };
}

test("existing percentage, fixed, corporate, amendment and quote discounts reduce the same venue sale once", () => {
  for (const venue of ["johannesburg", "cape-town"] as const) {
    const code = venue === "johannesburg" ? "205" : "205-01";
    for (const [discount, corporate, kind] of [[100, false, "invoice"], [150, false, "invoice"], [200, true, "invoice"], [125, true, "quote"], [50, false, "quote"]] as const) {
      const doc = document(venue, discount, corporate, kind);
      const before = structuredClone(doc);
      const payload = buildXeroDocumentSyncPayload(doc, [{ account_code: code, category: corporate ? "corporate" : "ticket_sales", tax_code: "OUTPUT3", tax_rate: 15 }, { account_code: code, category: "discounts", tax_code: "OUTPUT3", tax_rate: 15 }]);
      assert.equal(payload.command.lines.length, 2);
      assert(payload.command.lines.every((line) => line.mapping.accountCode === code && line.mapping.taxCode === "OUTPUT3"));
      assert.equal(payload.command.lines[1].unitAmount, -discount);
      const totals = calculateXeroDocumentTotals(doc.lines.map((line) => ({ description: line.description, quantity: String(line.quantity), unitPrice: String(line.unitPrice), taxCode: "OUTPUT3", taxRatePercent: "15" })), "inclusive");
      assert.equal(totals.totalCents, (1000 - discount) * 100);
      assert.deepEqual(doc, before);
    }
  }
});

test("missing original invoice leaves a refund for manual reconciliation without any mock write", async () => {
  const transport = new MockXeroTransport([response({ Invoices: [] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant");
  await assert.rejects(executeXeroOperation(adapter, { attemptCount: 0, documentId: "local-invoice", id: "outbox", idempotencyKey: "existing-stable-key", operation: "credit_note.create", payload: { originalInvoiceId: "missing", refundId: "refund", amountCents: 10000, command: { contactId: "contact", lines: [] } }, tenantId: "tenant" }), /pending manual reconciliation/);
  assert(transport.calls.every((call) => call.method === "GET"));
});

test("deposit allocates to one full-value invoice using the verified payment destination", async () => {
  const transport = new MockXeroTransport([response({ Invoices: [{ InvoiceID: "invoice" }] }), response({ Payments: [{ PaymentID: "deposit" }] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant");
  const payload = buildXeroDocumentSyncPayload(document("johannesburg", 100, true), [{ account_code: "205", category: "corporate", tax_code: "OUTPUT3", tax_rate: 15 }, { account_code: "205", category: "discounts", tax_code: "OUTPUT3", tax_rate: 15 }]);
  await adapter.createInvoice({ ...payload.command, contactId: "contact" }, "invoice-key");
  await adapter.allocatePayment({ accountId: "verified-payfast-id", amount: 200, date: "2026-10-21", invoiceId: "invoice", reference: "verified-deposit" }, "deposit-key");
  assert.deepEqual(transport.calls.map((call) => call.path.split("?")[0]), ["/Invoices", "/Payments"]);
  assert.equal((transport.calls[1].body as { Payments: Array<{ Invoice: { InvoiceID: string } }> }).Payments[0].Invoice.InvoiceID, "invoice");
});
