alter table public.payments
  add column if not exists provider_transaction_id text;

update public.payments
   set provider_transaction_id = nullif(substring(notes from 'PayFast transaction: ([^\n]+)'), '')
 where provider_transaction_id is null
   and method = 'payfast'
   and notes like '%PayFast transaction:%';

create unique index if not exists payments_payfast_provider_transaction_uidx
  on public.payments (provider_transaction_id)
  where method = 'payfast'
    and provider_transaction_id is not null;

create unique index if not exists communications_email_sending_claim_uidx
  on public.communications (booking_id, customer_id, type, channel)
  where status = 'sending'
    and channel = 'email'
    and type in ('reservation_confirmed', 'payment_confirmation');

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
  v_booking public.bookings%rowtype;
  v_existing_provider_payment public.payments%rowtype;
  v_payment public.payments%rowtype;
  v_was_confirmed boolean := false;
begin
  if nullif(trim(p_booking_reference), '') is null then
    raise exception 'booking_reference is required';
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

  v_was_confirmed :=
    v_booking.booking_status = 'confirmed'
    and v_booking.payment_status <> 'pending_payment';

  if nullif(trim(p_provider_transaction_id), '') is not null then
    select *
      into v_existing_provider_payment
      from public.payments
     where provider_transaction_id = p_provider_transaction_id
     limit 1;

    if v_existing_provider_payment.id is not null
       and v_existing_provider_payment.booking_id <> v_booking.id then
      return jsonb_build_object(
        'status', 'duplicate_provider_transaction',
        'booking_id', v_booking.id,
        'payment_id', v_existing_provider_payment.id
      );
    end if;
  end if;

  select *
    into v_payment
    from public.payments
   where booking_id = v_booking.id
   order by created_at asc
   limit 1
   for update;

  if not v_was_confirmed then
    update public.bookings
       set amount_paid = p_amount_paid,
           balance_outstanding = p_balance_outstanding,
           booking_status = 'confirmed',
           notes = p_booking_notes,
           payment_status = p_payment_status,
           updated_at = now()
     where id = v_booking.id
     returning * into v_booking;
  end if;

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
      p_amount,
      v_booking.id,
      'payfast',
      p_payment_notes,
      p_payment_status,
      p_payment_type,
      now(),
      nullif(trim(p_provider_transaction_id), ''),
      p_booking_reference
    )
    returning * into v_payment;
  elsif v_payment.payment_status = 'pending_payment'
        or v_payment.provider_transaction_id is null then
    update public.payments
       set amount = p_amount,
           method = 'payfast',
           notes = p_payment_notes,
           payment_status = p_payment_status,
           payment_type = p_payment_type,
           processed_at = now(),
           provider_transaction_id = coalesce(
             nullif(trim(p_provider_transaction_id), ''),
             provider_transaction_id
           ),
           reference = p_booking_reference
     where id = v_payment.id
     returning * into v_payment;
  end if;

  return jsonb_build_object(
    'status', case when v_was_confirmed then 'already_confirmed' else 'processed' end,
    'booking_id', v_booking.id,
    'payment_id', v_payment.id,
    'was_confirmed', v_was_confirmed
  );
end;
$$;

grant execute on function public.confirm_payfast_payment_core(text, text, numeric, public.payment_status, public.payment_type, text, text, numeric, numeric) to service_role;

create or replace function public.ensure_booking_lifecycle_event_once(
  p_booking_id uuid,
  p_from_status public.booking_status,
  p_to_status public.booking_status,
  p_note text,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if p_booking_id is null then
    raise exception 'booking_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_id::text || ':' || coalesce(p_note, '') || ':' || p_to_status::text));

  select id
    into v_event_id
    from public.booking_lifecycle_events
   where booking_id = p_booking_id
     and to_status = p_to_status
     and coalesce(note, '') = coalesce(p_note, '')
   limit 1;

  if v_event_id is not null then
    return v_event_id;
  end if;

  insert into public.booking_lifecycle_events (
    booking_id,
    created_at,
    from_status,
    note,
    to_status
  )
  values (
    p_booking_id,
    coalesce(p_created_at, now()),
    p_from_status,
    p_note,
    p_to_status
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.ensure_booking_lifecycle_event_once(uuid, public.booking_status, public.booking_status, text, timestamptz) to service_role;

create or replace function public.claim_email_communication_once(
  p_booking_id uuid,
  p_customer_id uuid,
  p_show_id uuid,
  p_type public.communication_type,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.communications%rowtype;
  v_claim public.communications%rowtype;
begin
  if p_booking_id is null or p_customer_id is null then
    raise exception 'booking_id and customer_id are required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_id::text || ':' || p_customer_id::text || ':' || p_type::text || ':email'));

  select *
    into v_existing
    from public.communications
   where booking_id = p_booking_id
     and customer_id = p_customer_id
     and type = p_type
     and channel = 'email'
     and status in ('sending', 'sent')
   order by case status when 'sent' then 0 else 1 end, created_at asc
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'status', v_existing.status,
      'communication_id', v_existing.id
    );
  end if;

  insert into public.communications (
    booking_id,
    channel,
    customer_id,
    message,
    sent_at,
    show_id,
    status,
    subject,
    type
  )
  values (
    p_booking_id,
    'email',
    p_customer_id,
    p_message,
    null,
    p_show_id,
    'sending',
    p_subject,
    p_type
  )
  returning * into v_claim;

  return jsonb_build_object(
    'status', 'claimed',
    'communication_id', v_claim.id
  );
end;
$$;

grant execute on function public.claim_email_communication_once(uuid, uuid, uuid, public.communication_type, text, text) to service_role;
