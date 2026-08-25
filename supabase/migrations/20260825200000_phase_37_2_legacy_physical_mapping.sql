-- Phase 37.2: permit preserved legacy placeholder overrides to be mapped.

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
    raise exception 'LEGACY_TABLE_ASSIGNMENT_REQUIRED';
  end if;

  select *
    into v_previous_table
    from public.show_tables
   where id = v_booking.table_id
   for update;

  if v_previous_table.id is null
     or v_previous_table.is_physical
     or not (
       (public.normalize_booking_capacity_zone(v_previous_table.section) = 'golden-circle' and v_previous_table.table_code ~* '^GC[0-9]+$')
       or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'middle-ring' and v_previous_table.table_code ~* '^MR[0-9]+$')
       or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-booths' and v_previous_table.table_code ~* '^B[0-9]+$')
       or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-balcony' and v_previous_table.table_code ~* '^RB[0-9]+$')
     ) then
    raise exception 'LEGACY_TABLE_ASSIGNMENT_REQUIRED';
  end if;

  select *
    into v_target_table
    from public.show_tables
   where id = p_target_table_id
   for update;

  if v_target_table.id is null
     or v_target_table.show_id <> v_booking.show_id
     or public.normalize_booking_capacity_zone(v_target_table.section) <> public.normalize_booking_capacity_zone(v_booking.section)
     or not v_target_table.is_physical
     or not v_target_table.capacity_configured
     or v_target_table.capacity is null
     or v_target_table.capacity < v_booking.guest_count
     or v_target_table.status::text = 'disabled'
     or (v_target_table.booking_id is not null and v_target_table.booking_id <> v_booking.id) then
    raise exception 'PHYSICAL_TABLE_NOT_AVAILABLE';
  end if;

  if v_booking.table_id = v_target_table.id then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'previous_table_id', v_booking.table_id,
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
         status = 'available',
         updated_at = now()
   where id = v_previous_table.id
     and v_previous_table.id <> v_target_table.id
     and booking_id = v_booking.id;

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
