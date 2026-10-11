import { XeroAccountingAdapter, type XeroDocumentCommand } from "./accountingAdapter.ts";
import { assertVerifiedPaymentEvidence, type XeroOutboxItem } from "./worker.ts";

function command(payload: Record<string, unknown>) { return payload.command as XeroDocumentCommand; }
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
    const credit = await adapter.createCreditNote(command(item.payload), item.idempotencyKey);
    return { providerId: credit.CreditNoteID, providerNumber: credit.CreditNoteNumber, providerStatus: credit.Status };
  }
  throw new Error("This Xero operation is not supported.");
}
