-- Phase 39.10A: preserve booking-applied payment amounts while recording the
-- customer-facing transaction fee and gross PayFast charge separately.

alter table public.payments
  add column if not exists transaction_fee_amount numeric(10,2),
  add column if not exists provider_gross_amount numeric(10,2);

alter table public.payments
  add constraint payments_transaction_fee_amount_nonnegative
    check (transaction_fee_amount is null or transaction_fee_amount >= 0),
  add constraint payments_provider_gross_amount_nonnegative
    check (provider_gross_amount is null or provider_gross_amount >= 0),
  add constraint payments_provider_amount_consistent
    check (
      provider_gross_amount is null
      or transaction_fee_amount is null
      or provider_gross_amount = round(amount + transaction_fee_amount, 2)
    );

create or replace function public.prepare_payfast_checkout_attempt(
  p_booking_reference text,
  p_amount numeric,
  p_transaction_fee numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_outstanding numeric(10,2);
  v_payment public.payments%rowtype;
  v_payment_type public.payment_type;
  v_now timestamptz := now();
  v_applied numeric(10,2);
  v_fee numeric(10,2);
  v_gross numeric(10,2);
begin
  if nullif(trim(p_booking_reference), '') is null then
    raise exception 'booking_reference is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'positive amount is required';
  end if;

  if p_transaction_fee is null or round(p_transaction_fee, 2) <> 10.00 then
    raise exception 'PayFast transaction fee must be 10.00';
  end if;

  v_applied := round(p_amount, 2);
  v_fee := round(p_transaction_fee, 2);
  v_gross := round(v_applied + v_fee, 2);

  perform pg_advisory_xact_lock(hashtext(p_booking_reference));

  select * into v_booking
    from public.bookings
   where booking_reference = p_booking_reference
   for update;

  if v_booking.id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status in ('cancelled', 'completed', 'refunded')
     or v_booking.payment_status in ('fully_paid', 'comp_vip', 'cancelled', 'refunded') then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'booking-not-payable',
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status
    );
  end if;

  v_outstanding := greatest(
    round(coalesce(v_booking.total_amount, 0) - coalesce(v_booking.amount_paid, 0), 2),
    0
  );

  if v_outstanding <= 0 then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'booking-not-payable',
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status
    );
  end if;

  if v_applied > v_outstanding + 0.01 then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'amount-exceeds-outstanding',
      'amount_due', v_outstanding
    );
  end if;

  v_payment_type := case
    when coalesce(v_booking.amount_paid, 0) > 0 then 'balance'::public.payment_type
    when v_applied < v_outstanding then 'deposit'::public.payment_type
    else 'full_payment'::public.payment_type
  end;

  select * into v_payment
    from public.payments
   where booking_id = v_booking.id
     and reference = p_booking_reference
     and payment_status = 'pending_payment'
     and provider_transaction_id is null
   order by created_at desc
   limit 1
   for update;

  if v_payment.id is null then
    insert into public.payments (
      amount,
      booking_id,
      method,
      notes,
      payment_status,
      payment_type,
      processed_at,
      provider_gross_amount,
      reference,
      transaction_fee_amount
    ) values (
      v_applied,
      v_booking.id,
      'platform',
      format('PayFast checkout initiated at %s', v_now),
      'pending_payment',
      v_payment_type,
      v_now,
      v_gross,
      p_booking_reference,
      v_fee
    ) returning * into v_payment;
  else
    update public.payments
       set amount = v_applied,
           notes = case
             when coalesce(v_payment.notes, '') like '%PayFast checkout initiated%'
               then v_payment.notes
             when nullif(v_payment.notes, '') is null
               then format('PayFast checkout initiated at %s', v_now)
             else v_payment.notes || E'\n' || format('PayFast checkout initiated at %s', v_now)
           end,
           payment_type = v_payment_type,
           processed_at = v_now,
           provider_gross_amount = v_gross,
           transaction_fee_amount = v_fee
     where id = v_payment.id
     returning * into v_payment;
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'booking_id', v_booking.id,
    'payment_id', v_payment.id,
    'booking_status', v_booking.booking_status,
    'payment_status', v_booking.payment_status,
    'amount_due', v_applied,
    'booking_applied_amount', v_applied,
    'transaction_fee_amount', v_fee,
    'provider_gross_amount', v_gross,
    'outstanding_amount', v_outstanding
  );
end;
$$;

revoke all on function public.prepare_payfast_checkout_attempt(text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.prepare_payfast_checkout_attempt(text, numeric, numeric)
  to service_role;
