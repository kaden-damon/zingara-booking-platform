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

export type DirectBookingInvoiceSyncBooking = {
  amount_paid: number;
  archived_at: string | null;
  balance_outstanding: number;
  booking_status: string;
  id: string;
  payment_status: string;
  total_amount: number;
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

export function assertDirectBookingInvoiceSyncEligibility(input: {
  activationAt: string | null;
  allowOutstanding?: boolean;
  booking: DirectBookingInvoiceSyncBooking | null;
  canConvertRequestedQuote: boolean;
  connectionStatus: string;
  invoice: InitialInvoiceSyncCandidate & {
    source_booking_id: string | null;
    total_cents: number;
  };
  liveSyncAuthorised: boolean;
  syncPaused: boolean;
  verifiedPaymentTotal: number;
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
    !input.invoice.source_booking_id ||
    input.invoice.source_quote_id
  ) {
    throw new Error("Only a direct invoice linked to one verified booking can use this workflow.");
  }
  if (Date.parse(input.invoice.created_at) < Date.parse(input.activationAt)) {
    throw new Error("Pre-activation invoice drafts remain local and cannot be sent to Xero.");
  }
  const booking = input.booking;
  const activeBooking = ["new", "pending_payment", "confirmed", "checked_in", "completed"].includes(
    booking?.booking_status ?? "",
  );
  if (
    !booking ||
    booking.id !== input.invoice.source_booking_id ||
    booking.archived_at ||
    !activeBooking ||
    (!input.allowOutstanding && (
      booking.booking_status !== "confirmed" ||
      booking.payment_status !== "fully_paid"
    ))
  ) {
    throw new Error(input.allowOutstanding
      ? "The linked booking is not eligible for bulk invoicing."
      : "The linked booking is not an active, fully paid booking.");
  }
  const bookingTotalCents = Math.round(Number(booking.total_amount) * 100);
  const amountPaidCents = Math.round(Number(booking.amount_paid) * 100);
  const outstandingCents = Math.round(Number(booking.balance_outstanding) * 100);
  const verifiedPaymentCents = Math.round(input.verifiedPaymentTotal * 100);
  if (
    bookingTotalCents <= 0 ||
    input.invoice.total_cents !== bookingTotalCents ||
    amountPaidCents + outstandingCents !== bookingTotalCents ||
    verifiedPaymentCents !== amountPaidCents ||
    (!input.allowOutstanding && (
      amountPaidCents !== bookingTotalCents ||
      outstandingCents !== 0
    ))
  ) {
    throw new Error("The invoice, booking and verified payments do not reconcile exactly.");
  }
}
