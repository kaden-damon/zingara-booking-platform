-- P0: atomically move an assigned booking between operational table sets.
-- Financial fields are deliberately outside this seating-only operation.

create or replace function public.reallocate_booking_zone_tables_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_expected_table_ids uuid[],
  p_target_zone text,
  p_target_table_ids uuid[],
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_booking public.bookings%rowtype;
  v_combined_capacity integer := 0;
  v_current_table_ids uuid[] := '{}'::uuid[];
  v_member_capacity integer;
  v_member_count integer;
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
  v_table_codes text[] := '{}'::text[];
  v_target_booking_section text;
  v_target_zone text;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (
       select 1
         from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = role.id
          and permission.key = 'bookings:manage'
     )
     and exists (
       select 1
         from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = role.id
          and permission.key = 'tables:manage'
     );

  if v_actor_name is null then
    raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  v_target_zone := public.normalize_booking_capacity_zone(p_target_zone);
  v_target_booking_section := case v_target_zone
    when 'golden-circle' then 'Golden Circle'
    when 'middle-ring' then 'Middle Ring'
    when 'royal-booths' then 'Private Booths'
    when 'royal-balcony' then 'Royal Balcony'
    else null
  end;

  if v_target_booking_section is null then
    raise exception 'SUPPORTED_TARGET_ZONE_REQUIRED';
  end if;

  if cardinality(coalesce(p_target_table_ids, '{}'::uuid[])) = 0
     or cardinality(p_target_table_ids) <> (
       select count(distinct id) from unnest(p_target_table_ids) id
     ) then
    raise exception 'TABLE_ASSIGNMENT_SET_INVALID';
  end if;

  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'pending_payment', 'confirmed', 'checked_in') then
    raise exception 'ACTIVE_BOOKING_REQUIRED';
  end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'FLOOR_PLAN_STALE';
  end if;
  if coalesce(jsonb_array_length(v_booking.zone_entitlements), 0) > 1 then
    raise exception 'MULTI_ZONE_BOOKING_WORKFLOW_REQUIRED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id for share;
  if v_show.id is null then
    raise exception 'SHOW_NOT_FOUND';
  end if;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text, 0));
  perform 1
    from public.show_tables
   where show_id = v_booking.show_id
     and (booking_id = v_booking.id or id = any(p_target_table_ids))
   order by id
   for update;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_current_table_ids
    from public.show_tables
   where booking_id = v_booking.id
     and merged_parent_id is null;

  if v_current_table_ids <> array(
    select id from unnest(coalesce(p_expected_table_ids, '{}'::uuid[])) id order by id
  ) then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  for v_table in
    select *
      from public.show_tables
     where id = any(p_target_table_ids)
     order by array_position(p_target_table_ids, id)
  loop
    if v_table.show_id <> v_booking.show_id then
      raise exception 'CROSS_SHOW_TABLE_ASSIGNMENT';
    end if;
    if public.normalize_booking_capacity_zone(v_table.section) <> v_target_zone then
      raise exception 'CROSS_ZONE_TABLE_ASSIGNMENT';
    end if;
    if not v_table.capacity_configured or v_table.capacity is null or v_table.capacity <= 0 then
      raise exception 'TABLE_CAPACITY_REQUIRED';
    end if;
    if v_table.merged_parent_id is not null then
      raise exception 'MERGED_CHILD_NOT_ASSIGNABLE';
    end if;
    if v_table.booking_id is not null and v_table.booking_id <> v_booking.id then
      raise exception 'TABLE_ALREADY_CLAIMED';
    end if;
    if v_table.booking_id is null and v_table.status::text <> 'available' then
      raise exception 'TABLE_NOT_AVAILABLE';
    end if;
    if v_table.is_physical then
      if cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) <> 0 then
        raise exception 'TABLE_NOT_ASSIGNABLE';
      end if;
    elsif cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) > 0 then
      if not v_table.is_override or v_table.availability_scope::text <> 'operational' then
        raise exception 'MERGED_PARENT_INVALID';
      end if;
      perform 1
        from public.show_tables member
       where member.id = any(v_table.merged_from)
       order by member.id
       for update;
      select count(*)::integer, coalesce(sum(member.capacity), 0)::integer
        into v_member_count, v_member_capacity
        from public.show_tables member
       where member.id = any(v_table.merged_from)
         and member.show_id = v_table.show_id
         and public.normalize_booking_capacity_zone(member.section) = v_target_zone
         and member.is_physical
         and member.capacity_configured
         and member.capacity is not null
         and member.status::text = 'disabled'
         and member.booking_id is null
         and member.merged_parent_id = v_table.id
         and cardinality(coalesce(member.merged_from, '{}'::uuid[])) = 0;
      if v_member_count <> cardinality(v_table.merged_from)
         or v_member_capacity <> v_table.capacity then
        raise exception 'MERGED_PARENT_INVALID';
      end if;
    elsif not (v_table.is_override and v_table.availability_scope::text = 'operational') then
      raise exception 'TABLE_NOT_ASSIGNABLE';
    end if;

    v_combined_capacity := v_combined_capacity + v_table.capacity;
    v_table_codes := array_append(v_table_codes, v_table.table_code);
  end loop;

  if cardinality(v_table_codes) <> cardinality(p_target_table_ids) then
    raise exception 'TABLE_ASSIGNMENT_SET_INVALID';
  end if;
  if v_combined_capacity < v_booking.guest_count then
    raise exception 'COMBINED_TABLE_CAPACITY_INSUFFICIENT';
  end if;

  update public.show_tables
     set booking_id = null,
         status = case
           when capacity_configured then 'available'::public.table_status
           else 'disabled'::public.table_status
         end,
         updated_at = clock_timestamp()
   where booking_id = v_booking.id
     and not (id = any(p_target_table_ids));

  update public.show_tables
     set booking_id = v_booking.id,
         status = 'booked',
         updated_at = clock_timestamp()
   where id = any(p_target_table_ids);

  update public.bookings
     set section = v_target_booking_section,
         table_id = p_target_table_ids[1],
         zone_entitlements = case
           when v_booking.zone_entitlements is null then null
           else jsonb_build_array(jsonb_build_object(
             'zoneId', v_target_zone,
             'pax', v_booking.guest_count
           ))
         end,
         updated_at = clock_timestamp()
   where id = v_booking.id;

  insert into public.audit_events(
    action,
    actor_auth_user_id,
    actor_location_scope,
    actor_name,
    actor_role,
    actor_staff_profile_id,
    after_values,
    before_values,
    changed_fields,
    entity_id,
    entity_reference,
    entity_type,
    outcome,
    reason,
    source_area
  ) values (
    'booking.zone-table-set-reallocated',
    p_actor_auth_user_id,
    v_actor_location_scope,
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'section', v_target_booking_section,
      'table_ids', p_target_table_ids,
      'table_codes', v_table_codes,
      'combined_capacity', v_combined_capacity
    ),
    jsonb_build_object(
      'section', v_booking.section,
      'table_ids', v_current_table_ids
    ),
    array['section', 'table_id', 'show_tables'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    'Authorised operational table set reallocated atomically.',
    'Operations Floor'
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'combined_capacity', v_combined_capacity,
    'previous_section', v_booking.section,
    'previous_table_ids', v_current_table_ids,
    'section', v_target_booking_section,
    'table_codes', v_table_codes,
    'table_ids', p_target_table_ids
  );
end;
$$;

revoke all on function public.reallocate_booking_zone_tables_atomic(
  text, timestamptz, uuid[], text, uuid[], uuid, uuid
) from public, anon, authenticated;
grant execute on function public.reallocate_booking_zone_tables_atomic(
  text, timestamptz, uuid[], text, uuid[], uuid, uuid
) to service_role;
