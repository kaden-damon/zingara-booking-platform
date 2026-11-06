-- Phase 3: staff-only multi-zone Paid / COMP guest allocations.
alter table public.bookings
  add column if not exists guest_allocations jsonb;

create or replace function public.booking_guest_allocations_valid(
  p_allocations jsonb,
  p_guest_count integer
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_item jsonb;
  v_paid integer;
  v_comp integer;
  v_total integer := 0;
  v_zone text;
  v_zones text[] := '{}';
begin
  if p_allocations is null then return true; end if;
  if jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'paidPax', '') !~ '^\d+$'
       or coalesce(v_item ->> 'complimentaryPax', '') !~ '^\d+$' then
      return false;
    end if;
    v_zone := public.normalize_booking_capacity_zone(v_item ->> 'zoneId');
    v_paid := (v_item ->> 'paidPax')::integer;
    v_comp := (v_item ->> 'complimentaryPax')::integer;
    if v_zone is null or v_zone = any(v_zones) or v_paid + v_comp <= 0 then
      return false;
    end if;
    if v_comp > 0 and coalesce(v_item ->> 'complimentaryCategory', '')
       not in ('standard', 'media', 'tradex') then
      return false;
    end if;
    v_zones := array_append(v_zones, v_zone);
    v_total := v_total + v_paid + v_comp;
  end loop;

  return v_total = p_guest_count;
exception when others then
  return false;
end;
$$;

create or replace function public.booking_guest_allocation_entitlements(
  p_allocations jsonb
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_allocations is null then null
    else coalesce(jsonb_agg(jsonb_build_object(
      'zoneId', item ->> 'zoneId',
      'pax', (item ->> 'paidPax')::integer + (item ->> 'complimentaryPax')::integer
    ) order by ordinal), '[]'::jsonb)
  end
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
    with ordinality allocation(item, ordinal);
$$;

alter table public.bookings
  drop constraint if exists bookings_zone_entitlements_valid;
alter table public.bookings
  add constraint bookings_zone_entitlements_valid
  check (
    public.corporate_zone_entitlements_valid(zone_entitlements, guest_count)
    and public.booking_guest_allocations_valid(guest_allocations, guest_count)
    and (
      zone_entitlements is null
      or (booking_source = 'corporate-direct' and booking_origin = 'corporate')
      or (
        guest_allocations is not null
        and booking_origin = 'admin_staff'
        and booking_source in ('admin', 'corporate-direct')
      )
    )
    and (
      guest_allocations is null
      or zone_entitlements = public.booking_guest_allocation_entitlements(guest_allocations)
    )
  );

create or replace function public.reserve_staff_guest_allocations(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_zone_entitlements jsonb,
  p_guest_allocations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_booking public.bookings%rowtype;
  v_primary jsonb;
  v_result jsonb;
  v_total integer;
begin
  v_total := coalesce((p_booking_payload ->> 'guest_count')::integer, 0);
  if p_booking_payload ->> 'booking_source' not in ('admin', 'corporate-direct')
     or p_booking_payload ->> 'booking_origin' <> 'admin_staff'
     or nullif(p_booking_payload ->> 'created_by_staff_id', '') is null
     or not public.booking_guest_allocations_valid(p_guest_allocations, v_total)
     or p_zone_entitlements is distinct from
        public.booking_guest_allocation_entitlements(p_guest_allocations)
     then
    raise exception 'STAFF_GUEST_ALLOCATION_CONTEXT_INVALID';
  end if;

  select staff.* into v_actor
    from public.staff_profiles staff
   where staff.id = (p_booking_payload ->> 'created_by_staff_id')::uuid
     and staff.active
     and exists (
       select 1
         from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = staff.role_id and permission.key = 'bookings:manage'
     );
  if v_actor.id is null then
    raise exception 'STAFF_GUEST_ALLOCATION_PERMISSION_REQUIRED';
  end if;

  v_primary := p_zone_entitlements -> 0;
  select public.reserve_public_booking_entitlement(
    p_show_id,
    p_booking_payload || jsonb_build_object(
      'guest_count', (v_primary ->> 'pax')::integer,
      'section', v_primary ->> 'zoneId'
    ),
    p_payment_payload
  ) into v_result;

  select * into v_booking
    from public.bookings
   where id = (v_result ->> 'booking_id')::uuid
   for update;

  if v_result ->> 'status' = 'already_exists' then
    if v_booking.guest_count <> v_total
       or v_booking.zone_entitlements is distinct from p_zone_entitlements
       or v_booking.guest_allocations is distinct from p_guest_allocations then
      raise exception 'STAFF_GUEST_ALLOCATION_IDEMPOTENCY_CONFLICT';
    end if;
    return v_result || jsonb_build_object(
      'guest_allocations', p_guest_allocations,
      'zone_entitlements', p_zone_entitlements
    );
  end if;

  update public.bookings
     set booking_origin = 'admin_staff',
         company_id = nullif(p_booking_payload ->> 'company_id', '')::uuid,
         corporate_request_id = nullif(p_booking_payload ->> 'corporate_request_id', '')::uuid,
         created_by_staff_id = v_actor.id,
         guest_count = v_total,
         guest_allocations = p_guest_allocations,
         provenance_recorded_at = coalesce(
           nullif(p_booking_payload ->> 'provenance_recorded_at', '')::timestamptz,
           clock_timestamp()
         ),
         section = v_primary ->> 'zoneId',
         updated_at = clock_timestamp(),
         zone_entitlements = p_zone_entitlements
   where id = v_booking.id;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  )
  select 'booking.staff-guest-allocation-created', staff.user_id,
    coalesce(staff.venue_scope, '{}'::text[]), staff.full_name, role.name,
    staff.id, jsonb_build_object(
      'guest_allocations', p_guest_allocations,
      'zone_entitlements', p_zone_entitlements,
      'guest_count', v_total
    ), '{}'::jsonb,
    array['guest_allocations','zone_entitlements','guest_count'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    'Authorised staff guest allocation created.', 'Booking Creation'
  from public.staff_profiles staff
  join public.roles role on role.id = staff.role_id
  where staff.id = v_actor.id;

  return v_result || jsonb_build_object(
    'guest_allocations', p_guest_allocations,
    'zone_entitlements', p_zone_entitlements
  );
end;
$$;

revoke all on function public.reserve_staff_guest_allocations(uuid,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_staff_guest_allocations(uuid,jsonb,jsonb,jsonb,jsonb)
  to service_role;

create or replace function public.reserve_staff_guest_allocations_with_customer(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_zone_entitlements jsonb,
  p_table_claims jsonb,
  p_customer_payload jsonb,
  p_mobile_lookup_variants jsonb,
  p_guest_allocations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_result jsonb;
  v_total integer;
begin
  v_total := coalesce((p_booking_payload ->> 'guest_count')::integer, 0);
  if not public.booking_guest_allocations_valid(p_guest_allocations, v_total)
     or p_zone_entitlements is distinct from
        public.booking_guest_allocation_entitlements(p_guest_allocations) then
    raise exception 'CORPORATE_GUEST_ALLOCATION_CONTEXT_INVALID';
  end if;

  select public.reserve_corporate_conversion_with_customer(
    p_show_id, p_booking_payload, p_payment_payload, p_zone_entitlements,
    p_table_claims, p_customer_payload, p_mobile_lookup_variants
  ) into v_result;

  select * into v_booking
    from public.bookings
   where id = (v_result ->> 'booking_id')::uuid
   for update;
  if v_booking.guest_count <> v_total then
    raise exception 'CORPORATE_GUEST_ALLOCATION_RESERVATION_MISMATCH';
  end if;
  if v_booking.guest_allocations is not null
     and v_booking.guest_allocations is distinct from p_guest_allocations then
    raise exception 'CORPORATE_GUEST_ALLOCATION_IDEMPOTENCY_CONFLICT';
  end if;

  update public.bookings
     set guest_allocations = p_guest_allocations,
         section = p_zone_entitlements -> 0 ->> 'zoneId',
         zone_entitlements = p_zone_entitlements,
         updated_at = case
           when guest_allocations is distinct from p_guest_allocations
             then clock_timestamp()
           else updated_at
         end
   where id = v_booking.id;

  return v_result || jsonb_build_object(
    'guest_allocations', p_guest_allocations,
    'zone_entitlements', p_zone_entitlements
  );
end;
$$;

revoke all on function public.reserve_staff_guest_allocations_with_customer(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_staff_guest_allocations_with_customer(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)
  to service_role;

comment on column public.bookings.guest_allocations is
  'Authoritative staff-reviewed per-zone Paid / COMP guest allocation. Null preserves legacy booking behaviour.';
