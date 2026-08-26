create or replace function public.reserve_public_booking_entitlement(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_existing_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_promo public.promo_codes%rowtype;
  v_promo_code_id uuid;
  v_promo_redemption_count integer := 0;
begin
  if p_show_id is null then
    raise exception 'show_id is required';
  end if;

  if nullif(trim(p_booking_payload ->> 'booking_reference'), '') is null then
    raise exception 'booking_reference is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_payload ->> 'booking_reference'));

  select *
    into v_existing_booking
    from public.bookings
   where booking_reference = p_booking_payload ->> 'booking_reference'
   limit 1;

  if v_existing_booking.id is not null then
    select id
      into v_payment_id
      from public.payments
     where booking_id = v_existing_booking.id
     limit 1;

    return jsonb_build_object(
      'status', 'already_exists',
      'booking_id', v_existing_booking.id,
      'payment_id', v_payment_id,
      'table_id', v_existing_booking.table_id
    );
  end if;

  v_promo_code_id := nullif(p_booking_payload ->> 'promo_code_id', '')::uuid;

  if v_promo_code_id is not null then
    select *
      into v_promo
      from public.promo_codes
     where id = v_promo_code_id
     for update;

    if v_promo.id is null or not v_promo.active then
      raise exception 'promo code is no longer active';
    end if;

    if v_promo.valid_from is not null and v_promo.valid_from > now() then
      raise exception 'promo code is not active yet';
    end if;

    if v_promo.valid_until is not null and v_promo.valid_until < now() then
      raise exception 'promo code has expired';
    end if;

    if v_promo.location is not null and v_promo.location <> nullif(p_booking_payload ->> 'promo_location', '') then
      raise exception 'promo code is not available for this location';
    end if;

    if v_promo.show_id is not null and v_promo.show_id <> p_show_id then
      raise exception 'promo code is not available for this show';
    end if;

    select count(*)::integer
      into v_promo_redemption_count
      from public.promo_redemptions
     where promo_code_id = v_promo_code_id;

    if v_promo.usage_limit is not null and v_promo_redemption_count >= v_promo.usage_limit then
      raise exception 'promo code usage limit has been reached';
    end if;
  end if;

  insert into public.bookings (
    addons_total,
    amount_paid,
    balance_outstanding,
    booking_reference,
    booking_source,
    booking_status,
    company_name,
    customer_id,
    dietary_requirements,
    discount_amount,
    guest_count,
    notes,
    payment_status,
    section,
    service_fee,
    show_id,
    subtotal_amount,
    table_id,
    total_amount
  )
  values (
    coalesce((p_booking_payload ->> 'addons_total')::numeric, 0),
    coalesce((p_booking_payload ->> 'amount_paid')::numeric, 0),
    coalesce((p_booking_payload ->> 'balance_outstanding')::numeric, 0),
    p_booking_payload ->> 'booking_reference',
    coalesce(p_booking_payload ->> 'booking_source', 'online'),
    coalesce(p_booking_payload ->> 'booking_status', 'pending_payment')::public.booking_status,
    nullif(p_booking_payload ->> 'company_name', ''),
    (p_booking_payload ->> 'customer_id')::uuid,
    nullif(p_booking_payload ->> 'dietary_requirements', ''),
    coalesce((p_booking_payload ->> 'discount_amount')::numeric, 0),
    greatest((p_booking_payload ->> 'guest_count')::integer, 1),
    p_booking_payload ->> 'notes',
    coalesce(p_booking_payload ->> 'payment_status', 'pending_payment')::public.payment_status,
    nullif(p_booking_payload ->> 'section', ''),
    coalesce((p_booking_payload ->> 'service_fee')::numeric, 0),
    p_show_id,
    coalesce((p_booking_payload ->> 'subtotal_amount')::numeric, 0),
    null,
    coalesce((p_booking_payload ->> 'total_amount')::numeric, 0)
  )
  returning id into v_booking_id;

  if v_promo_code_id is not null then
    insert into public.promo_redemptions (
      promo_code_id,
      booking_id,
      booking_reference,
      customer_id,
      show_id,
      discount_amount,
      subtotal_amount,
      location
    )
    values (
      v_promo_code_id,
      v_booking_id,
      p_booking_payload ->> 'booking_reference',
      (p_booking_payload ->> 'customer_id')::uuid,
      p_show_id,
      coalesce((p_booking_payload ->> 'discount_amount')::numeric, 0),
      coalesce((p_booking_payload ->> 'subtotal_amount')::numeric, 0),
      nullif(p_booking_payload ->> 'promo_location', '')
    );
  end if;

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
    coalesce((p_payment_payload ->> 'amount')::numeric, 0),
    v_booking_id,
    nullif(p_payment_payload ->> 'method', ''),
    nullif(p_payment_payload ->> 'notes', ''),
    coalesce(p_payment_payload ->> 'payment_status', 'pending_payment')::public.payment_status,
    coalesce(p_payment_payload ->> 'payment_type', 'deposit')::public.payment_type,
    coalesce((p_payment_payload ->> 'processed_at')::timestamptz, now()),
    nullif(p_payment_payload ->> 'reference', '')
  )
  returning id into v_payment_id;

  return jsonb_build_object(
    'status', 'success',
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'table_id', null,
    'claimed_table_ids', '[]'::jsonb
  );
end;
$$;

revoke all on function public.reserve_public_booking_entitlement(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_public_booking_entitlement(uuid, jsonb, jsonb) to service_role;
