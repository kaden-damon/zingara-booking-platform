-- Phase 41.1P: one Corporate booking may own multiple show-zone pax entitlements.
alter table public.bookings
  add column if not exists zone_entitlements jsonb;

create or replace function public.corporate_zone_entitlements_valid(
  p_entitlements jsonb,
  p_guest_count integer
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_entitlements is null or (
    jsonb_typeof(p_entitlements) = 'array'
    and jsonb_array_length(p_entitlements) > 0
    and not exists (
      select 1
      from jsonb_array_elements(p_entitlements) item
      where jsonb_typeof(item) <> 'object'
        or public.normalize_booking_capacity_zone(item ->> 'zoneId') is null
        or coalesce((item ->> 'pax')::integer, 0) <= 0
    )
    and (
      select count(*) = count(distinct public.normalize_booking_capacity_zone(item ->> 'zoneId'))
      from jsonb_array_elements(p_entitlements) item
    )
    and (
      select coalesce(sum((item ->> 'pax')::integer), 0) = p_guest_count
      from jsonb_array_elements(p_entitlements) item
    )
  );
$$;

alter table public.bookings
  drop constraint if exists bookings_zone_entitlements_valid;
alter table public.bookings
  add constraint bookings_zone_entitlements_valid
  check (
    public.corporate_zone_entitlements_valid(zone_entitlements, guest_count)
    and (zone_entitlements is null or (booking_source = 'corporate-direct' and booking_origin = 'corporate'))
  );

create or replace function public.booking_zone_entitlement_pax(
  p_entitlements jsonb,
  p_section text,
  p_guest_count integer,
  p_zone text
)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_entitlements is null then
      case when public.normalize_booking_capacity_zone(p_section) = public.normalize_booking_capacity_zone(p_zone)
        then greatest(coalesce(p_guest_count, 0), 0) else 0 end
    else coalesce((
      select sum(greatest((item ->> 'pax')::integer, 0))::integer
      from jsonb_array_elements(p_entitlements) item
      where public.normalize_booking_capacity_zone(item ->> 'zoneId') = public.normalize_booking_capacity_zone(p_zone)
    ), 0)
  end;
$$;

create or replace function public.enforce_booking_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_entitlement integer;
  v_import_exception boolean := false;
  v_import_update_exception boolean := false;
  v_limit integer;
  v_new_contribution integer;
  v_zone text;
begin
  if new.archived_at is not null
     or new.booking_status::text not in ('new', 'confirmed', 'pending_payment', 'checked_in') then
    return new;
  end if;

  v_import_exception :=
    tg_op = 'INSERT'
    and current_setting('zingara.historical_dineplan_import', true) = 'active'
    and new.booking_origin = 'data_import'
    and new.booking_source = 'admin'
    and new.table_id is null
    and new.notes like '__zingara_booking_meta__:%';
  v_import_update_exception :=
    tg_op = 'UPDATE'
    and current_setting('zingara.historical_dineplan_update', true) = 'active'
    and current_setting('zingara.historical_dineplan_update_booking_id', true) = new.id::text
    and old.id = new.id
    and old.booking_reference = new.booking_reference
    and old.booking_origin = 'data_import'
    and new.booking_origin = old.booking_origin
    and old.booking_source in ('admin', 'corporate-direct')
    and new.booking_source = old.booking_source
    and old.created_by_staff_id is not distinct from new.created_by_staff_id
    and old.provenance_recorded_at is not distinct from new.provenance_recorded_at
    and old.booking_status = new.booking_status
    and old.archived_at is not distinct from new.archived_at
    and new.notes like '__zingara_booking_meta__:%';
  if v_import_exception or v_import_update_exception then return new; end if;

  if not public.corporate_zone_entitlements_valid(new.zone_entitlements, new.guest_count) then
    raise exception using errcode = '23514', message = 'CORPORATE_ZONE_ENTITLEMENTS_INVALID';
  end if;

  for v_zone in
    select distinct public.normalize_booking_capacity_zone(zone_name)
    from (
      select item ->> 'zoneId' as zone_name
      from jsonb_array_elements(coalesce(new.zone_entitlements, '[]'::jsonb)) item
      union all
      select new.section where new.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_name) is not null
    order by 1
  loop
    v_limit := public.booking_capacity_zone_limit(v_zone);
    if v_limit is null then continue; end if;
    v_new_contribution := public.booking_zone_entitlement_pax(
      new.zone_entitlements, new.section, new.guest_count, v_zone
    );
    perform pg_advisory_xact_lock(hashtextextended(new.show_id::text || ':' || v_zone, 0));
    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_zone
    )), 0)::integer
      into v_existing_entitlement
      from public.bookings b
     where b.show_id = new.show_id
       and b.archived_at is null
       and b.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
       and (tg_op = 'INSERT' or b.id <> new.id);
    if v_existing_entitlement + v_new_contribution > v_limit then
      raise exception using errcode = '23514', message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_zone, v_limit, v_existing_entitlement + v_new_contribution
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists bookings_zone_capacity_guard on public.bookings;
create trigger bookings_zone_capacity_guard
  before insert or update of show_id, section, zone_entitlements, guest_count, booking_status, archived_at
  on public.bookings
  for each row execute function public.enforce_booking_zone_capacity();

create or replace function public.reserve_corporate_multi_zone_entitlement(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_zone_entitlements jsonb
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
  if p_booking_payload ->> 'booking_source' <> 'corporate-direct'
     or nullif(p_booking_payload ->> 'corporate_request_id', '') is null
     or nullif(p_booking_payload ->> 'created_by_staff_id', '') is null
     or not public.corporate_zone_entitlements_valid(p_zone_entitlements, v_total) then
    raise exception 'CORPORATE_MULTI_ZONE_CONTEXT_INVALID';
  end if;
  select staff.* into v_actor from public.staff_profiles staff
   where staff.id = (p_booking_payload ->> 'created_by_staff_id')::uuid
     and staff.active
     and exists (
       select 1 from public.role_permissions rp
       join public.permissions permission on permission.id=rp.permission_id
       where rp.role_id=staff.role_id and permission.key='bookings:manage'
     );
  if v_actor.id is null then raise exception 'CORPORATE_MULTI_ZONE_PERMISSION_REQUIRED'; end if;

  v_primary := p_zone_entitlements -> 0;
  select public.reserve_public_booking_entitlement(
    p_show_id,
    p_booking_payload || jsonb_build_object(
      'guest_count', (v_primary ->> 'pax')::integer,
      'section', v_primary ->> 'zoneId'
    ),
    p_payment_payload
  ) into v_result;

  select * into v_booking from public.bookings
   where id = (v_result ->> 'booking_id')::uuid for update;
  if v_result ->> 'status' = 'already_exists' then
    if v_booking.guest_count <> v_total
       or v_booking.zone_entitlements is distinct from p_zone_entitlements then
      raise exception 'CORPORATE_MULTI_ZONE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_result;
  end if;

  update public.bookings
     set guest_count = v_total,
         section = v_primary ->> 'zoneId',
         zone_entitlements = p_zone_entitlements,
         updated_at = clock_timestamp()
   where id = v_booking.id;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  )
  select 'booking.corporate-multi-zone-entitlement-created', staff.user_id,
    coalesce(staff.venue_scope, '{}'::text[]), staff.full_name, role.name,
    staff.id, jsonb_build_object('zone_entitlements', p_zone_entitlements, 'pax', v_total),
    '{}'::jsonb, array['zone_entitlements','guest_count'], v_booking.id::text,
    v_booking.booking_reference, 'booking', 'success',
    'Reviewed Corporate seating entitlement created.', 'Corporate Conversion'
  from public.staff_profiles staff join public.roles role on role.id = staff.role_id
  where staff.id = v_actor.id;

  return v_result || jsonb_build_object('zone_entitlements', p_zone_entitlements);
end;
$$;

revoke all on function public.reserve_corporate_multi_zone_entitlement(uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_corporate_multi_zone_entitlement(uuid,jsonb,jsonb,jsonb)
  to service_role;

create or replace function public.assign_corporate_booking_zone_tables_atomic(
  p_booking_reference text,
  p_zone text,
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
  v_combined_capacity integer := 0;
  v_count integer;
  v_entitlement_pax integer;
  v_existing_zone_ids uuid[];
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
  v_table_codes text[] := '{}';
  v_target_zone text;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (select 1 from public.role_permissions rp join public.permissions permission on permission.id=rp.permission_id where rp.role_id=role.id and permission.key='bookings:manage')
     and exists (select 1 from public.role_permissions rp join public.permissions permission on permission.id=rp.permission_id where rp.role_id=role.id and permission.key='tables:manage');
  if v_actor_name is null then raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED'; end if;

  v_target_zone := public.normalize_booking_capacity_zone(p_zone);
  if v_target_zone is null then raise exception 'SUPPORTED_TARGET_ZONE_REQUIRED'; end if;
  if cardinality(coalesce(p_table_ids, '{}'::uuid[])) = 0
     or cardinality(p_table_ids) <> (select count(distinct id) from unnest(p_table_ids) id) then
    raise exception 'TABLE_ASSIGNMENT_SET_INVALID';
  end if;

  select * into v_booking from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '') for update;
  if v_booking.id is null then raise exception 'CORPORATE_BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_origin not in ('corporate','data_import')
     or v_booking.booking_source <> 'corporate-direct' then raise exception 'CORPORATE_BOOKING_REQUIRED'; end if;
  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new','confirmed','pending_payment','checked_in') then
    raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED';
  end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'FLOOR_PLAN_STALE'; end if;

  v_entitlement_pax := public.booking_zone_entitlement_pax(
    v_booking.zone_entitlements, v_booking.section, v_booking.guest_count, v_target_zone
  );
  if v_entitlement_pax <= 0 then raise exception 'BOOKING_ZONE_ENTITLEMENT_REQUIRED'; end if;
  select * into v_show from public.shows where id=v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if not ('all'=any(coalesce(v_actor_location_scope,'{}'::text[])) or lower(trim(coalesce(v_show.venue,'')))=any(coalesce(v_actor_location_scope,'{}'::text[]))) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text || ':' || v_target_zone, 0));
  perform 1 from public.show_tables
   where show_id=v_booking.show_id and (id=any(p_table_ids) or booking_id=v_booking.id)
   order by id for update;

  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_existing_zone_ids
    from public.show_tables
   where booking_id=v_booking.id and public.normalize_booking_capacity_zone(section)=v_target_zone;
  if v_existing_zone_ids = array(select id from unnest(p_table_ids) id order by id) then
    return jsonb_build_object('idempotent',true,'booking_reference',v_booking.booking_reference,'table_ids',p_table_ids,'zone',v_target_zone);
  end if;

  v_count := cardinality(p_table_ids);
  for v_table in select * from public.show_tables where id=any(p_table_ids) order by array_position(p_table_ids,id)
  loop
    v_count := v_count - 1;
    if v_table.show_id <> v_booking.show_id then raise exception 'CROSS_SHOW_TABLE_ASSIGNMENT'; end if;
    if public.normalize_booking_capacity_zone(v_table.section) <> v_target_zone then raise exception 'CROSS_ZONE_TABLE_ASSIGNMENT'; end if;
    if not v_table.capacity_configured or v_table.capacity is null then raise exception 'TABLE_CAPACITY_REQUIRED'; end if;
    if v_table.merged_parent_id is not null then raise exception 'MERGED_CHILD_NOT_ASSIGNABLE'; end if;
    if v_table.booking_id is not null and v_table.booking_id <> v_booking.id then raise exception 'TABLE_ALREADY_CLAIMED'; end if;
    if v_table.booking_id is null and v_table.status::text <> 'available' then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(p_expected_table_state,'[]'::jsonb)) expected
       where (expected->>'id')::uuid=v_table.id
         and nullif(expected->>'booking_id','')::uuid is not distinct from v_table.booking_id
         and coalesce((expected->>'capacity')::integer,0)=v_table.capacity
         and coalesce((expected->>'capacity_configured')::boolean,false)=v_table.capacity_configured
         and coalesce(expected->>'status','')=v_table.status::text
         and (expected->>'updated_at')::timestamptz=v_table.updated_at
    ) then raise exception 'FLOOR_PLAN_STALE'; end if;
    if v_table.is_physical then
      if cardinality(coalesce(v_table.merged_from,'{}'::uuid[]))<>0 then raise exception 'TABLE_NOT_ASSIGNABLE'; end if;
    elsif cardinality(coalesce(v_table.merged_from,'{}'::uuid[]))>0 then
      if not v_table.is_override or v_table.availability_scope<>'operational' then raise exception 'MERGED_PARENT_INVALID'; end if;
    elsif not (v_table.is_override and v_table.availability_scope='operational') then
      raise exception 'TABLE_NOT_ASSIGNABLE';
    end if;
    v_combined_capacity := v_combined_capacity + v_table.capacity;
    v_table_codes := array_append(v_table_codes,v_table.table_code);
  end loop;
  if v_count<>0 then raise exception 'TABLE_ASSIGNMENT_SET_INVALID'; end if;
  if v_combined_capacity<v_entitlement_pax then raise exception 'COMBINED_TABLE_CAPACITY_INSUFFICIENT'; end if;

  update public.show_tables set booking_id=null,status='available',updated_at=clock_timestamp()
   where booking_id=v_booking.id
     and public.normalize_booking_capacity_zone(section)=v_target_zone
     and not (id=any(p_table_ids));
  update public.show_tables set booking_id=v_booking.id,status='booked',updated_at=clock_timestamp()
   where id=any(p_table_ids);
  update public.bookings set table_id=case
      when table_id is null or public.normalize_booking_capacity_zone(section)=v_target_zone then p_table_ids[1]
      else table_id end,
      updated_at=clock_timestamp()
   where id=v_booking.id;

  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_reference,entity_type,outcome,reason,source_area)
  values('booking.corporate-zone-tables-assigned',p_actor_auth_user_id,v_actor_location_scope,v_actor_name,v_actor_role,p_actor_staff_profile_id,
    jsonb_build_object('zone',v_target_zone,'zone_pax',v_entitlement_pax,'table_ids',p_table_ids,'table_codes',v_table_codes,'combined_capacity',v_combined_capacity),
    jsonb_build_object('zone',v_target_zone,'table_ids',v_existing_zone_ids),array['table_id','show_tables'],v_booking.id::text,v_booking.booking_reference,'booking','success','Corporate zone tables assigned.','Operations Floor');
  return jsonb_build_object('idempotent',false,'booking_reference',v_booking.booking_reference,'table_ids',p_table_ids,'table_codes',v_table_codes,'combined_capacity',v_combined_capacity,'zone',v_target_zone);
end;
$$;

revoke all on function public.assign_corporate_booking_zone_tables_atomic(text,text,timestamptz,uuid[],jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.assign_corporate_booking_zone_tables_atomic(text,text,timestamptz,uuid[],jsonb,uuid,uuid)
  to service_role;

comment on column public.bookings.zone_entitlements is
  'Authoritative Corporate show-zone pax split. Null preserves legacy single-zone semantics.';
