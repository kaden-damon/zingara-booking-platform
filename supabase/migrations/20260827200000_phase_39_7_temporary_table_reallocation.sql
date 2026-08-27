-- Phase 39.7: allow the existing atomic table reallocation path to target
-- authoritative flat temporary operational tables as well as physical and
-- merged operational tables.

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
  v_member_capacity integer;
  v_member_count integer;
  v_previous_is_legacy boolean;
  v_previous_is_merged boolean;
  v_previous_is_temporary boolean;
  v_previous_table public.show_tables%rowtype;
  v_target_is_merged boolean;
  v_target_is_temporary boolean;
  v_target_table public.show_tables%rowtype;
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

  v_previous_is_temporary :=
    v_previous_table.id is not null
    and not v_previous_table.is_physical
    and v_previous_table.is_override
    and v_previous_table.availability_scope::text = 'operational'
    and v_previous_table.merged_parent_id is null
    and cardinality(coalesce(v_previous_table.merged_from, '{}'::uuid[])) = 0;
  v_previous_is_legacy :=
    v_previous_table.id is not null
    and not v_previous_table.is_physical
    and not v_previous_is_temporary
    and (
      (public.normalize_booking_capacity_zone(v_previous_table.section) = 'golden-circle' and v_previous_table.table_code ~* '^GC[0-9]+$')
      or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'middle-ring' and v_previous_table.table_code ~* '^MR[0-9]+$')
      or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-booths' and v_previous_table.table_code ~* '^B[0-9]+$')
      or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-balcony' and v_previous_table.table_code ~* '^RB[0-9]+$')
    );
  v_previous_is_merged :=
    v_previous_table.id is not null
    and not v_previous_table.is_physical
    and v_previous_table.is_override
    and v_previous_table.availability_scope::text = 'operational'
    and v_previous_table.merged_parent_id is null
    and cardinality(coalesce(v_previous_table.merged_from, '{}'::uuid[])) >= 2;
  v_target_is_temporary :=
    v_target_table.id is not null
    and not v_target_table.is_physical
    and v_target_table.is_override
    and v_target_table.availability_scope::text = 'operational'
    and v_target_table.merged_parent_id is null
    and cardinality(coalesce(v_target_table.merged_from, '{}'::uuid[])) = 0;
  v_target_is_merged :=
    v_target_table.id is not null
    and not v_target_table.is_physical
    and v_target_table.is_override
    and v_target_table.availability_scope::text = 'operational'
    and v_target_table.merged_parent_id is null
    and cardinality(coalesce(v_target_table.merged_from, '{}'::uuid[])) >= 2;

  perform 1
    from public.show_tables st
   where st.id = any(
     coalesce(v_previous_table.merged_from, '{}'::uuid[])
     || coalesce(v_target_table.merged_from, '{}'::uuid[])
   )
   order by st.id
   for update;

  if v_previous_is_merged then
    select count(*)::integer, coalesce(sum(st.capacity), 0)::integer
      into v_member_count, v_member_capacity
      from public.show_tables st
     where st.id = any(v_previous_table.merged_from)
       and st.show_id = v_previous_table.show_id
       and public.normalize_booking_capacity_zone(st.section) = public.normalize_booking_capacity_zone(v_previous_table.section)
       and st.is_physical
       and st.capacity_configured
       and st.capacity is not null
       and st.booking_id is null
       and st.status::text = 'disabled'
       and st.merged_parent_id = v_previous_table.id
       and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0;

    if v_member_count <> cardinality(v_previous_table.merged_from)
       or v_member_capacity <> v_previous_table.capacity then
      raise exception 'SOURCE_MERGED_MEMBER_STATE_INVALID';
    end if;
  end if;

  if v_previous_table.id is null
     or v_previous_table.show_id <> v_booking.show_id
     or v_previous_table.merged_parent_id is not null
     or not (
       v_previous_table.is_physical
       or v_previous_is_legacy
       or v_previous_is_merged
       or v_previous_is_temporary
     )
     or (
       (v_previous_table.is_physical or v_previous_is_merged or v_previous_is_temporary)
       and v_previous_table.booking_id is distinct from v_booking.id
     ) then
    raise exception 'SOURCE_TABLE_NOT_REALLOCATABLE';
  end if;

  if v_target_is_merged then
    select count(*)::integer, coalesce(sum(st.capacity), 0)::integer
      into v_member_count, v_member_capacity
      from public.show_tables st
     where st.id = any(v_target_table.merged_from)
       and st.show_id = v_target_table.show_id
       and public.normalize_booking_capacity_zone(st.section) = public.normalize_booking_capacity_zone(v_target_table.section)
       and st.is_physical
       and st.capacity_configured
       and st.capacity is not null
       and st.booking_id is null
       and st.status::text = 'disabled'
       and st.merged_parent_id = v_target_table.id
       and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0;

    if v_member_count <> cardinality(v_target_table.merged_from)
       or v_member_capacity <> v_target_table.capacity then
      raise exception 'TARGET_MERGED_MEMBER_STATE_INVALID';
    end if;
  end if;

  if v_target_table.id is null
     or v_target_table.show_id <> v_booking.show_id
     or public.normalize_booking_capacity_zone(v_target_table.section) <> public.normalize_booking_capacity_zone(v_booking.section)
     or not (
       (
         v_target_table.is_physical
         and cardinality(coalesce(v_target_table.merged_from, '{}'::uuid[])) = 0
       )
       or v_target_is_merged
       or v_target_is_temporary
     )
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
    raise exception 'TABLE_NOT_AVAILABLE';
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
