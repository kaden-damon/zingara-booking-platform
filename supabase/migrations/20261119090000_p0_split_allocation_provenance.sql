-- Split allocation finalisation must retain provenance assigned by the insert.
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
           v_booking.provenance_recorded_at,
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
