-- Phase 41.2O-P0-A: settle a snapshot-matched payment link in the same
-- transaction as its successful PayFast payment allocation.
create or replace function public.confirm_payfast_payment_core(
  p_booking_reference text,
  p_provider_transaction_id text,
  p_amount numeric,
  p_payment_status public.payment_status,
  p_payment_type public.payment_type,
  p_payment_notes text,
  p_booking_notes text,
  p_amount_paid numeric,
  p_balance_outstanding numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(10,2);
  v_booking public.bookings%rowtype;
  v_booking_was_confirmed boolean := false;
  v_cumulative_paid numeric(10,2);
  v_existing_provider_payment public.payments%rowtype;
  v_now timestamptz := clock_timestamp();
  v_payment public.payments%rowtype;
  v_payment_link_id uuid;
  v_payment_status public.payment_status;
  v_payment_type public.payment_type;
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

  v_booking_was_confirmed := v_booking.booking_status = 'confirmed';

  if nullif(trim(p_provider_transaction_id), '') is not null then
    select *
      into v_existing_provider_payment
      from public.payments
     where provider_transaction_id = p_provider_transaction_id
     limit 1;

    if v_existing_provider_payment.id is not null then
      if v_existing_provider_payment.booking_id <> v_booking.id then
        return jsonb_build_object(
          'status', 'duplicate_provider_transaction',
          'booking_id', v_booking.id,
          'payment_id', v_existing_provider_payment.id
        );
      end if;

      return jsonb_build_object(
        'status', 'already_confirmed',
        'booking_id', v_booking.id,
        'payment_id', v_existing_provider_payment.id,
        'was_confirmed', true,
        'booking_was_confirmed', v_booking_was_confirmed
      );
    end if;
  end if;

  select link.id
    into v_payment_link_id
    from public.booking_payment_links as link
   where link.booking_id = v_booking.id
     and link.booking_reference = v_booking.booking_reference
     and link.status = 'active'
     and round(
       case
         when coalesce(link.metadata ->> 'checkoutAmount', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
           then (link.metadata ->> 'checkoutAmount')::numeric
         else -1
       end,
       2
     )
         = round(p_amount, 2)
     and round(
       case
         when coalesce(link.metadata ->> 'amountPaidSnapshot', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
           then (link.metadata ->> 'amountPaidSnapshot')::numeric
         else -1
       end,
       2
     )
         = round(coalesce(v_booking.amount_paid, 0), 2)
     and round(
       case
         when coalesce(link.metadata ->> 'totalAmountSnapshot', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
           then (link.metadata ->> 'totalAmountSnapshot')::numeric
         else -1
       end,
       2
     )
         = round(coalesce(v_booking.total_amount, 0), 2)
   order by link.created_at desc
   limit 1
   for update;

  v_cumulative_paid := least(
    greatest(round(coalesce(v_booking.amount_paid, 0) + p_amount, 2), 0),
    greatest(round(coalesce(v_booking.total_amount, 0), 2), 0)
  );
  v_balance := greatest(
    round(coalesce(v_booking.total_amount, 0) - v_cumulative_paid, 2),
    0
  );
  v_payment_status := case
    when v_balance <= 0.01 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status
  end;
  v_payment_type := case
    when coalesce(v_booking.amount_paid, 0) > 0 then 'balance'::public.payment_type
    when v_payment_status = 'deposit_paid' then 'deposit'::public.payment_type
    else 'full_payment'::public.payment_type
  end;

  select *
    into v_payment
    from public.payments
   where booking_id = v_booking.id
     and reference = p_booking_reference
     and payment_status = 'pending_payment'
     and provider_transaction_id is null
   order by created_at desc
   limit 1
   for update;

  update public.bookings
     set amount_paid = v_cumulative_paid,
         balance_outstanding = v_balance,
         booking_status = 'confirmed',
         notes = p_booking_notes,
         payment_status = v_payment_status,
         updated_at = v_now
   where id = v_booking.id
   returning * into v_booking;

  if v_payment.id is null then
    insert into public.payments (
      amount,
      booking_id,
      method,
      notes,
      payment_status,
      payment_type,
      processed_at,
      provider_transaction_id,
      reference
    )
    values (
      round(p_amount, 2),
      v_booking.id,
      'payfast',
      p_payment_notes,
      v_payment_status,
      v_payment_type,
      v_now,
      nullif(trim(p_provider_transaction_id), ''),
      p_booking_reference
    )
    returning * into v_payment;
  else
    update public.payments
       set amount = round(p_amount, 2),
           method = 'payfast',
           notes = p_payment_notes,
           payment_status = v_payment_status,
           payment_type = v_payment_type,
           processed_at = v_now,
           provider_transaction_id = nullif(trim(p_provider_transaction_id), ''),
           reference = p_booking_reference
     where id = v_payment.id
     returning * into v_payment;
  end if;

  if v_payment_link_id is not null then
    update public.booking_payment_links
       set status = 'used',
           used_at = coalesce(used_at, v_now),
           updated_at = v_now
     where id = v_payment_link_id
       and status = 'active';
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'booking_id', v_booking.id,
    'payment_id', v_payment.id,
    'payment_link_id', v_payment_link_id,
    'was_confirmed', false,
    'booking_was_confirmed', v_booking_was_confirmed,
    'amount_paid', v_cumulative_paid,
    'balance_outstanding', v_balance
  );
end;
$$;

revoke all on function public.confirm_payfast_payment_core(
  text, text, numeric, public.payment_status, public.payment_type, text, text,
  numeric, numeric
) from public, anon, authenticated;

grant execute on function public.confirm_payfast_payment_core(
  text, text, numeric, public.payment_status, public.payment_type, text, text,
  numeric, numeric
) to service_role;
