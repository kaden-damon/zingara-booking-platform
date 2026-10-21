import type { XeroTransport } from "./transport.ts";

export type ApprovedXeroMapping = { accountCode: string; category: string; taxCode: string; tracking?: Array<{ Name: string; Option: string }> };
export type XeroLine = { description: string; quantity: number; unitAmount: number; mapping: ApprovedXeroMapping };
export type XeroDocumentCommand = { contactId: string; currencyCode: "ZAR"; date: string; dueDate?: string; lineAmountTypes: "Exclusive" | "Inclusive" | "NoTax"; lines: XeroLine[]; localReference: string };

function requireTenant(tenantId: string) { if (!tenantId) throw new Error("Choose an approved Xero organisation first."); }
function requireMappings(lines: XeroLine[]) {
  if (!lines.length || lines.some((line) => !line.mapping.accountCode || !line.mapping.taxCode)) throw new Error("Accounts must approve every account and VAT mapping before sync.");
}
function lineItems(lines: XeroLine[]) { return lines.map((line) => ({ AccountCode: line.mapping.accountCode, Description: line.description, Quantity: line.quantity, TaxType: line.mapping.taxCode, Tracking: line.mapping.tracking, UnitAmount: line.unitAmount })); }
function first<T>(data: unknown, key: string): T {
  const rows = (data as Record<string, unknown>)?.[key];
  if (!Array.isArray(rows) || !rows[0]) throw new Error(`Xero returned no ${key}.`);
  return rows[0] as T;
}

export class XeroAccountingAdapter {
  private readonly tenantId: string; private readonly transport: XeroTransport;
  constructor(transport: XeroTransport, tenantId: string) { requireTenant(tenantId); this.transport = transport; this.tenantId = tenantId; }
  async discover() {
    const [organisation, accounts, bankAccounts, taxRates] = await Promise.all([
      this.transport.request({ method: "GET", path: "/Organisation", tenantId: this.tenantId }),
      this.transport.request({ method: "GET", path: "/Accounts?where=Status%3D%3D%22ACTIVE%22", tenantId: this.tenantId }),
      this.transport.request({ method: "GET", path: "/Accounts?where=Type%3D%3D%22BANK%22", tenantId: this.tenantId }),
      this.transport.request({ method: "GET", path: "/TaxRates", tenantId: this.tenantId }),
    ]);
    return { accounts: accounts.data, bankAccounts: bankAccounts.data, organisation: organisation.data, taxRates: taxRates.data };
  }
  async findContactByNumber(contactNumber: string) {
    if (!contactNumber) throw new Error("A stable contact number is required.");
    const where = encodeURIComponent(`ContactNumber==\"${contactNumber.replace(/["\\]/g, "")}\"`);
    const response = await this.transport.request<{ Contacts?: unknown[] }>({ method: "GET", path: `/Contacts?where=${where}&page=1&pageSize=2&summaryOnly=true`, tenantId: this.tenantId });
    return response.data.Contacts ?? [];
  }
  async createContact(input: { contactNumber: string; emailAddress: string; name: string }, idempotencyKey: string) {
    if (!input.contactNumber || !input.name) throw new Error("A stable contact identity and name are required.");
    const response = await this.transport.request({ body: { Contacts: [{ ContactNumber: input.contactNumber, EmailAddress: input.emailAddress, Name: input.name }] }, idempotencyKey, method: "PUT", path: "/Contacts", tenantId: this.tenantId });
    return first<{ ContactID: string }>(response.data, "Contacts");
  }
  async updateContact(contactId: string, input: { contactNumber: string; emailAddress: string; name: string }, idempotencyKey: string) {
    if (!contactId || !input.contactNumber || !input.name) throw new Error("A stable Xero contact identity, contact number and name are required.");
    const response = await this.transport.request({ body: { Contacts: [{ ContactID: contactId, ContactNumber: input.contactNumber, EmailAddress: input.emailAddress, Name: input.name }] }, idempotencyKey, method: "POST", path: `/Contacts/${contactId}`, tenantId: this.tenantId });
    return first<{ ContactID: string }>(response.data, "Contacts");
  }
  async createQuote(command: XeroDocumentCommand, idempotencyKey: string) {
    requireMappings(command.lines);
    const response = await this.transport.request({ body: { Quotes: [{ Contact: { ContactID: command.contactId }, CurrencyCode: command.currencyCode, Date: command.date, ExpiryDate: command.dueDate, LineAmountTypes: command.lineAmountTypes, LineItems: lineItems(command.lines), Reference: command.localReference, Status: "DRAFT" }] }, idempotencyKey, method: "PUT", path: "/Quotes?summarizeErrors=false", tenantId: this.tenantId });
    return first<{ QuoteID: string; QuoteNumber?: string; Status?: string }>(response.data, "Quotes");
  }
  async updateQuote(quoteId: string, command: XeroDocumentCommand, idempotencyKey: string) {
    requireMappings(command.lines);
    const response = await this.transport.request({ body: { Quotes: [{ QuoteID: quoteId, Contact: { ContactID: command.contactId }, CurrencyCode: command.currencyCode, Date: command.date, ExpiryDate: command.dueDate, LineAmountTypes: command.lineAmountTypes, LineItems: lineItems(command.lines), Reference: command.localReference, Status: "DRAFT" }] }, idempotencyKey, method: "POST", path: `/Quotes/${quoteId}?summarizeErrors=false`, tenantId: this.tenantId });
    return first<{ QuoteID: string; QuoteNumber?: string; Status?: string }>(response.data, "Quotes");
  }
  async createInvoice(command: XeroDocumentCommand, idempotencyKey: string) {
    requireMappings(command.lines);
    const response = await this.transport.request({ body: { Invoices: [{ Contact: { ContactID: command.contactId }, CurrencyCode: command.currencyCode, Date: command.date, DueDate: command.dueDate, LineAmountTypes: command.lineAmountTypes, LineItems: lineItems(command.lines), Reference: command.localReference, Status: "DRAFT", Type: "ACCREC" }] }, idempotencyKey, method: "PUT", path: "/Invoices?summarizeErrors=false", tenantId: this.tenantId });
    return first<{ InvoiceID: string; InvoiceNumber?: string; Status?: string }>(response.data, "Invoices");
  }
  async updateDraftInvoice(invoiceId: string, command: XeroDocumentCommand, idempotencyKey: string) {
    requireMappings(command.lines);
    if (!invoiceId) throw new Error("A Xero invoice identity is required.");
    const response = await this.transport.request({ body: { Invoices: [{ InvoiceID: invoiceId, Contact: { ContactID: command.contactId }, CurrencyCode: command.currencyCode, Date: command.date, DueDate: command.dueDate, LineAmountTypes: command.lineAmountTypes, LineItems: lineItems(command.lines), Reference: command.localReference, Status: "DRAFT", Type: "ACCREC" }] }, idempotencyKey, method: "POST", path: `/Invoices/${invoiceId}?summarizeErrors=false`, tenantId: this.tenantId });
    return first<{ InvoiceID: string; InvoiceNumber?: string; Status?: string }>(response.data, "Invoices");
  }
  async getInvoice(invoiceId: string) { return this.transport.request({ method: "GET", path: `/Invoices/${invoiceId}`, tenantId: this.tenantId }); }
  async listInvoices(page = 1, modifiedAfter?: string) { return this.transport.request({ headers: modifiedAfter ? { "If-Modified-Since": modifiedAfter } : undefined, method: "GET", path: `/Invoices?page=${Math.max(1, page)}&pageSize=100&summaryOnly=true`, tenantId: this.tenantId }); }
  async listPayments(page = 1, modifiedAfter?: string) { return this.transport.request({ headers: modifiedAfter ? { "If-Modified-Since": modifiedAfter } : undefined, method: "GET", path: `/Payments?page=${Math.max(1, page)}&pageSize=100`, tenantId: this.tenantId }); }
  async listCreditNotes(page = 1, modifiedAfter?: string) { return this.transport.request({ headers: modifiedAfter ? { "If-Modified-Since": modifiedAfter } : undefined, method: "GET", path: `/CreditNotes?page=${Math.max(1, page)}&pageSize=100&summaryOnly=true`, tenantId: this.tenantId }); }
  async allocatePayment(input: { accountId: string; amount: number; date: string; invoiceId: string; reference: string }, idempotencyKey: string) {
    if (!input.accountId || !input.invoiceId || !(input.amount > 0)) throw new Error("Verified payment evidence and an approved payment account are required.");
    const response = await this.transport.request({ body: { Payments: [{ Account: { AccountID: input.accountId }, Amount: input.amount, Date: input.date, Invoice: { InvoiceID: input.invoiceId }, Reference: input.reference }] }, idempotencyKey, method: "PUT", path: "/Payments", tenantId: this.tenantId });
    return first<{ PaymentID: string; Status?: string }>(response.data, "Payments");
  }
  async getPayment(paymentId: string) { return this.transport.request({ method: "GET", path: `/Payments/${paymentId}`, tenantId: this.tenantId }); }
  async createCreditNote(command: XeroDocumentCommand, idempotencyKey: string) {
    requireMappings(command.lines);
    const response = await this.transport.request({ body: { CreditNotes: [{ Contact: { ContactID: command.contactId }, CurrencyCode: command.currencyCode, Date: command.date, LineAmountTypes: command.lineAmountTypes, LineItems: lineItems(command.lines), Reference: command.localReference, Status: "DRAFT", Type: "ACCRECCREDIT" }] }, idempotencyKey, method: "PUT", path: "/CreditNotes?summarizeErrors=false", tenantId: this.tenantId });
    return first<{ CreditNoteID: string; CreditNoteNumber?: string; Status?: string }>(response.data, "CreditNotes");
  }
  async allocateCreditNote(input: { amount: number; creditNoteId: string; invoiceId: string }, idempotencyKey: string) {
    if (!input.creditNoteId || !input.invoiceId || !(input.amount > 0)) throw new Error("An approved credit note, original invoice and allocation amount are required.");
    const response = await this.transport.request({ body: { Amount: input.amount, Invoice: { InvoiceID: input.invoiceId } }, idempotencyKey, method: "PUT", path: `/CreditNotes/${input.creditNoteId}/Allocations`, tenantId: this.tenantId });
    return first<{ AllocationID?: string; Amount?: number }>(response.data, "Allocations");
  }
}
