-- Phase 1: keep Full Show Buyout section planning and per-zone table claims
-- atomic while reusing the existing Corporate booking and show-table model.

create or replace function public.update_full_show_buyout_seating_allocation_atomic(
  p_buyout_id uuid,
  p_expected_revision integer,
  p_zone_allocations jsonb,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_request_id text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_claim public.show_tables%rowtype;
  v_zone text;
begin
  if not exists (
    select 1
      from public.staff_profiles staff
      join public.roles role on role.id = staff.role_id
     where staff.id = p_actor_staff_profile_id
       and staff.user_id = p_actor_auth_user_id
       and staff.active
       and exists (
         select 1 from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
         where rp.role_id = role.id and permission.key = 'bookings:manage'
       )
       and exists (
         select 1 from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
         where rp.role_id = role.id and permission.key = 'tables:manage'
       )
  ) then
    raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  select booking_id into v_booking_id
    from public.corporate_buyouts
   where id = p_buyout_id
     and state in ('provisional','awaiting_payment','fully_paid','confirmed')
   for update;
  if v_booking_id is null then raise exception 'BUYOUT_NOT_ACTIVE'; end if;

  perform 1 from public.bookings where id = v_booking_id for update;
  perform 1 from public.show_tables where booking_id = v_booking_id order by id for update;

  for v_claim in
    select * from public.show_tables where booking_id = v_booking_id order by id
  loop
    v_zone := public.normalize_booking_capacity_zone(v_claim.section);
    if v_zone is null or not exists (
      select 1
        from jsonb_array_elements(coalesce(p_zone_allocations, '[]'::jsonb)) item
       where public.normalize_booking_capacity_zone(item ->> 'zoneId') = v_zone
    ) then
      raise exception using errcode = '23514', message = format(
        'CORPORATE_ZONE_TABLE_CONFLICT|%s|%s', coalesce(v_zone, 'unknown'), v_claim.table_code
      );
    end if;
  end loop;

  return public.update_corporate_buyout_allocation_atomic(
    p_buyout_id,
    p_expected_revision,
    p_zone_allocations,
    p_actor_auth_user_id,
    p_actor_staff_profile_id,
    p_actor_name,
    p_actor_role,
    p_actor_location_scope,
    p_request_id,
    p_user_agent
  );
end;
$$;

create or replace function public.assign_full_show_buyout_zone_tables_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_zone_id text,
  p_table_ids uuid[],
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
  v_buyout public.corporate_buyouts%rowtype;
  v_combined_capacity integer := 0;
  v_current_ids uuid[] := '{}';
  v_primary_table_id uuid;
  v_requested_ids uuid[] := '{}';
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
  v_table_codes text[] := '{}';
  v_target_pax integer := 0;
  v_zone text;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (
       select 1 from public.role_permissions rp
       join public.permissions permission on permission.id = rp.permission_id
       where rp.role_id = role.id and permission.key = 'bookings:manage'
     )
     and exists (
       select 1 from public.role_permissions rp
       join public.permissions permission on permission.id = rp.permission_id
       where rp.role_id = role.id and permission.key = 'tables:manage'
     );
  if v_actor_name is null then raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED'; end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_requested_ids
    from (select distinct id from unnest(coalesce(p_table_ids, '{}'::uuid[])) id) requested;
  if cardinality(v_requested_ids) = 0
     or cardinality(v_requested_ids) <> cardinality(coalesce(p_table_ids, '{}'::uuid[])) then
    raise exception 'TABLE_ASSIGNMENT_SET_INVALID';
  end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;
  if v_booking.id is null then raise exception 'CORPORATE_BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_origin <> 'corporate'
     or v_booking.booking_source <> 'corporate-direct'
     or v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new','confirmed','pending_payment','checked_in') then
    raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED';
  end if;

  select * into v_buyout
    from public.corporate_buyouts
   where booking_id = v_booking.id
     and state in ('provisional','awaiting_payment','fully_paid','confirmed')
   for update;
  if v_buyout.id is null then raise exception 'BUYOUT_NOT_ACTIVE'; end if;

  select * into v_show from public.shows where id = v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or replace(lower(trim(coalesce(v_show.venue, ''))), ' ', '-') = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  v_zone := public.normalize_booking_capacity_zone(p_zone_id);
  select coalesce(max((item ->> 'pax')::integer), 0)
    into v_target_pax
    from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
   where public.normalize_booking_capacity_zone(item ->> 'zoneId') = v_zone
   limit 1;
  if v_zone is null or v_target_pax <= 0 then raise exception 'BUYOUT_ZONE_ALLOCATION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text || ':' || v_zone, 0));
  perform 1
    from public.show_tables
   where show_id = v_booking.show_id
     and (
       id = any(v_requested_ids)
       or (booking_id = v_booking.id and public.normalize_booking_capacity_zone(section) = v_zone)
     )
   order by id
   for update;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_current_ids
    from public.show_tables
   where booking_id = v_booking.id
     and public.normalize_booking_capacity_zone(section) = v_zone;

  if v_current_ids = v_requested_ids then
    return jsonb_build_object(
      'booking_reference', v_booking.booking_reference,
      'idempotent', true,
      'table_ids', v_requested_ids,
      'zone_id', v_zone
    );
  end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'FLOOR_PLAN_STALE'; end if;

  for v_table in
    select * from public.show_tables where id = any(v_requested_ids) order by table_code, id
  loop
    if v_table.show_id <> v_booking.show_id then raise exception 'CROSS_SHOW_TABLE_ASSIGNMENT'; end if;
    if public.normalize_booking_capacity_zone(v_table.section) <> v_zone then raise exception 'CROSS_ZONE_TABLE_ASSIGNMENT'; end if;
    if not v_table.capacity_configured or coalesce(v_table.capacity, 0) <= 0 then raise exception 'TABLE_CAPACITY_REQUIRED'; end if;
    if v_table.merged_parent_id is not null then raise exception 'MERGED_CHILD_NOT_ASSIGNABLE'; end if;
    if v_table.booking_id is not null and v_table.booking_id <> v_booking.id then raise exception 'TABLE_ALREADY_CLAIMED'; end if;
    if v_table.booking_id is null and v_table.status::text <> 'available' then raise exception 'TABLE_NOT_AVAILABLE'; end if;

    if v_table.is_physical then
      if cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) <> 0 then raise exception 'TABLE_NOT_ASSIGNABLE'; end if;
    elsif cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) > 0 then
      if not v_table.is_override or v_table.availability_scope <> 'operational'
         or (select count(*) from public.show_tables child where child.id = any(v_table.merged_from)) <> cardinality(v_table.merged_from)
         or exists (
           select 1 from public.show_tables child
            where child.id = any(v_table.merged_from)
              and not (
                child.is_physical and child.capacity_configured
                and child.status::text = 'disabled' and child.booking_id is null
                and child.merged_parent_id = v_table.id
                and public.normalize_booking_capacity_zone(child.section) = v_zone
              )
         ) then raise exception 'MERGED_PARENT_INVALID'; end if;
    elsif not (v_table.is_override and v_table.availability_scope = 'operational') then
      raise exception 'TABLE_NOT_ASSIGNABLE';
    end if;

    v_combined_capacity := v_combined_capacity + v_table.capacity;
    v_table_codes := array_append(v_table_codes, v_table.table_code);
  end loop;
  if v_combined_capacity < v_target_pax then
    raise exception using errcode = '23514', message = format(
      'BUYOUT_ZONE_TABLE_CAPACITY_INSUFFICIENT|%s|%s|%s', v_zone, v_target_pax, v_combined_capacity
    );
  end if;

  update public.show_tables
     set booking_id = null,
         status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
         updated_at = clock_timestamp()
   where booking_id = v_booking.id
     and public.normalize_booking_capacity_zone(section) = v_zone
     and not (id = any(v_requested_ids));

  update public.show_tables
     set booking_id = v_booking.id,
         status = 'booked',
         updated_at = clock_timestamp()
   where id = any(v_requested_ids);

  v_primary_table_id := case
    when exists (
      select 1 from public.show_tables
       where id = v_booking.table_id and booking_id = v_booking.id
    ) then v_booking.table_id
    else v_requested_ids[1]
  end;
  update public.bookings
     set table_id = v_primary_table_id,
         updated_at = clock_timestamp()
   where id = v_booking.id;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'corporate.buyout.zone-tables-assigned', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'zone_id', v_zone, 'zone_pax', v_target_pax, 'table_ids', v_requested_ids,
      'table_codes', v_table_codes, 'combined_capacity', v_combined_capacity,
      'unused_seats', v_combined_capacity - v_target_pax
    ),
    jsonb_build_object('zone_id', v_zone, 'table_ids', v_current_ids),
    array['table_id','show_tables'], v_booking.id::text, v_booking.booking_reference,
    'booking', 'success', 'Full Show Buyout tables assigned manually for one seating zone.',
    'Operations Floor'
  );

  return jsonb_build_object(
    'booking_reference', v_booking.booking_reference,
    'combined_capacity', v_combined_capacity,
    'idempotent', false,
    'table_codes', v_table_codes,
    'table_ids', v_requested_ids,
    'unused_seats', v_combined_capacity - v_target_pax,
    'zone_id', v_zone,
    'zone_pax', v_target_pax
  );
end;
$$;

revoke all on function public.update_full_show_buyout_seating_allocation_atomic(
  uuid,integer,jsonb,uuid,uuid,text,text,text[],text,text
) from public, anon, authenticated;
grant execute on function public.update_full_show_buyout_seating_allocation_atomic(
  uuid,integer,jsonb,uuid,uuid,text,text,text[],text,text
) to service_role;

revoke all on function public.assign_full_show_buyout_zone_tables_atomic(
  text,timestamptz,text,uuid[],uuid,uuid
) from public, anon, authenticated;
grant execute on function public.assign_full_show_buyout_zone_tables_atomic(
  text,timestamptz,text,uuid[],uuid,uuid
) to service_role;

comment on function public.update_full_show_buyout_seating_allocation_atomic(
  uuid,integer,jsonb,uuid,uuid,text,text,text[],text,text
) is 'Updates one active Full Show Buyout section plan while preserving compatible existing table claims.';

comment on function public.assign_full_show_buyout_zone_tables_atomic(
  text,timestamptz,text,uuid[],uuid,uuid
) is 'Atomically replaces one Full Show Buyout zone table set without changing guest, booking, or financial values.';
