-- Phase 41.2C: resolve or create the Corporate customer in the same transaction
-- that creates and links the reviewed booking.
create or replace function public.reserve_corporate_conversion_with_customer(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_zone_entitlements jsonb,
  p_table_claims jsonb,
  p_customer_payload jsonb,
  p_mobile_lookup_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_customer_created boolean := false;
  v_email text;
  v_email_customer_id uuid;
  v_first_name text;
  v_mobile text;
  v_mobile_customer_ids uuid[] := '{}';
  v_mobile_variants text[] := '{}';
  v_result jsonb;
  v_surname text;
begin
  if p_show_id is null
     or p_booking_payload ->> 'booking_source' <> 'corporate-direct'
     or nullif(p_booking_payload ->> 'corporate_request_id', '') is null
     or nullif(p_booking_payload ->> 'created_by_staff_id', '') is null then
    raise exception 'CORPORATE_CONVERSION_CONTEXT_INVALID';
  end if;

  select staff.* into v_actor
    from public.staff_profiles staff
   where staff.id = (p_booking_payload ->> 'created_by_staff_id')::uuid
     and staff.active
     and exists (
       select 1
         from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = staff.role_id
          and permission.key = 'bookings:manage'
     );

  if v_actor.id is null then
    raise exception 'CORPORATE_CONVERSION_PERMISSION_REQUIRED';
  end if;

  v_email := lower(nullif(trim(p_customer_payload ->> 'email'), ''));
  v_mobile := nullif(regexp_replace(coalesce(p_customer_payload ->> 'mobile', ''), '\D', '', 'g'), '');
  v_first_name := nullif(trim(p_customer_payload ->> 'first_name'), '');
  v_surname := nullif(trim(p_customer_payload ->> 'surname'), '');

  if v_email is null or v_first_name is null then
    raise exception 'CORPORATE_CUSTOMER_IDENTITY_INCOMPLETE';
  end if;

  perform pg_advisory_xact_lock(hashtext('corporate-customer-email:' || v_email));
  if v_mobile is not null then
    select coalesce(
      array_agg(distinct regexp_replace(value, '\D', '', 'g'))
        filter (where regexp_replace(value, '\D', '', 'g') <> ''),
      '{}'::text[]
    ) into v_mobile_variants
      from jsonb_array_elements_text(coalesce(p_mobile_lookup_variants, '[]'::jsonb));
    if not (v_mobile = any(v_mobile_variants)) then
      v_mobile_variants := array_append(v_mobile_variants, v_mobile);
    end if;
    perform pg_advisory_xact_lock(hashtext('corporate-customer-mobile:' || v_mobile));
  end if;

  select id into v_email_customer_id
    from public.customers
   where lower(email) = v_email
   limit 1;

  if v_mobile is not null then
    select coalesce(array_agg(id order by created_at), '{}'::uuid[])
      into v_mobile_customer_ids
      from public.customers
     where nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '') = any(v_mobile_variants);
  end if;

  if cardinality(v_mobile_customer_ids) > 1
     or (
       v_email_customer_id is not null
       and cardinality(v_mobile_customer_ids) = 1
       and v_mobile_customer_ids[1] <> v_email_customer_id
     ) then
    raise exception 'CORPORATE_CUSTOMER_IDENTITY_AMBIGUOUS';
  end if;

  if v_email_customer_id is not null then
    select * into v_customer
      from public.customers
     where id = v_email_customer_id
     for update;

    if v_mobile is not null
       and v_customer.mobile is not null
       and not (
         nullif(regexp_replace(v_customer.mobile, '\D', '', 'g'), '') = any(v_mobile_variants)
       ) then
      raise exception 'CORPORATE_CUSTOMER_IDENTITY_AMBIGUOUS';
    end if;
  elsif cardinality(v_mobile_customer_ids) = 1 then
    select * into v_customer
      from public.customers
     where id = v_mobile_customer_ids[1]
     for update;

    if v_customer.email is not null and lower(v_customer.email) <> v_email then
      raise exception 'CORPORATE_CUSTOMER_IDENTITY_AMBIGUOUS';
    end if;
  end if;

  if v_customer.id is null then
    insert into public.customers (
      first_name,
      surname,
      email,
      mobile,
      preferences,
      relationship_notes,
      dietary_requirements,
      vip_status
    ) values (
      v_first_name,
      v_surname,
      v_email,
      nullif(trim(p_customer_payload ->> 'mobile'), ''),
      coalesce(p_customer_payload -> 'preferences', '{}'::jsonb),
      coalesce(p_customer_payload ->> 'relationship_notes', ''),
      nullif(p_customer_payload ->> 'dietary_requirements', ''),
      nullif(p_customer_payload ->> 'vip_status', '')
    ) returning * into v_customer;
    v_customer_created := true;
  else
    update public.customers
       set email = coalesce(email, v_email),
           mobile = coalesce(mobile, nullif(trim(p_customer_payload ->> 'mobile'), '')),
           updated_at = case
             when email is null or (mobile is null and v_mobile is not null)
               then clock_timestamp()
             else updated_at
           end
     where id = v_customer.id
     returning * into v_customer;
  end if;

  p_booking_payload := p_booking_payload || jsonb_build_object('customer_id', v_customer.id);

  if jsonb_typeof(p_zone_entitlements) = 'array'
     and jsonb_array_length(p_zone_entitlements) > 1 then
    select public.reserve_corporate_multi_zone_entitlement(
      p_show_id,
      p_booking_payload,
      p_payment_payload,
      p_zone_entitlements
    ) into v_result;
  elsif jsonb_typeof(p_table_claims) = 'array'
        and jsonb_array_length(p_table_claims) > 0 then
    select public.reserve_public_booking_table(
      p_show_id,
      p_booking_payload,
      p_payment_payload,
      p_table_claims
    ) into v_result;
  else
    select public.reserve_public_booking_entitlement(
      p_show_id,
      p_booking_payload,
      p_payment_payload
    ) into v_result;
  end if;

  if coalesce(v_result ->> 'status', '') not in ('success', 'already_exists') then
    raise exception 'CORPORATE_BOOKING_RESERVATION_FAILED';
  end if;

  select * into v_booking
    from public.bookings
   where id = (v_result ->> 'booking_id')::uuid;

  if v_booking.customer_id <> v_customer.id
     or v_booking.corporate_request_id <> (p_booking_payload ->> 'corporate_request_id')::uuid then
    raise exception 'CORPORATE_CONVERSION_LINK_FAILED';
  end if;

  if v_customer_created then
    insert into public.audit_events (
      action,
      actor_staff_profile_id,
      actor_auth_user_id,
      actor_name,
      actor_location_scope,
      entity_type,
      entity_reference,
      entity_id,
      outcome,
      source_area,
      reason,
      after_values,
      changed_fields
    ) values (
      'customer.create',
      v_actor.id,
      v_actor.user_id,
      coalesce(v_actor.full_name, v_actor.email, 'SYSTEM'),
      coalesce(v_actor.venue_scope, '{}'::text[]),
      'customer',
      v_email,
      v_customer.id::text,
      'success',
      'Corporate Conversion',
      'Customer created atomically from an authoritative Corporate enquiry.',
      jsonb_build_object(
        'customer_id', v_customer.id,
        'email', v_email,
        'mobile_present', v_customer.mobile is not null,
        'corporate_request_id', p_booking_payload ->> 'corporate_request_id'
      ),
      array['id', 'first_name', 'surname', 'email', 'mobile']
    );
  end if;

  return v_result || jsonb_build_object(
    'customer_id', v_customer.id,
    'customer_created', v_customer_created
  );
end;
$$;

revoke all on function public.reserve_corporate_conversion_with_customer(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.reserve_corporate_conversion_with_customer(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

comment on function public.reserve_corporate_conversion_with_customer(
  uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Atomically resolves or creates the authoritative Corporate customer and reserves the linked booking.';
