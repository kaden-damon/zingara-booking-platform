export type InitialInvoiceSyncCandidate = {
  created_at: string;
  kind: string;
  source_quote_id: string | null;
  status: string;
};

export type InitialInvoiceSyncQuote = {
  accepted_version: number | null;
  id: string;
  invoice_requested_at: string | null;
  invoice_requested_version: number | null;
  kind: string;
  status: string;
};

export function assertInitialInvoiceSyncEligibility(input: {
  activationAt: string | null;
  canConvertRequestedQuote: boolean;
  connectionStatus: string;
  invoice: InitialInvoiceSyncCandidate;
  liveSyncAuthorised: boolean;
  quote: InitialInvoiceSyncQuote | null;
  syncPaused: boolean;
  webhookConfigured: boolean;
}) {
  if (!input.liveSyncAuthorised || input.connectionStatus !== "connected" || input.syncPaused) {
    throw new Error("Live Xero invoice creation is paused.");
  }
  if (!input.webhookConfigured) {
    throw new Error("Configure and validate the Xero webhook before creating invoices.");
  }
  if (!input.canConvertRequestedQuote) {
    throw new Error("Only Tristan or Rachelle can create an approved Xero invoice.");
  }
  if (!input.activationAt || !Number.isFinite(Date.parse(input.activationAt))) {
    throw new Error("The controlled Xero activation boundary is missing.");
  }
  if (
    input.invoice.kind !== "invoice" ||
    !["draft", "revised"].includes(input.invoice.status) ||
    !input.invoice.source_quote_id
  ) {
    throw new Error("Only an invoice converted from an accepted quotation can be created in Xero.");
  }
  if (Date.parse(input.invoice.created_at) < Date.parse(input.activationAt)) {
    throw new Error("Pre-activation invoice drafts remain local and cannot be sent to Xero.");
  }
  const quote = input.quote;
  if (
    !quote ||
    quote.id !== input.invoice.source_quote_id ||
    quote.kind !== "quote" ||
    quote.status !== "converted" ||
    !quote.invoice_requested_at ||
    quote.accepted_version === null ||
    quote.invoice_requested_version !== quote.accepted_version
  ) {
    throw new Error("The accepted quotation and Invoice Request evidence could not be verified.");
  }
}
