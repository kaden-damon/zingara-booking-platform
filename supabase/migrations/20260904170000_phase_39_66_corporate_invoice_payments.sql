-- Phase 39.66: prevent atomic booking reservation from persisting a synthetic
-- zero-value payment for Corporate invoice bookings awaiting EFT settlement.

create or replace function public.guard_corporate_invoice_payment_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_metadata jsonb;
begin
  if lower(coalesce(new.method, '')) <> 'invoice' then
    return new;
  end if;

  select * into v_booking
    from public.bookings
   where id = new.booking_id;

  begin
    if v_booking.notes like '__zingara_booking_meta__:%' then
      v_metadata := substring(
        v_booking.notes from length('__zingara_booking_meta__:') + 1
      )::jsonb;
    end if;
  exception
    when others then
      raise exception 'CORPORATE_INVOICE_METADATA_INVALID';
  end;

  if v_booking.id is null
     or v_booking.booking_source <> 'corporate-direct'
     or v_booking.booking_origin <> 'corporate'
     or v_booking.created_by_staff_id is null
     or coalesce(v_metadata ->> 'corporatePaymentBasis', '') <> 'invoice-outstanding'
     or round(coalesce(new.amount, 0), 2) <> 0
     or new.payment_status::text <> 'pending_payment'
     or new.provider_transaction_id is not null
     or new.provider_gross_amount is not null
     or new.transaction_fee_amount is not null then
    raise exception 'CORPORATE_INVOICE_PAYMENT_EVIDENCE_INVALID';
  end if;

  -- Returning null from a BEFORE INSERT trigger deliberately suppresses only
  -- the placeholder row. The booking and its capacity claim remain atomic.
  return null;
end;
$$;

drop trigger if exists payments_guard_corporate_invoice_evidence
  on public.payments;
create trigger payments_guard_corporate_invoice_evidence
  before insert on public.payments
  for each row execute function public.guard_corporate_invoice_payment_evidence();

revoke all on function public.guard_corporate_invoice_payment_evidence()
  from public, anon, authenticated;

comment on function public.guard_corporate_invoice_payment_evidence() is
  'Suppresses the validated zero-value atomic reservation payment stub for a new Corporate invoice awaiting EFT; rejects untrusted invoice-method rows.';
