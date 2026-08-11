create or replace function public.prepare_payfast_checkout_attempt(
  p_booking_reference text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_now timestamptz := now();
begin
  if nullif(trim(p_booking_reference), '') is null then
    raise exception 'booking_reference is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'positive amount is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_reference));

  select *
    into v_booking
    from public.bookings
   where booking_reference = p_booking_reference
   for update;

  if v_booking.id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  if v_booking.booking_status = 'cancelled' or v_booking.payment_status in ('deposit_paid', 'fully_paid', 'comp_vip', 'refunded') then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'booking-not-payable',
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status
    );
  end if;

  select *
    into v_payment
    from public.payments
   where booking_id = v_booking.id
     and reference = p_booking_reference
   order by created_at asc
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
      reference
    )
    values (
      0,
      v_booking.id,
      'platform',
      format('PayFast checkout initiated at %s', v_now),
      'pending_payment',
      'deposit',
      v_now,
      p_booking_reference
    )
    returning * into v_payment;
  elsif v_payment.payment_status <> 'pending_payment' then
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'payment-not-pending',
      'payment_status', v_payment.payment_status
    );
  else
    update public.payments
       set notes = case
             when coalesce(v_payment.notes, '') like '%PayFast checkout initiated%'
               then v_payment.notes
             when nullif(v_payment.notes, '') is null
               then format('PayFast checkout initiated at %s', v_now)
             else v_payment.notes || E'\n' || format('PayFast checkout initiated at %s', v_now)
           end,
           processed_at = coalesce(v_payment.processed_at, v_now)
     where id = v_payment.id
     returning * into v_payment;
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'booking_id', v_booking.id,
    'payment_id', v_payment.id,
    'booking_status', v_booking.booking_status,
    'payment_status', v_booking.payment_status,
    'amount_due', greatest(v_booking.balance_outstanding, 0)
  );
end;
$$;

grant execute on function public.prepare_payfast_checkout_attempt(text, numeric) to service_role;
