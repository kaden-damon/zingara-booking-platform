-- Phase 65: bind each PayFast callback to its checkout attempt and retire
-- payment links that can no longer collect an authoritative balance.

create index if not exists payments_pending_checkout_attempt_idx
  on public.payments (booking_id, amount, created_at desc)
  where payment_status = 'pending_payment' and provider_transaction_id is null;

create or replace function public.prepare_payfast_checkout_attempt_v2(
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
  v_now timestamptz := clock_timestamp();
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

  insert into public.payments (
    amount, booking_id, method, notes, payment_status, payment_type,
    processed_at, provider_gross_amount, reference, transaction_fee_amount
  ) values (
    v_applied, v_booking.id, 'platform',
    format('PayFast checkout initiated at %s', v_now),
    'pending_payment', v_payment_type, v_now, v_gross,
    p_booking_reference, v_fee
  ) returning * into v_payment;

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

revoke all on function public.prepare_payfast_checkout_attempt_v2(text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.prepare_payfast_checkout_attempt_v2(text, numeric, numeric)
  to service_role;

create or replace function public.confirm_payfast_payment_core_v2(
  p_booking_reference text,
  p_provider_transaction_id text,
  p_amount numeric,
  p_payment_status public.payment_status,
  p_payment_type public.payment_type,
  p_payment_notes text,
  p_booking_notes text,
  p_amount_paid numeric,
  p_balance_outstanding numeric,
  p_checkout_payment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_candidate_id uuid;
  v_held_ids uuid[] := '{}';
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(trim(p_booking_reference), '') is null then
    raise exception 'booking_reference is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'positive amount is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_reference));
  select id into v_booking_id
  from public.bookings
  where booking_reference = p_booking_reference
  for update;

  if v_booking_id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  if nullif(trim(p_provider_transaction_id), '') is not null
     and exists (
       select 1 from public.payments
       where provider_transaction_id = trim(p_provider_transaction_id)
     ) then
    v_result := public.confirm_payfast_payment_core(
      p_booking_reference,
      p_provider_transaction_id,
      p_amount,
      p_payment_status,
      p_payment_type,
      p_payment_notes,
      p_booking_notes,
      p_amount_paid,
      p_balance_outstanding
    );

    return v_result || jsonb_build_object(
      'checkout_payment_id', v_result ->> 'payment_id'
    );
  end if;

  if p_checkout_payment_id is not null then
    select id into v_candidate_id
    from public.payments
    where id = p_checkout_payment_id
      and booking_id = v_booking_id
      and reference = p_booking_reference
      and payment_status = 'pending_payment'
      and provider_transaction_id is null
      and round(amount, 2) = round(p_amount, 2)
    for update;

    if v_candidate_id is null then
      raise exception 'PayFast checkout attempt does not match the payment confirmation';
    end if;
  else
    select id into v_candidate_id
    from public.payments
    where booking_id = v_booking_id
      and reference = p_booking_reference
      and payment_status = 'pending_payment'
      and provider_transaction_id is null
      and round(amount, 2) = round(p_amount, 2)
    order by created_at desc
    limit 1
    for update;
  end if;

  select coalesce(array_agg(id), '{}') into v_held_ids
  from public.payments
  where booking_id = v_booking_id
    and reference = p_booking_reference
    and payment_status = 'pending_payment'
    and provider_transaction_id is null
    and id is distinct from v_candidate_id;

  if cardinality(v_held_ids) > 0 then
    update public.payments
    set reference = p_booking_reference || ':pending:' || id::text
    where id = any(v_held_ids);
  end if;

  v_result := public.confirm_payfast_payment_core(
    p_booking_reference,
    p_provider_transaction_id,
    p_amount,
    p_payment_status,
    p_payment_type,
    p_payment_notes,
    p_booking_notes,
    p_amount_paid,
    p_balance_outstanding
  );

  if cardinality(v_held_ids) > 0 then
    update public.payments
    set reference = p_booking_reference
    where id = any(v_held_ids);
  end if;

  if coalesce(v_result ->> 'status', '') in ('processed', 'already_confirmed') then
    update public.booking_payment_links link
    set status = 'revoked',
        updated_at = v_now,
        metadata = coalesce(link.metadata, '{}'::jsonb) || jsonb_build_object(
          'phase65RevokedReason', 'booking-settled'
        )
    from public.bookings booking
    where link.booking_id = booking.id
      and booking.id = v_booking_id
      and link.status = 'active'
      and (
        booking.payment_status = 'fully_paid'
        or (
          coalesce(booking.total_amount, 0) > 0
          and coalesce(booking.amount_paid, 0) >= coalesce(booking.total_amount, 0)
        )
      );
  end if;

  return v_result || jsonb_build_object('checkout_payment_id', v_candidate_id);
end;
$$;

revoke all on function public.confirm_payfast_payment_core_v2(
  text, text, numeric, public.payment_status, public.payment_type, text, text,
  numeric, numeric, uuid
) from public, anon, authenticated;
grant execute on function public.confirm_payfast_payment_core_v2(
  text, text, numeric, public.payment_status, public.payment_type, text, text,
  numeric, numeric, uuid
) to service_role;

-- A settled booking cannot legitimately collect another payment. Preserve the
-- links and their evidence while making currently active links inert.
update public.booking_payment_links link
set status = 'revoked',
    updated_at = clock_timestamp(),
    metadata = coalesce(link.metadata, '{}'::jsonb) || jsonb_build_object(
      'phase65RevokedReason', 'booking-already-settled'
    )
from public.bookings booking
where link.booking_id = booking.id
  and link.status = 'active'
  and (
    booking.payment_status = 'fully_paid'
    or (
      coalesce(booking.total_amount, 0) > 0
      and coalesce(booking.amount_paid, 0) >= coalesce(booking.total_amount, 0)
    )
  );
