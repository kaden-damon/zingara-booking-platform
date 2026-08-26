-- Phase 37.5: atomic physical-table reallocation and flat multi-table merges.

create or replace function public.map_booking_physical_table_atomic(
  p_booking_id uuid,
  p_expected_previous_table_id uuid,
  p_target_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_previous_table public.show_tables%rowtype;
  v_target_table public.show_tables%rowtype;
  v_previous_is_legacy boolean;
begin
  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.table_id is distinct from p_expected_previous_table_id then
    raise exception 'BOOKING_TABLE_ASSIGNMENT_CHANGED';
  end if;

  if v_booking.table_id is null then
    raise exception 'SOURCE_TABLE_ASSIGNMENT_REQUIRED';
  end if;

  -- Lock both table rows in deterministic order before validating either one.
  perform 1
    from public.show_tables st
   where st.id = any(array[v_booking.table_id, p_target_table_id])
   order by st.id
   for update;

  select *
    into v_previous_table
    from public.show_tables
   where id = v_booking.table_id;

  select *
    into v_target_table
    from public.show_tables
   where id = p_target_table_id;

  v_previous_is_legacy :=
    v_previous_table.id is not null
    and not v_previous_table.is_physical
    and (
      (public.normalize_booking_capacity_zone(v_previous_table.section) = 'golden-circle' and v_previous_table.table_code ~* '^GC[0-9]+$')
      or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'middle-ring' and v_previous_table.table_code ~* '^MR[0-9]+$')
      or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-booths' and v_previous_table.table_code ~* '^B[0-9]+$')
      or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-balcony' and v_previous_table.table_code ~* '^RB[0-9]+$')
    );

  if v_previous_table.id is null
     or v_previous_table.show_id <> v_booking.show_id
     or v_previous_table.merged_parent_id is not null
     or not (v_previous_table.is_physical or v_previous_is_legacy)
     or (
       v_previous_table.is_physical
       and v_previous_table.booking_id is distinct from v_booking.id
     ) then
    raise exception 'SOURCE_TABLE_NOT_REALLOCATABLE';
  end if;

  if v_target_table.id is null
     or v_target_table.show_id <> v_booking.show_id
     or public.normalize_booking_capacity_zone(v_target_table.section) <> public.normalize_booking_capacity_zone(v_booking.section)
     or not v_target_table.is_physical
     or not v_target_table.capacity_configured
     or v_target_table.capacity is null
     or v_target_table.capacity < v_booking.guest_count
     or v_target_table.merged_parent_id is not null
     or v_target_table.status::text = 'disabled'
     or (
       v_target_table.id <> v_booking.table_id
       and (
         v_target_table.status::text <> 'available'
         or v_target_table.booking_id is not null
       )
     )
     or (
       v_target_table.id = v_booking.table_id
       and v_target_table.booking_id is distinct from v_booking.id
     ) then
    raise exception 'PHYSICAL_TABLE_NOT_AVAILABLE';
  end if;

  if v_booking.table_id = v_target_table.id then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'previous_table_id', v_booking.table_id,
      'previous_table_code', v_target_table.table_code,
      'target_table_id', v_target_table.id,
      'target_table_code', v_target_table.table_code
    );
  end if;

  update public.show_tables
     set booking_id = v_booking.id,
         status = 'booked',
         updated_at = now()
   where id = v_target_table.id;

  update public.bookings
     set table_id = v_target_table.id,
         updated_at = now()
   where id = v_booking.id;

  update public.show_tables
     set booking_id = null,
         status = case
           when capacity_configured then 'available'::public.table_status
           else 'disabled'::public.table_status
         end,
         updated_at = now()
   where id = v_previous_table.id
     and id <> v_target_table.id
     and (booking_id = v_booking.id or booking_id is null);

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'previous_table_id', v_previous_table.id,
    'previous_table_code', v_previous_table.table_code,
    'target_table_id', v_target_table.id,
    'target_table_code', v_target_table.table_code
  );
end
$$;

revoke all on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) from public;
revoke all on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) from anon;
revoke all on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) to service_role;

create or replace function public.merge_show_tables_atomic(
  p_show_id uuid,
  p_zone_id text,
  p_source_table_ids uuid[],
  p_existing_merged_table_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all_member_ids uuid[];
  v_existing_member_ids uuid[] := '{}';
  v_merged_capacity integer;
  v_merged_code text;
  v_merged_table public.show_tables%rowtype;
  v_source_count integer;
  v_zone text;
begin
  v_zone := public.normalize_booking_capacity_zone(p_zone_id);

  select coalesce(array_agg(distinct source_id), '{}'::uuid[])
    into p_source_table_ids
    from unnest(coalesce(p_source_table_ids, '{}'::uuid[])) source_id;

  if v_zone is null or cardinality(p_source_table_ids) = 0 then
    raise exception 'MERGE_SOURCE_TABLES_REQUIRED';
  end if;

  if p_existing_merged_table_id is not null then
    select *
      into v_merged_table
      from public.show_tables
     where id = p_existing_merged_table_id
     for update;

    if v_merged_table.id is null
       or v_merged_table.show_id <> p_show_id
       or public.normalize_booking_capacity_zone(v_merged_table.section) <> v_zone
       or v_merged_table.is_physical
       or not v_merged_table.is_override
       or v_merged_table.merged_parent_id is not null
       or cardinality(coalesce(v_merged_table.merged_from, '{}'::uuid[])) < 2
       or v_merged_table.status::text = 'disabled' then
      raise exception 'MERGED_TABLE_NOT_EXTENDABLE';
    end if;

    v_existing_member_ids := v_merged_table.merged_from;
  elsif cardinality(p_source_table_ids) < 2 then
    raise exception 'AT_LEAST_TWO_TABLES_REQUIRED';
  end if;

  if p_source_table_ids && v_existing_member_ids then
    raise exception 'TABLE_ALREADY_IN_MERGED_UNIT';
  end if;

  perform 1
    from public.show_tables st
   where st.id = any(p_source_table_ids)
   order by st.id
   for update;

  select count(*)::integer
    into v_source_count
    from public.show_tables st
    join public.venue_tables vt on vt.id = st.venue_table_id
   where st.id = any(p_source_table_ids)
     and st.show_id = p_show_id
     and public.normalize_booking_capacity_zone(st.section) = v_zone
     and st.is_physical
     and st.capacity_configured
     and st.capacity is not null
     and st.capacity > 0
     and st.status::text = 'available'
     and st.booking_id is null
     and st.merged_parent_id is null
     and vt.is_physical
     and vt.mergeable;

  if v_source_count <> cardinality(p_source_table_ids) then
    raise exception 'MERGE_SOURCE_TABLE_NOT_AVAILABLE';
  end if;

  select array_agg(distinct member_id)
    into v_all_member_ids
    from unnest(v_existing_member_ids || p_source_table_ids) member_id;

  select
    count(*)::integer,
    sum(st.capacity)::integer,
    string_agg(st.table_code, '+' order by
      case when st.table_code ~ '^[0-9]+$' then st.table_code::integer else 2147483647 end,
      st.table_code
    )
    into v_source_count, v_merged_capacity, v_merged_code
    from public.show_tables st
   where st.id = any(v_all_member_ids)
     and st.show_id = p_show_id
     and public.normalize_booking_capacity_zone(st.section) = v_zone
     and st.is_physical
     and st.capacity_configured
     and st.capacity is not null;

  if v_source_count <> cardinality(v_all_member_ids) then
    raise exception 'MERGED_MEMBER_STATE_INVALID';
  end if;

  if exists (
    select 1
      from public.show_tables st
     where st.show_id = p_show_id
       and lower(st.table_code) = lower(v_merged_code)
       and st.id is distinct from p_existing_merged_table_id
  ) then
    raise exception 'MERGED_TABLE_CODE_CONFLICT';
  end if;

  update public.show_tables
     set status = 'disabled',
         updated_at = now()
   where id = any(p_source_table_ids);

  if p_existing_merged_table_id is null then
    insert into public.show_tables (
      availability_scope,
      capacity,
      capacity_configured,
      is_override,
      is_physical,
      merged_from,
      override_notes,
      section,
      show_id,
      status,
      table_code
    ) values (
      'operational',
      v_merged_capacity,
      true,
      true,
      false,
      v_all_member_ids,
      format('Merged from %s in Operations Floor.', replace(v_merged_code, '+', ', ')),
      v_zone,
      p_show_id,
      'available',
      v_merged_code
    )
    returning * into v_merged_table;
  else
    update public.show_tables
       set capacity = v_merged_capacity,
           merged_from = v_all_member_ids,
           override_notes = format('Merged from %s in Operations Floor.', replace(v_merged_code, '+', ', ')),
           table_code = v_merged_code,
           updated_at = now()
     where id = p_existing_merged_table_id
     returning * into v_merged_table;
  end if;

  update public.show_tables
     set merged_parent_id = v_merged_table.id,
         status = 'disabled',
         updated_at = now()
   where id = any(p_source_table_ids);

  return jsonb_build_object(
    'capacity', v_merged_capacity,
    'member_table_ids', to_jsonb(v_all_member_ids),
    'merged_table_code', v_merged_code,
    'merged_table_id', v_merged_table.id
  );
end
$$;

revoke all on function public.merge_show_tables_atomic(uuid, text, uuid[], uuid) from public;
revoke all on function public.merge_show_tables_atomic(uuid, text, uuid[], uuid) from anon;
revoke all on function public.merge_show_tables_atomic(uuid, text, uuid[], uuid) from authenticated;
grant execute on function public.merge_show_tables_atomic(uuid, text, uuid[], uuid) to service_role;

create or replace function public.unmerge_show_tables_atomic(
  p_show_id uuid,
  p_merged_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_count integer;
  v_merged_table public.show_tables%rowtype;
begin
  select *
    into v_merged_table
    from public.show_tables
   where id = p_merged_table_id
   for update;

  if v_merged_table.id is null
     or v_merged_table.show_id <> p_show_id
     or v_merged_table.is_physical
     or cardinality(coalesce(v_merged_table.merged_from, '{}'::uuid[])) < 2 then
    raise exception 'MERGED_TABLE_NOT_FOUND';
  end if;

  if v_merged_table.booking_id is not null
     or exists (
       select 1
         from public.bookings b
        where b.table_id = v_merged_table.id
     ) then
    raise exception 'MERGED_TABLE_HAS_BOOKING';
  end if;

  perform 1
    from public.show_tables st
   where st.id = any(v_merged_table.merged_from)
   order by st.id
   for update;

  select count(*)::integer
    into v_member_count
    from public.show_tables st
   where st.id = any(v_merged_table.merged_from)
     and st.show_id = p_show_id
     and st.is_physical
     and st.merged_parent_id = v_merged_table.id;

  if v_member_count <> cardinality(v_merged_table.merged_from) then
    raise exception 'MERGED_MEMBER_STATE_INVALID';
  end if;

  delete from public.show_tables
   where id = v_merged_table.id;

  update public.show_tables
     set merged_parent_id = null,
         status = case
           when capacity_configured then 'available'::public.table_status
           else 'disabled'::public.table_status
         end,
         updated_at = now()
   where id = any(v_merged_table.merged_from);

  return jsonb_build_object(
    'member_table_ids', to_jsonb(v_merged_table.merged_from),
    'removed_merged_table_code', v_merged_table.table_code,
    'removed_merged_table_id', v_merged_table.id
  );
end
$$;

revoke all on function public.unmerge_show_tables_atomic(uuid, uuid) from public;
revoke all on function public.unmerge_show_tables_atomic(uuid, uuid) from anon;
revoke all on function public.unmerge_show_tables_atomic(uuid, uuid) from authenticated;
grant execute on function public.unmerge_show_tables_atomic(uuid, uuid) to service_role;
