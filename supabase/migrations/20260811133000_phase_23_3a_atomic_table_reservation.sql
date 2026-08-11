create or replace function public.reserve_public_booking_table(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_table_claims jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_claim jsonb;
  v_claimed_table_ids uuid[] := '{}';
  v_claim_count integer := 0;
  v_conflicting_table public.show_tables%rowtype;
  v_existing_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_primary_table public.show_tables%rowtype;
  v_table public.show_tables%rowtype;
  v_table_code text;
begin
  if p_show_id is null then
    raise exception 'show_id is required';
  end if;

  if coalesce(jsonb_array_length(p_table_claims), 0) = 0 then
    raise exception 'at least one table claim is required';
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

  for v_claim in
    select value
      from jsonb_array_elements(p_table_claims)
  loop
    v_table_code := nullif(trim(v_claim ->> 'table_code'), '');

    if v_table_code is null then
      raise exception 'table_code is required for every claim';
    end if;

    insert into public.show_tables (
      show_id,
      table_code,
      section,
      capacity,
      status,
      is_override,
      override_notes
    )
    values (
      p_show_id,
      v_table_code,
      coalesce(nullif(trim(v_claim ->> 'section'), ''), p_booking_payload ->> 'section', 'Unassigned'),
      greatest(coalesce((v_claim ->> 'capacity')::integer, (p_booking_payload ->> 'guest_count')::integer, 1), 1),
      'available',
      true,
      'Created by public booking reservation claim'
    )
    on conflict (show_id, table_code) do nothing;
  end loop;

  for v_table in
    select st.*
      from public.show_tables st
      join jsonb_array_elements(p_table_claims) claim
        on st.table_code = claim.value ->> 'table_code'
     where st.show_id = p_show_id
     order by st.table_code
     for update of st
  loop
    v_claim_count := v_claim_count + 1;

    if v_table.booking_id is not null or v_table.status <> 'available' then
      v_conflicting_table := v_table;
    end if;

    if v_primary_table.id is null then
      v_primary_table := v_table;
    end if;

    v_claimed_table_ids := array_append(v_claimed_table_ids, v_table.id);
  end loop;

  if v_claim_count <> jsonb_array_length(p_table_claims) then
    raise exception 'one or more table claims could not be resolved';
  end if;

  if v_conflicting_table.id is not null then
    return jsonb_build_object(
      'status', 'conflict',
      'table_id', v_conflicting_table.id,
      'table_code', v_conflicting_table.table_code
    );
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
    v_primary_table.id,
    coalesce((p_booking_payload ->> 'total_amount')::numeric, 0)
  )
  returning id into v_booking_id;

  update public.show_tables
     set booking_id = v_booking_id,
         status = 'booked',
         updated_at = now()
   where id = any(v_claimed_table_ids)
     and booking_id is null
     and status = 'available';

  if not found then
    raise exception 'table claim failed after booking insert';
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
    'table_id', v_primary_table.id,
    'claimed_table_ids', to_jsonb(v_claimed_table_ids)
  );
end;
$$;

grant execute on function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb) to service_role;
