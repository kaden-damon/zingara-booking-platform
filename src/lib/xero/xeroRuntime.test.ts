import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { XeroAccountingAdapter } from "./accountingAdapter.ts";
import { getXeroConfiguration } from "./config.ts";
import { buildXeroAuthorizationUrl, createXeroOAuthState, exchangeXeroCode, listXeroTenants, refreshXeroTokens } from "./oauth.ts";
import { reconcileAccounting } from "./reconciliation.ts";
import { buildInvoiceReconciliation, shouldApplyWebhookEvent } from "./inbound.ts";
import { buildXeroDocumentSyncPayload, documentMappingCategory } from "./queue.ts";
import { allRequiredXeroMappingsApproved, expectedXeroAccountCode, isXeroMappingApprovalSupported, xeroMappingKey } from "./mappings.ts";
import { normaliseXeroDiscovery, verifiedXeroMapping } from "./discovery.ts";
import { executeXeroOperation } from "./operations.ts";
import { decryptXeroSecret, encryptXeroSecret, redactXeroSecrets } from "./tokenVault.ts";
import { MockXeroTransport, XeroApiError, xeroRetryDelay } from "./transport.ts";
import { isSupportedXeroWebhookEvent, parseXeroWebhook, verifyXeroWebhook, xeroWebhookEventKey } from "./webhook.ts";
import { assertVerifiedPaymentEvidence, runXeroOutboxWorker, type XeroOutboxItem, type XeroWorkerStore } from "./worker.ts";

const config = getXeroConfiguration({ XERO_CLIENT_ID: "client", XERO_CLIENT_SECRET: "secret", XERO_REDIRECT_URI: "https://book.zingara.co.za/api/admin/xero/oauth/callback", XERO_TOKEN_ENCRYPTION_KEY: "vault" } as NodeJS.ProcessEnv);
const response = (data: unknown, status = 200) => ({ correlationId: "corr", data, retryAfterSeconds: null, status });

test("OAuth start uses exact redirect, state, PKCE and approved scopes", () => {
  const state = createXeroOAuthState(); const url = new URL(buildXeroAuthorizationUrl(config, state.state, state.challenge));
  assert.equal(url.origin, "https://login.xero.com"); assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.deepEqual((url.searchParams.get("scope") ?? "").split(" "), ["openid", "profile", "email", "offline_access", "accounting.settings.read", "accounting.contacts", "accounting.invoices", "accounting.payments"]);
  assert.doesNotMatch(url.searchParams.get("scope") ?? "", /accounting\.transactions/); assert.notEqual(state.state, state.verifier);
});

test("OAuth exchange, rotation and explicit tenant discovery use official contracts", async () => {
  const calls: Array<{ body: string; url: string }> = [];
  const http = async (url: string | URL, init?: RequestInit) => { calls.push({ body: String(init?.body ?? ""), url: String(url) }); return new Response(String(url).endsWith("/connections") ? JSON.stringify([{ id: "connection-1", tenantId: "tenant-1", tenantName: "Demo", tenantType: "ORGANISATION" }]) : JSON.stringify({ access_token: "access", expires_in: 1800, refresh_token: "refresh-rotated", scope: "offline_access accounting.transactions" }), { status: 200, headers: { "content-type": "application/json" } }); };
  const exchanged = await exchangeXeroCode(config, "code", "verifier", http); const refreshed = await refreshXeroTokens(config, "old-refresh", http); const tenants = await listXeroTenants(exchanged.accessToken, http);
  assert.equal(exchanged.refreshToken, "refresh-rotated"); assert.equal(refreshed.refreshToken, "refresh-rotated"); assert.equal(tenants[0].tenantId, "tenant-1"); assert.match(calls[0].body, /code_verifier=verifier/); assert.match(calls[1].body, /grant_type=refresh_token/);
});

test("token vault encrypts and redacts secrets", () => { const encrypted = encryptXeroSecret("refresh-token", "vault-key"); assert.notEqual(encrypted, "refresh-token"); assert.equal(decryptXeroSecret(encrypted, "vault-key"), "refresh-token"); assert.doesNotMatch(redactXeroSecrets("refresh_token=secret-value"), /secret-value/); assert.throws(() => decryptXeroSecret(encrypted, "wrong")); });

test("adapter uses one real contract path for contact, quote, invoice, payment and credit note", async () => {
  const transport = new MockXeroTransport([response({ Contacts: [{ ContactID: "contact" }] }),response({ Quotes: [{ QuoteID: "quote", QuoteNumber: "QU-1", Status: "DRAFT" }] }),response({ Invoices: [{ InvoiceID: "invoice", InvoiceNumber: "INV-1", Status: "DRAFT" }] }),response({ Payments: [{ PaymentID: "payment", Status: "AUTHORISED" }] }),response({ CreditNotes: [{ CreditNoteID: "credit", CreditNoteNumber: "CN-1", Status: "DRAFT" }] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant"); const command = { contactId: "contact", currencyCode: "ZAR" as const, date: "2026-10-11", lineAmountTypes: "Exclusive" as const, lines: [{ description: "Corporate package", quantity: 1, unitAmount: 43473.913, mapping: { accountCode: "200", category: "corporate", taxCode: "OUTPUT2" } }], localReference: "ZQ-1" };
  assert.equal((await adapter.createContact({ contactNumber: "company-1", emailAddress: "accounts@example.com", name: "Company" }, "contact-key")).ContactID, "contact"); assert.equal((await adapter.createQuote(command, "quote-key")).QuoteID, "quote"); assert.equal((await adapter.createInvoice(command, "invoice-key")).InvoiceID, "invoice"); assert.equal((await adapter.allocatePayment({ accountId: "bank", amount: 100, date: "2026-10-11", invoiceId: "invoice", reference: "payfast-1" }, "payment-key")).PaymentID, "payment"); assert.equal((await adapter.createCreditNote(command, "credit-key")).CreditNoteID, "credit");
  assert.deepEqual(transport.calls.map((call) => call.path.split("?")[0]), ["/Contacts","/Quotes","/Invoices","/Payments","/CreditNotes"]); assert.equal(transport.calls[2].idempotencyKey, "invoice-key");
});

test("adapter updates only identified contacts and draft invoices", async () => {
  const transport = new MockXeroTransport([response({ Contacts: [{ ContactID: "contact" }] }), response({ Invoices: [{ InvoiceID: "invoice", Status: "DRAFT" }] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant"); const command = { contactId: "contact", currencyCode: "ZAR" as const, date: "2026-10-11", lineAmountTypes: "NoTax" as const, lines: [{ description: "Service", quantity: 1, unitAmount: 100, mapping: { accountCode: "200", category: "corporate", taxCode: "NONE" } }], localReference: "ZD-1" };
  assert.equal((await adapter.updateContact("contact", { contactNumber: "ZINGARA-COMPANY-1", emailAddress: "accounts@example.com", name: "Company" }, "contact-update")).ContactID, "contact");
  assert.equal((await adapter.updateDraftInvoice("invoice", command, "invoice-update")).InvoiceID, "invoice");
  assert.deepEqual(transport.calls.map((call) => call.path.split("?")[0]), ["/Contacts/contact", "/Invoices/invoice"]);
  await assert.rejects(adapter.updateContact("", { contactNumber: "", emailAddress: "", name: "" }, "bad"));
});

test("adapter fails closed for missing tenant, mapping and payment evidence", async () => { assert.throws(() => new XeroAccountingAdapter(new MockXeroTransport([]), "")); const adapter = new XeroAccountingAdapter(new MockXeroTransport([]), "tenant"); await assert.rejects(adapter.createInvoice({ contactId: "c", currencyCode: "ZAR", date: "2026-10-11", lineAmountTypes: "NoTax", lines: [], localReference: "Z" }, "key"), /approve/); assert.throws(() => assertVerifiedPaymentEvidence({ amountCents: 100, providerPaymentId: "p", evidenceType: "failed_payfast" }), /Verified payment/); });

test("worker blocks paused tenants and retries transient failures without duplicates", async () => {
  const item: XeroOutboxItem = { attemptCount: 0, documentId: "doc", id: "item", idempotencyKey: "stable", operation: "invoice.create", payload: {}, tenantId: "tenant" }; let mode: "paused" | "ready" = "paused"; const failures: Array<{ terminal: boolean }> = []; let completed = 0;
  const store: XeroWorkerStore = { claim: async () => [item], complete: async () => { completed += 1; }, connection: async () => ({ configured: true, connected: true, mappingsApproved: true, syncPaused: mode === "paused" }), fail: async (_item, failure) => { failures.push(failure); } };
  await runXeroOutboxWorker({ execute: async () => ({ providerId: "never" }), store, workerId: "w" }); assert.equal(completed, 0); assert.equal(failures[0].terminal, true);
  mode = "ready"; await runXeroOutboxWorker({ execute: async () => { throw new XeroApiError("rate", 429, 2, true); }, store, workerId: "w" }); assert.equal(failures[1].terminal, false); assert.equal(xeroRetryDelay(new XeroApiError("rate",429,5,true),1),5000);
});

test("webhooks verify raw-body HMAC, deduplicate keys and ignore unsupported payment events", () => { const raw = JSON.stringify({ events: [{ eventCategory: "INVOICE", eventDateUtc: "2026-10-11T10:00:00Z", eventType: "UPDATE", resourceId: "invoice", tenantId: "tenant" }], firstEventSequence: 1, lastEventSequence: 1 }); const signature = createHmac("sha256", "key").update(raw).digest("base64"); assert.equal(verifyXeroWebhook(raw, signature, "key"), true); assert.equal(verifyXeroWebhook(`${raw} `, signature, "key"), false); const event = parseXeroWebhook(raw).events[0]; assert.equal(isSupportedXeroWebhookEvent(event), true); assert.equal(xeroWebhookEventKey(event), xeroWebhookEventKey(event)); assert.equal(isSupportedXeroWebhookEvent({ ...event, eventCategory: "PAYMENT" }), false); });

test("reconciliation preserves separate operational and accounting truth", () => { const local = { allocatedCents: 5000, documentId: "local", providerIds: ["payfast"], status: "AUTHORISED", totalCents: 10000 }; const xero = { allocatedCents: 5000, documentId: "xero", paymentIds: ["payment"], status: "AUTHORISED", totalCents: 10000 }; assert.equal(reconcileAccounting(local,xero),"matched"); assert.equal(reconcileAccounting(local,{...xero,allocatedCents:4000}),"amount_mismatch"); assert.equal(reconcileAccounting(local,null),"missing_xero"); assert.equal(reconcileAccounting(null,xero),"missing_local"); });

test("document preparation uses approved source mapping and stable contact identity", () => {
  const document = { company_id: "company-1", contact_customer_id: null, customer_email: "accounts@example.com", customer_name: "Example Company", document_date: "2026-10-11", id: "doc", kind: "invoice" as const, line_amount_type: "exclusive" as const, lines: [{ description: "Corporate package", quantity: "1", unitPrice: "43473.9130" }], local_reference: "ZD-1", source_booking_id: null, source_corporate_request_id: "request-1", status: "draft", valid_until: "2026-10-18", venue: "johannesburg" as const, version: 2 };
  assert.equal(documentMappingCategory(document), "corporate");
  const payload = buildXeroDocumentSyncPayload(document, { account_code: "200", category: "corporate", tax_code: "OUTPUT2" });
  assert.equal(payload.contact.contactNumber, "ZINGARA-COMPANY-company-1");
  assert.equal(payload.command.lines[0].unitAmount, 43473.913);
  assert.throws(() => documentMappingCategory({ ...document, source_corporate_request_id: null }), /Link this document/);
});

test("Xero discovery exposes only active verified accounts and eligible payment clearing accounts", () => {
  const discovery = normaliseXeroDiscovery({
    accounts: { Accounts: [
      { AccountID: "sales-jhb", Code: "205", Name: "Sales - JHB", Status: "ACTIVE", TaxType: "OUTPUT2", Type: "REVENUE" },
      { AccountID: "clearing", BankAccountNumber: "36090701", Code: "900", EnablePaymentsToAccount: true, Name: "PayFast Clearing Account", Status: "ACTIVE", TaxType: "NONE", Type: "BANK" },
      { AccountID: "eft", BankAccountNumber: "12345678468", Code: "901", EnablePaymentsToAccount: true, Name: "FNB Main", Status: "ACTIVE", TaxType: "NONE", Type: "BANK" },
      { AccountID: "inactive", Code: "999", Name: "Old", Status: "ARCHIVED", Type: "BANK" },
    ] },
    organisation: { Organisations: [{ BaseCurrency: "ZAR", LegalName: "Zingara Productions (Pty) Ltd", Name: "Zingara Productions (Pty) Ltd", OrganisationID: "org", OrganisationStatus: "ACTIVE" }] },
    taxRates: { TaxRates: [
      { CanApplyToRevenue: true, DisplayTaxRate: 15, EffectiveRate: 15, Name: "15% VAT on Income", Status: "ACTIVE", TaxType: "OUTPUT2" },
      { CanApplyToRevenue: true, DisplayTaxRate: 0, EffectiveRate: 0, Name: "No VAT", Status: "ACTIVE", TaxType: "NONE" },
      { CanApplyToRevenue: true, DisplayTaxRate: 0, EffectiveRate: 0, Name: "Zero Rate", Status: "ACTIVE", TaxType: "ZERORATED" },
    ] },
  });
  assert.deepEqual(discovery.accounts.map((account) => account.code), ["205", "900", "901"]);
  assert.deepEqual(discovery.paymentAccounts.map((account) => account.code), ["900", "901"]);
  assert.equal(verifiedXeroMapping({ accountCode: "205", accountId: "sales-jhb", category: "ticket_sales", discovery, taxCode: "OUTPUT2" }).taxRate?.effectiveRate, 15);
  assert.throws(() => verifiedXeroMapping({ accountCode: "205", accountId: "sales-jhb", category: "payfast_clearing_account", discovery }), /payment account/);
  assert.equal(verifiedXeroMapping({ accountCode: "900", accountId: "clearing", category: "payfast_clearing_account", discovery }).taxRate, null);
  assert.equal(verifiedXeroMapping({ accountCode: "901", accountId: "eft", category: "eft_payment_account", discovery }).taxRate, null);
  assert.throws(() => verifiedXeroMapping({ accountCode: "901", accountId: "eft", category: "payfast_clearing_account", discovery }), /36090701/);
  assert.throws(() => verifiedXeroMapping({ accountCode: "900", accountId: "clearing", category: "eft_payment_account", discovery }), /8468/);
  assert.equal(verifiedXeroMapping({ accountCode: "205", accountId: "sales-jhb", category: "gratuity", discovery, taxCode: "NONE" }).taxRate?.effectiveRate, 0);
  assert.throws(() => verifiedXeroMapping({ accountCode: "205", accountId: "sales-jhb", category: "gratuity", discovery, taxCode: "OUTPUT2" }), /No VAT/);
  assert.throws(() => verifiedXeroMapping({ accountCode: "205", accountId: "sales-jhb", category: "gratuity", discovery, taxCode: "ZERORATED" }), /No VAT/);
  assert.throws(() => verifiedXeroMapping({ accountCode: "205", accountId: "sales-jhb", category: "corporate", discovery, taxCode: "NONE" }), /15%/);
});

test("mapping readiness requires approved operational categories and separate payment accounts", () => {
  const categories = ["ticket_sales", "corporate", "buyouts", "booking_fee", "gratuity", "addons"];
  const complete = [
    ...categories.flatMap((category) => [{ category, venue: "johannesburg" }, { category, venue: "cape-town" }]),
    { category: "payfast_clearing_account", venue: "all" },
    { category: "eft_payment_account", venue: "all" },
  ];
  assert.equal(allRequiredXeroMappingsApproved(complete), true);
  assert.equal(allRequiredXeroMappingsApproved(complete.filter((mapping) => xeroMappingKey(mapping.venue as "all" | "johannesburg" | "cape-town", mapping.category as "ticket_sales") !== "cape-town:ticket_sales")), false);
  assert.equal(allRequiredXeroMappingsApproved(complete.filter((mapping) => mapping.category !== "eft_payment_account")), false);
  assert.equal(allRequiredXeroMappingsApproved([...complete, { category: "discounts", venue: "johannesburg" }]), true);
});

test("approved mapping policy keeps venue accounts isolated and unresolved treatments blocked", () => {
  assert.equal(expectedXeroAccountCode("johannesburg", "corporate"), "205");
  assert.equal(expectedXeroAccountCode("cape-town", "corporate"), "205-01");
  assert.equal(expectedXeroAccountCode("johannesburg", "booking_fee"), "206-01");
  assert.equal(expectedXeroAccountCode("cape-town", "gratuity"), "823-02");
  assert.equal(isXeroMappingApprovalSupported("johannesburg", "discounts"), false);
  assert.equal(isXeroMappingApprovalSupported("cape-town", "refunds"), false);
  assert.equal(isXeroMappingApprovalSupported("johannesburg", "deposits"), false);
  assert.equal(isXeroMappingApprovalSupported("all", "payfast_clearing_account"), true);
  assert.equal(isXeroMappingApprovalSupported("all", "eft_payment_account"), true);
});

test("document sync resolves or creates one contact through the same adapter path", async () => {
  const transport = new MockXeroTransport([response({ Contacts: [] }), response({ Contacts: [{ ContactID: "contact" }] }), response({ Invoices: [{ InvoiceID: "invoice", InvoiceNumber: "INV-9", Status: "DRAFT" }] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant");
  const item: XeroOutboxItem = { attemptCount: 0, documentId: "doc", id: "item", idempotencyKey: "stable-doc", operation: "document.sync", payload: { contact: { contactNumber: "ZINGARA-COMPANY-1", emailAddress: "a@example.com", name: "A" }, documentVersion: 1, kind: "invoice", command: { currencyCode: "ZAR", date: "2026-10-11", lineAmountTypes: "NoTax", lines: [{ description: "Service", quantity: 1, unitAmount: 100, mapping: { accountCode: "200", category: "corporate", taxCode: "NONE" } }], localReference: "ZD-9" } }, tenantId: "tenant" };
  const result = await executeXeroOperation(adapter, item); assert.equal(result.providerId, "invoice"); assert.equal(result.providerContactId, "contact");
  assert.equal(transport.calls[1].idempotencyKey, "stable-doc:contact");
  assert.equal(transport.calls[2].idempotencyKey, "stable-doc");
});

test("mock transport preserves idempotency and adapter sends bounded reconciliation headers", async () => {
  const transport = new MockXeroTransport([response({ Invoices: [] }), response({ Invoices: [{ InvoiceID: "same" }] })]);
  const adapter = new XeroAccountingAdapter(transport, "tenant");
  await adapter.listInvoices(2, "2026-10-10T00:00:00Z");
  assert.equal(transport.calls[0].headers?.["If-Modified-Since"], "2026-10-10T00:00:00Z");
  assert.match(transport.calls[0].path, /page=2/);
  const first = await transport.request({ idempotencyKey: "same", method: "PUT", path: "/Invoices", tenantId: "tenant" });
  const duplicate = await transport.request({ idempotencyKey: "same", method: "PUT", path: "/Invoices", tenantId: "tenant" });
  assert.deepEqual(duplicate, first);
  assert.equal(transport.calls.length, 3);
});

test("reconciliation identifies missing and mismatched invoices without changing operational truth", () => {
  const differences = buildInvoiceReconciliation(
    [{ id: "local-a", total_cents: 10000, xero_document_id: "invoice-a", xero_status: "AUTHORISED" }, { id: "local-b", total_cents: 5000, xero_document_id: "invoice-b", xero_status: "DRAFT" }],
    [{ AmountPaid: 0, InvoiceID: "invoice-a", Status: "AUTHORISED", Total: 110 }, { AmountPaid: 0, InvoiceID: "invoice-c", Status: "DRAFT", Total: 50 }],
  );
  assert.deepEqual(new Set(differences.map((row) => row.category)), new Set(["amount_mismatch", "missing_local", "missing_xero"]));
  assert.equal(shouldApplyWebhookEvent(10, 9), false);
  assert.equal(shouldApplyWebhookEvent(10, 11), true);
});

test("transport classifies provider and timeout failures for bounded retry", async () => {
  const { FetchXeroTransport } = await import("./transport.ts");
  const rateLimited = new FetchXeroTransport("access", "https://example.test", async () => new Response(JSON.stringify({}), { status: 429, headers: { "retry-after": "3" } }));
  await assert.rejects(rateLimited.request({ method: "GET", path: "/Invoices", tenantId: "tenant" }), (error: unknown) => error instanceof XeroApiError && error.retryable && error.retryAfterSeconds === 3);
  const forbidden = new FetchXeroTransport("access", "https://example.test", async () => new Response(JSON.stringify({}), { status: 403 }));
  await assert.rejects(forbidden.request({ method: "GET", path: "/Invoices", tenantId: "tenant" }), (error: unknown) => error instanceof XeroApiError && !error.retryable);
});
