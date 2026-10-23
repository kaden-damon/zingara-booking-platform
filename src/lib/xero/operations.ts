import { XeroAccountingAdapter, type XeroDocumentCommand } from "./accountingAdapter.ts";
import { assertVerifiedPaymentEvidence, assertVerifiedRefundEvidence, type XeroOutboxItem } from "./worker.ts";

function command(payload: Record<string, unknown>) { return payload.command as XeroDocumentCommand; }
function originalInvoice(data: unknown, invoiceId: string) {
  const invoices = (data as { Invoices?: Array<{ Contact?: { ContactID?: string }; InvoiceID?: string; LineItems?: Array<{ AccountCode?: string; TaxType?: string }>; Status?: string }> })?.Invoices;
  const invoice = invoices?.find((candidate) => candidate.InvoiceID === invoiceId);
  if (!invoice || invoice.Status === "DELETED" || invoice.Status === "VOIDED") throw new Error("The original Xero invoice is unavailable. Leave this refund pending manual reconciliation.");
  return invoice;
}
function assertCreditNoteMatchesInvoice(credit: XeroDocumentCommand, invoice: ReturnType<typeof originalInvoice>) {
  if (!invoice.Contact?.ContactID || invoice.Contact.ContactID !== credit.contactId) throw new Error("The refund contact does not match the original Xero invoice.");
  const treatments = new Set((invoice.LineItems ?? []).map((line) => `${line.AccountCode ?? ""}:${line.TaxType ?? ""}`));
  if (!credit.lines.length || credit.lines.some((line) => !treatments.has(`${line.mapping.accountCode}:${line.mapping.taxCode}`))) {
    throw new Error("The credit note must preserve the original invoice account and tax treatment.");
  }
}
export async function executeXeroOperation(adapter: XeroAccountingAdapter, item: XeroOutboxItem) {
  if (item.operation === "document.sync") {
    const payload = item.payload as { command: Omit<XeroDocumentCommand, "contactId">; contact: { contactNumber: string; emailAddress: string; name: string }; existingContactId?: string; kind: "invoice" | "quote" };
    const matches = payload.existingContactId ? [] : await adapter.findContactByNumber(payload.contact.contactNumber);
    if (matches.length > 1) throw new Error("This Xero contact needs Accounts review before sync.");
    const contactId = payload.existingContactId || (matches.length === 1
      ? String((matches[0] as { ContactID?: string }).ContactID ?? "")
      : (await adapter.createContact(payload.contact, `${item.idempotencyKey}:contact`)).ContactID);
    if (!contactId) throw new Error("Xero did not return a contact identity.");
    const documentCommand = { ...payload.command, contactId };
    if (payload.kind === "quote") {
      const quote = await adapter.createQuote(documentCommand, item.idempotencyKey);
      return { providerContactId: contactId, providerId: quote.QuoteID, providerNumber: quote.QuoteNumber, providerStatus: quote.Status };
    }
    const existingInvoices = await adapter.findInvoicesByReference(documentCommand.localReference);
    if (existingInvoices.length > 1) throw new Error("Multiple Xero invoices share this Zingara reference. Accounts review is required.");
    if (existingInvoices.length === 1) {
      const existing = existingInvoices[0] as { InvoiceID?: string; InvoiceNumber?: string; Status?: string };
      if (!existing.InvoiceID) throw new Error("The matching Xero invoice has no provider identity.");
      return { providerContactId: contactId, providerId: existing.InvoiceID, providerNumber: existing.InvoiceNumber, providerStatus: existing.Status };
    }
    const invoice = await adapter.createInvoice(documentCommand, item.idempotencyKey);
    return { providerContactId: contactId, providerId: invoice.InvoiceID, providerNumber: invoice.InvoiceNumber, providerStatus: invoice.Status };
  }
  if (item.operation === "contact.create") {
    const contact = await adapter.createContact(item.payload.contact as { contactNumber: string; emailAddress: string; name: string }, item.idempotencyKey);
    return { providerId: contact.ContactID, providerStatus: "ACTIVE" };
  }
  if (item.operation === "quote.create") {
    const quote = await adapter.createQuote(command(item.payload), item.idempotencyKey);
    return { providerId: quote.QuoteID, providerNumber: quote.QuoteNumber, providerStatus: quote.Status };
  }
  if (item.operation === "quote.update") {
    const quote = await adapter.updateQuote(String(item.payload.quoteId), command(item.payload), item.idempotencyKey);
    return { providerId: quote.QuoteID, providerNumber: quote.QuoteNumber, providerStatus: quote.Status };
  }
  if (item.operation === "invoice.create") {
    const invoice = await adapter.createInvoice(command(item.payload), item.idempotencyKey);
    return { providerId: invoice.InvoiceID, providerNumber: invoice.InvoiceNumber, providerStatus: invoice.Status };
  }
  if (item.operation === "payment.allocate") {
    assertVerifiedPaymentEvidence(item.payload);
    const payment = await adapter.allocatePayment(item.payload.payment as { accountId: string; amount: number; date: string; invoiceId: string; reference: string }, item.idempotencyKey);
    return { providerId: payment.PaymentID, providerStatus: payment.Status };
  }
  if (item.operation === "credit_note.create") {
    assertVerifiedRefundEvidence(item.payload);
    const creditCommand = command(item.payload);
    const invoiceId = String(item.payload.originalInvoiceId);
    const invoiceResponse = await adapter.getInvoice(invoiceId);
    assertCreditNoteMatchesInvoice(creditCommand, originalInvoice(invoiceResponse.data, invoiceId));
    const credit = await adapter.createCreditNote(creditCommand, item.idempotencyKey);
    return { providerId: credit.CreditNoteID, providerNumber: credit.CreditNoteNumber, providerStatus: credit.Status };
  }
  if (item.operation === "credit_note.allocate") {
    assertVerifiedRefundEvidence(item.payload);
    const allocation = await adapter.allocateCreditNote({ amount: Number(item.payload.amountCents) / 100, creditNoteId: String(item.payload.creditNoteId ?? ""), invoiceId: String(item.payload.originalInvoiceId) }, item.idempotencyKey);
    return { providerId: String(allocation.AllocationID ?? item.payload.creditNoteId), providerStatus: "ALLOCATED" };
  }
  throw new Error("This Xero operation is not supported.");
}
