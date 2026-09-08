-- Phase 41.1H-A: release one Corporate table claim when the remaining
-- assignment still fits, otherwise fail safe by releasing the complete set.

create or replace function public.release_corporate_booking_table_atomic(
  p_booking_reference text,
  p_table_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_table_ids uuid[],
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
  v_after_capacity integer := 0;
  v_after_codes text[] := '{}';
  v_after_ids uuid[] := '{}';
  v_before_capacity integer := 0;
  v_before_codes text[] := '{}';
  v_booking public.bookings%rowtype;
  v_existing_ids uuid[] := '{}';
  v_new_primary_id uuid;
  v_release_mode text;
  v_released integer := 0;
  v_selected_table public.show_tables%rowtype;
  v_show public.shows%rowtype;
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
       select 1
         from public.role_permissions rp
         join public.permissions permission2 on permission2.id = rp.permission_id
        where rp.role_id = role.id
          and permission2.key = 'tables:manage'
     );

  if v_actor_name is null then
    raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;

  if v_booking.id is null then raise exception 'CORPORATE_BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_origin <> 'corporate' or v_booking.booking_source <> 'corporate-direct' then
    raise exception 'CORPORATE_BOOKING_REQUIRED';
  end if;
  if v_booking.archived_at is not null or v_booking.booking_status::text not in ('new','confirmed','pending_payment','checked_in') then
    raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_booking.show_id::text || ':corporate-floor-release', 0)
  );
  perform 1
    from public.show_tables
   where booking_id = v_booking.id or id = p_table_id
   order by id
   for update;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[]),
         coalesce(sum(capacity), 0)::integer,
         coalesce(array_agg(table_code order by table_code), '{}'::text[])
    into v_existing_ids, v_before_capacity, v_before_codes
    from public.show_tables
   where booking_id = v_booking.id;

  if v_existing_ids is distinct from array(
    select id
      from unnest(coalesce(p_expected_table_ids, '{}'::uuid[])) id
     order by id
  ) then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  select *
    into v_selected_table
    from public.show_tables
   where id = p_table_id
     and booking_id = v_booking.id;
  if v_selected_table.id is null then raise exception 'TABLE_CLAIM_NOT_FOUND'; end if;

  select coalesce(array_agg(id order by table_code, id), '{}'::uuid[]),
         coalesce(sum(capacity), 0)::integer,
         coalesce(array_agg(table_code order by table_code), '{}'::text[])
    into v_after_ids, v_after_capacity, v_after_codes
    from public.show_tables
   where booking_id = v_booking.id
     and id <> p_table_id;

  if cardinality(v_after_ids) > 0 and v_after_capacity >= v_booking.guest_count then
    v_release_mode := 'single';
    update public.show_tables
       set booking_id = null,
           status = case
             when capacity_configured then 'available'::public.table_status
             else 'disabled'::public.table_status
           end,
           updated_at = clock_timestamp()
     where id = p_table_id
       and booking_id = v_booking.id;
    get diagnostics v_released = row_count;

    v_new_primary_id := case
      when v_booking.table_id = p_table_id then v_after_ids[1]
      else v_booking.table_id
    end;
    update public.bookings
       set table_id = v_new_primary_id,
           updated_at = clock_timestamp()
     where id = v_booking.id;
  else
    v_release_mode := 'complete-fallback';
    update public.show_tables
       set booking_id = null,
           status = case
             when capacity_configured then 'available'::public.table_status
             else 'disabled'::public.table_status
           end,
           updated_at = clock_timestamp()
     where booking_id = v_booking.id;
    get diagnostics v_released = row_count;

    update public.bookings
       set table_id = null,
           updated_at = clock_timestamp()
     where id = v_booking.id;
    v_after_ids := '{}';
    v_after_codes := '{}';
    v_after_capacity := 0;
  end if;

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
    'booking.corporate-table-released',
    p_actor_auth_user_id,
    v_actor_location_scope,
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'table_ids', v_after_ids,
      'table_codes', v_after_codes,
      'combined_capacity', v_after_capacity,
      'floor_assignment_required', v_release_mode = 'complete-fallback',
      'release_mode', v_release_mode
    ),
    jsonb_build_object(
      'table_ids', v_existing_ids,
      'table_codes', v_before_codes,
      'combined_capacity', v_before_capacity,
      'floor_assignment_required', false,
      'primary_table_id', v_booking.table_id,
      'released_table_id', v_selected_table.id,
      'released_table_code', v_selected_table.table_code
    ),
    array['table_id','show_tables'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    case
      when v_release_mode = 'single'
        then 'One Corporate operational table claim released; remaining assignment retained.'
      else 'Selected release would under-seat the booking; complete assignment released to Floor Assignment.'
    end,
    'Operations Floor'
  );

  return jsonb_build_object(
    'booking_reference', v_booking.booking_reference,
    'floorAssignmentRequired', v_release_mode = 'complete-fallback',
    'releaseMode', v_release_mode,
    'released', v_released,
    'releasedTableCode', v_selected_table.table_code,
    'remainingCapacity', v_after_capacity,
    'remainingTableIds', v_after_ids
  );
end;
$$;

revoke all on function public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid) to service_role;
