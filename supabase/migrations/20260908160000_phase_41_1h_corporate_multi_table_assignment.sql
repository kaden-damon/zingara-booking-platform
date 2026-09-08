-- Phase 41.1H: use the existing show_tables.booking_id relationship as the
-- authoritative assignment set while retaining bookings.table_id as a
-- backward-compatible primary-table pointer.

create or replace function public.assign_corporate_booking_tables_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_table_ids uuid[],
  p_expected_table_state jsonb,
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
  v_claimed_ids uuid[];
  v_combined_capacity integer := 0;
  v_count integer := 0;
  v_existing_ids uuid[];
  v_requested_sorted_ids uuid[];
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
  v_table_codes text[] := '{}';
  v_target_zone text;
  v_zone_limit integer;
  v_zone_pax integer := 0;
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
     and permission.key = 'bookings:manage'
     and exists (
       select 1 from public.role_permissions rp
       join public.permissions permission2 on permission2.id = rp.permission_id
       where rp.role_id = role.id and permission2.key = 'tables:manage'
     );

  if v_actor_name is null then raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED'; end if;

  select array_agg(table_id order by ordinal), count(*)
    into v_claimed_ids, v_count
    from unnest(coalesce(p_table_ids, '{}'::uuid[])) with ordinality requested(table_id, ordinal);
  if v_count = 0 or v_count <> cardinality(array(select distinct id from unnest(v_claimed_ids) id)) then
    raise exception 'TABLE_ASSIGNMENT_SET_INVALID';
  end if;

  select * into v_booking from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '') for update;
  if v_booking.id is null then raise exception 'CORPORATE_BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_origin <> 'corporate' or v_booking.booking_source <> 'corporate-direct' then
    raise exception 'CORPORATE_BOOKING_REQUIRED';
  end if;
  if v_booking.archived_at is not null or v_booking.booking_status::text not in ('new','confirmed','pending_payment','checked_in') then
    raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if not ('all' = any(coalesce(v_actor_location_scope, '{}'::text[])) or lower(trim(coalesce(v_show.venue,''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  v_target_zone := public.normalize_booking_capacity_zone(v_booking.section);
  v_zone_limit := public.booking_capacity_zone_limit(v_target_zone);
  if v_target_zone is null or v_zone_limit is null then raise exception 'SUPPORTED_TARGET_ZONE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text || ':' || v_target_zone, 0));

  perform 1 from public.show_tables
   where show_id = v_booking.show_id and (id = any(v_claimed_ids) or booking_id = v_booking.id)
   order by id for update;

  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_existing_ids
    from public.show_tables where booking_id=v_booking.id;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_requested_sorted_ids
    from unnest(v_claimed_ids) id;
  if v_existing_ids = v_requested_sorted_ids and v_booking.table_id = v_claimed_ids[1] then
    return jsonb_build_object('idempotent',true,'booking_reference',v_booking.booking_reference,'table_ids',v_claimed_ids);
  end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'FLOOR_PLAN_STALE'; end if;

  for v_table in
    select * from public.show_tables where id = any(v_claimed_ids) order by array_position(v_claimed_ids, id)
  loop
    v_count := v_count - 1;
    if v_table.show_id <> v_booking.show_id then raise exception 'CROSS_SHOW_TABLE_ASSIGNMENT'; end if;
    if public.normalize_booking_capacity_zone(v_table.section) <> v_target_zone then raise exception 'CROSS_ZONE_TABLE_ASSIGNMENT'; end if;
    if not v_table.capacity_configured or v_table.capacity is null then raise exception 'TABLE_CAPACITY_REQUIRED'; end if;
    if v_table.merged_parent_id is not null then raise exception 'MERGED_CHILD_NOT_ASSIGNABLE'; end if;
    if v_table.booking_id is not null and v_table.booking_id <> v_booking.id then raise exception 'TABLE_ALREADY_CLAIMED'; end if;
    if v_table.booking_id is null and v_table.status::text <> 'available' then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_expected_table_state, '[]'::jsonb)) expected
       where (expected->>'id')::uuid = v_table.id
         and nullif(expected->>'booking_id','')::uuid is not distinct from v_table.booking_id
         and coalesce((expected->>'capacity')::integer,0) = v_table.capacity
         and coalesce((expected->>'capacity_configured')::boolean,false) = v_table.capacity_configured
         and coalesce(expected->>'status','') = v_table.status::text
         and (expected->>'updated_at')::timestamptz = v_table.updated_at
    ) then raise exception 'FLOOR_PLAN_STALE'; end if;

    if v_table.is_physical then
      if cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) <> 0 then raise exception 'TABLE_NOT_ASSIGNABLE'; end if;
    elsif cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) > 0 then
      if not v_table.is_override or v_table.availability_scope <> 'operational'
        or (select count(*) from public.show_tables child where child.id = any(v_table.merged_from)) <> cardinality(v_table.merged_from)
        or exists (
        select 1 from public.show_tables child
         where child.id = any(v_table.merged_from)
           and not (child.is_physical and child.capacity_configured and child.status::text = 'disabled' and child.booking_id is null and child.merged_parent_id = v_table.id and public.normalize_booking_capacity_zone(child.section) = v_target_zone)
      ) then raise exception 'MERGED_PARENT_INVALID'; end if;
    elsif not (v_table.is_override and v_table.availability_scope = 'operational') then
      raise exception 'TABLE_NOT_ASSIGNABLE';
    end if;

    v_combined_capacity := v_combined_capacity + v_table.capacity;
    v_table_codes := array_append(v_table_codes, v_table.table_code);
  end loop;
  if v_count <> 0 then raise exception 'TABLE_ASSIGNMENT_SET_INVALID'; end if;
  if v_combined_capacity < v_booking.guest_count then raise exception 'COMBINED_TABLE_CAPACITY_INSUFFICIENT'; end if;

  select coalesce(sum(greatest(coalesce(guest_count,0),0)),0)::integer into v_zone_pax
    from public.bookings where show_id=v_booking.show_id and archived_at is null
     and booking_status::text in ('new','confirmed','pending_payment','checked_in')
     and public.normalize_booking_capacity_zone(section)=v_target_zone;
  if v_zone_pax > v_zone_limit then raise exception 'ZONE_CAPACITY_INSUFFICIENT'; end if;

  update public.show_tables set booking_id=null, status='available', updated_at=clock_timestamp()
   where booking_id=v_booking.id and not (id=any(v_claimed_ids));
  update public.show_tables set booking_id=v_booking.id, status='booked', updated_at=clock_timestamp()
   where id=any(v_claimed_ids);
  update public.bookings set table_id=v_claimed_ids[1], updated_at=clock_timestamp() where id=v_booking.id;

  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_reference,entity_type,outcome,reason,source_area)
  values('booking.corporate-multi-table-assigned',p_actor_auth_user_id,v_actor_location_scope,v_actor_name,v_actor_role,p_actor_staff_profile_id,
    jsonb_build_object('table_ids',v_claimed_ids,'table_codes',v_table_codes,'combined_capacity',v_combined_capacity,'unused_seats',v_combined_capacity-v_booking.guest_count,'pax',v_booking.guest_count,'zone',v_target_zone),
    jsonb_build_object('table_ids',v_existing_ids,'primary_table_id',v_booking.table_id),array['table_id','show_tables'],v_booking.id::text,v_booking.booking_reference,'booking','success','Corporate operational table assignment approved.','Operations Floor');

  return jsonb_build_object('idempotent',false,'booking_reference',v_booking.booking_reference,'table_ids',v_claimed_ids,'table_codes',v_table_codes,'combined_capacity',v_combined_capacity,'unused_seats',v_combined_capacity-v_booking.guest_count);
end;
$$;

create or replace function public.release_corporate_booking_tables_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_expected_table_ids uuid[],
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_actor_location_scope text[]; v_actor_name text; v_actor_role text;
  v_booking public.bookings%rowtype; v_existing_ids uuid[]; v_released integer;
  v_show public.shows%rowtype;
begin
  select staff.venue_scope,staff.full_name,role.name into v_actor_location_scope,v_actor_name,v_actor_role
    from public.staff_profiles staff join public.roles role on role.id=staff.role_id
    join public.role_permissions rp on rp.role_id=role.id join public.permissions permission on permission.id=rp.permission_id
   where staff.id=p_actor_staff_profile_id and staff.user_id=p_actor_auth_user_id and staff.active and permission.key='bookings:manage'
     and exists(select 1 from public.role_permissions rp2 join public.permissions p2 on p2.id=rp2.permission_id where rp2.role_id=role.id and p2.key='tables:manage');
  if v_actor_name is null then raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED'; end if;
  select * into v_booking from public.bookings where booking_reference=nullif(trim(p_booking_reference),'') for update;
  if v_booking.id is null then raise exception 'CORPORATE_BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_origin<>'corporate' or v_booking.booking_source<>'corporate-direct' then raise exception 'CORPORATE_BOOKING_REQUIRED'; end if;
  if v_booking.archived_at is not null or v_booking.booking_status::text not in ('new','confirmed','pending_payment','checked_in') then raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED'; end if;
  select * into v_show from public.shows where id=v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if not ('all'=any(coalesce(v_actor_location_scope,'{}'::text[])) or lower(trim(coalesce(v_show.venue,'')))=any(coalesce(v_actor_location_scope,'{}'::text[]))) then raise exception 'SHOW_OUTSIDE_STAFF_SCOPE'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'FLOOR_PLAN_STALE'; end if;
  perform 1 from public.show_tables where booking_id=v_booking.id order by id for update;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_existing_ids from public.show_tables where booking_id=v_booking.id;
  if v_existing_ids is distinct from array(select id from unnest(coalesce(p_expected_table_ids,'{}'::uuid[])) id order by id) then raise exception 'FLOOR_PLAN_STALE'; end if;
  if cardinality(v_existing_ids)=0 and v_booking.table_id is null then return jsonb_build_object('idempotent',true,'released',0); end if;
  update public.show_tables set booking_id=null,status=case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,updated_at=clock_timestamp() where booking_id=v_booking.id;
  get diagnostics v_released=row_count;
  update public.bookings set table_id=null,updated_at=clock_timestamp() where id=v_booking.id;
  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_reference,entity_type,outcome,reason,source_area)
  values('booking.corporate-table-assignment-released',p_actor_auth_user_id,v_actor_location_scope,v_actor_name,v_actor_role,p_actor_staff_profile_id,jsonb_build_object('table_ids','[]'::jsonb,'floor_assignment_required',true),jsonb_build_object('table_ids',v_existing_ids,'primary_table_id',v_booking.table_id),array['table_id','show_tables'],v_booking.id::text,v_booking.booking_reference,'booking','success','Corporate operational table assignment released.','Booking Details');
  return jsonb_build_object('idempotent',false,'released',v_released,'table_ids',v_existing_ids);
end;
$$;

revoke all on function public.assign_corporate_booking_tables_atomic(text,timestamptz,uuid[],jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_corporate_booking_tables_atomic(text,timestamptz,uuid[],jsonb,uuid,uuid) to service_role;
revoke all on function public.release_corporate_booking_tables_atomic(text,timestamptz,uuid[],uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_corporate_booking_tables_atomic(text,timestamptz,uuid[],uuid,uuid) to service_role;
