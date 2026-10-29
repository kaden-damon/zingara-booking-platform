create unique index if not exists xero_documents_one_direct_invoice_per_booking_idx
  on public.xero_documents(source_booking_id)
  where kind = 'invoice'
    and source_booking_id is not null
    and source_quote_id is null;

comment on index public.xero_documents_one_direct_invoice_per_booking_idx is
  'Prevents duplicate direct invoice drafts and Xero invoices for one authoritative booking.';
