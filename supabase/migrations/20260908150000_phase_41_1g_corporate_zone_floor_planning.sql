-- Phase 41.1G: keep Corporate zone entitlement independent from physical table
-- compatibility and create reviewed temporary Floor capacity atomically.

create or replace function public.transfer_corporate_booking_zone_atomic(
  p_booking_reference text,
  p_expected_show_id uuid,
  p_expected_zone text,
  p_expected_table_id uuid,
  p_expected_updated_at timestamptz,
  p_target_zone text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
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
  v_existing_target_pax integer := 0;
  v_released_claims integer := 0;
  v_show public.shows%rowtype;
  v_source_zone text;
  v_target_section text;
  v_target_zone text;
  v_zone_limit integer;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and permission.key = 'bookings:manage';

  if v_actor_name is null then
    raise exception 'BOOKING_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;

  if v_booking.id is null then
    raise exception 'CORPORATE_BOOKING_NOT_FOUND';
  end if;

  if v_booking.booking_origin <> 'corporate'
     or v_booking.booking_source <> 'corporate-direct' then
    raise exception 'CORPORATE_BOOKING_REQUIRED';
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED';
  end if;

  if v_booking.show_id <> p_expected_show_id
     or v_booking.section is distinct from p_expected_zone
     or v_booking.table_id is distinct from p_expected_table_id
     or v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'CORPORATE_ZONE_TRANSFER_STALE';
  end if;

  select * into v_show
    from public.shows
   where id = v_booking.show_id
   for share;

  if v_show.id is null then
    raise exception 'SHOW_NOT_FOUND';
  end if;

  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  v_source_zone := public.normalize_booking_capacity_zone(v_booking.section);
  v_target_zone := public.normalize_booking_capacity_zone(p_target_zone);
  v_zone_limit := public.booking_capacity_zone_limit(v_target_zone);
  v_target_section := case v_target_zone
    when 'golden-circle' then 'Golden Circle'
    when 'middle-ring' then 'Middle Ring'
    when 'royal-booths' then 'Private Booths'
    when 'royal-balcony' then 'Royal Balcony'
    else null
  end;

  if v_source_zone is null then
    raise exception 'SUPPORTED_SOURCE_ZONE_REQUIRED';
  end if;

  if v_target_section is null or v_zone_limit is null then
    raise exception 'SUPPORTED_TARGET_ZONE_REQUIRED';
  end if;

  if v_source_zone = v_target_zone then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'idempotent', true,
      'section', v_booking.section,
      'show_id', v_booking.show_id,
      'table_id', v_booking.table_id
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_booking.show_id::text || ':' || least(v_source_zone, v_target_zone), 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_booking.show_id::text || ':' || greatest(v_source_zone, v_target_zone), 0)
  );

  select coalesce(sum(greatest(coalesce(guest_count, 0), 0)), 0)::integer
    into v_existing_target_pax
    from public.bookings
   where show_id = v_booking.show_id
     and id <> v_booking.id
     and archived_at is null
     and booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     and public.normalize_booking_capacity_zone(section) = v_target_zone;

  if v_existing_target_pax + v_booking.guest_count > v_zone_limit then
    raise exception using
      errcode = '23514',
      message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_target_zone,
        v_zone_limit,
        v_existing_target_pax + v_booking.guest_count
      );
  end if;

  perform 1
    from public.show_tables
   where booking_id = v_booking.id
   for update;

  update public.show_tables
     set booking_id = null,
         status = case
           when capacity_configured then 'available'::public.table_status
           else 'disabled'::public.table_status
         end,
         updated_at = clock_timestamp()
   where booking_id = v_booking.id;
  get diagnostics v_released_claims = row_count;

  update public.bookings
     set section = v_target_section,
         table_id = null,
         updated_at = clock_timestamp()
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'booking.corporate-zone-transferred',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'section', v_target_section,
      'show_id', v_booking.show_id,
      'table_id', null,
      'floor_assignment_required', true,
      'released_table_claims', v_released_claims
    ),
    jsonb_build_object(
      'section', v_booking.section,
      'show_id', v_booking.show_id,
      'table_id', v_booking.table_id
    ),
    array['section', 'table_id'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    format(
      'Corporate seating entitlement moved from %s to %s; Floor assignment remains required.',
      v_booking.section,
      v_target_section
    ),
    'Booking Details'
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'idempotent', false,
    'released_table_claims', v_released_claims,
    'section', v_target_section,
    'show_id', v_booking.show_id,
    'table_id', null
  );
end;
$$;

revoke all on function public.transfer_corporate_booking_zone_atomic(
  text, uuid, text, uuid, timestamptz, text, uuid, uuid, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.transfer_corporate_booking_zone_atomic(
  text, uuid, text, uuid, timestamptz, text, uuid, uuid, text, text, text[]
) to service_role;

create or replace function public.create_temporary_floor_capacity_plan_atomic(
  p_show_id uuid,
  p_zone_id text,
  p_capacities integer[],
  p_expected_booking_state jsonb,
  p_expected_table_state jsonb,
  p_plan_summary jsonb,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
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
  v_capacity integer;
  v_created jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_expected_count integer;
  v_next_code integer;
  v_row public.show_tables%rowtype;
  v_show public.shows%rowtype;
  v_zone text;
  v_zone_pax integer := 0;
  v_zone_limit integer;
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
         from public.role_permissions role_permission
         join public.permissions permission on permission.id = role_permission.permission_id
        where role_permission.role_id = role.id
          and permission.key = 'bookings:manage'
     )
     and exists (
       select 1
         from public.role_permissions role_permission
         join public.permissions permission on permission.id = role_permission.permission_id
        where role_permission.role_id = role.id
          and permission.key = 'tables:manage'
     );

  if v_actor_name is null then
    raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  if coalesce(cardinality(p_capacities), 0) = 0
     or cardinality(p_capacities) > 100
     or exists (
       select 1 from unnest(coalesce(p_capacities, '{}'::integer[])) capacity
       where capacity < 1 or capacity > 12
     ) then
    raise exception 'TEMPORARY_CAPACITY_PLAN_INVALID';
  end if;

  v_zone := public.normalize_booking_capacity_zone(p_zone_id);
  v_zone_limit := public.booking_capacity_zone_limit(v_zone);
  if v_zone is null or v_zone_limit is null then
    raise exception 'SUPPORTED_TARGET_ZONE_REQUIRED';
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null or v_show.status::text <> 'active' then
    raise exception 'ACTIVE_SHOW_REQUIRED';
  end if;

  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text || ':' || v_zone, 0));

  v_expected_count := coalesce(jsonb_array_length(p_expected_booking_state), 0);
  if (select count(*) from public.bookings where show_id = p_show_id and archived_at is null) <> v_expected_count
     or exists (
       select 1
         from public.bookings booking
        where booking.show_id = p_show_id
          and booking.archived_at is null
          and not exists (
            select 1
              from jsonb_array_elements(p_expected_booking_state) expected
             where (expected ->> 'id')::uuid = booking.id
               and coalesce(expected ->> 'booking_status', '') = booking.booking_status::text
               and coalesce((expected ->> 'guest_count')::integer, 0) = booking.guest_count
               and coalesce(expected ->> 'section', '') = coalesce(booking.section, '')
               and nullif(expected ->> 'table_id', '')::uuid is not distinct from booking.table_id
               and (expected ->> 'updated_at')::timestamptz = booking.updated_at
          )
     ) then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  v_expected_count := coalesce(jsonb_array_length(p_expected_table_state), 0);
  if (select count(*) from public.show_tables where show_id = p_show_id) <> v_expected_count
     or exists (
       select 1
         from public.show_tables floor_table
        where floor_table.show_id = p_show_id
          and not exists (
            select 1
              from jsonb_array_elements(p_expected_table_state) expected
             where (expected ->> 'id')::uuid = floor_table.id
               and nullif(expected ->> 'booking_id', '')::uuid is not distinct from floor_table.booking_id
               and coalesce((expected ->> 'capacity')::integer, 0) = coalesce(floor_table.capacity, 0)
               and coalesce((expected ->> 'capacity_configured')::boolean, false) = floor_table.capacity_configured
               and coalesce(expected ->> 'status', '') = floor_table.status::text
               and (expected ->> 'updated_at')::timestamptz = floor_table.updated_at
          )
     ) then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  select coalesce(sum(greatest(coalesce(guest_count, 0), 0)), 0)::integer
    into v_zone_pax
    from public.bookings
   where show_id = p_show_id
     and archived_at is null
     and booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     and public.normalize_booking_capacity_zone(section) = v_zone;

  if v_zone_pax > v_zone_limit then
    raise exception 'ZONE_CAPACITY_INSUFFICIENT';
  end if;

  select coalesce(max(table_code::integer), 0) + 1
    into v_next_code
    from public.show_tables
   where show_id = p_show_id
     and public.normalize_booking_capacity_zone(section) = v_zone
     and table_code ~ '^[0-9]+$';

  foreach v_capacity in array p_capacities loop
    while exists (
      select 1 from public.show_tables
       where show_id = p_show_id and table_code = v_next_code::text
    ) loop
      v_next_code := v_next_code + 1;
    end loop;

    insert into public.show_tables (
      availability_scope, capacity, capacity_configured, custom_price_per_person,
      is_override, is_physical, merged_from, override_notes, section, show_id,
      status, table_code
    ) values (
      'operational', v_capacity, true, null,
      true, false, '{}'::uuid[],
      'Created from an approved show-wide Floor capacity plan.',
      v_zone, p_show_id, 'available', v_next_code::text
    ) returning * into v_row;

    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'table_code', v_row.table_code,
      'capacity', v_row.capacity,
      'section', v_row.section
    ));
    v_created_count := v_created_count + 1;
    v_next_code := v_next_code + 1;
  end loop;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'show.floor-temporary-plan-created',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('tables', v_created, 'plan', p_plan_summary),
    jsonb_build_object('tables_created', 0),
    array['show_tables'],
    p_show_id::text,
    p_show_id::text || ':' || v_zone,
    'show',
    'success',
    format('Created %s reviewed temporary operational tables for %s.', v_created_count, v_zone),
    'Operations Floor'
  );

  return jsonb_build_object(
    'created_count', v_created_count,
    'show_id', p_show_id,
    'tables', v_created,
    'zone', v_zone
  );
end;
$$;

revoke all on function public.create_temporary_floor_capacity_plan_atomic(
  uuid, text, integer[], jsonb, jsonb, jsonb, uuid, uuid, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.create_temporary_floor_capacity_plan_atomic(
  uuid, text, integer[], jsonb, jsonb, jsonb, uuid, uuid, text, text, text[]
) to service_role;

comment on function public.transfer_corporate_booking_zone_atomic(
  text, uuid, text, uuid, timestamptz, text, uuid, uuid, text, text, text[]
) is 'Atomically transfers Corporate show-zone entitlement without requiring a single compatible table or changing financial state.';

comment on function public.create_temporary_floor_capacity_plan_atomic(
  uuid, text, integer[], jsonb, jsonb, jsonb, uuid, uuid, text, text, text[]
) is 'Creates one reviewed, show-scoped temporary Floor capacity plan atomically after authoritative stale-state validation.';
