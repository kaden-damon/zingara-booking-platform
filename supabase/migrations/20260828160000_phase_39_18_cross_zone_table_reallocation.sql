-- Phase 39.18: allow the authenticated manual booking workflow to change a
-- booking's operational seating zone and table atomically. The existing
-- allocator RPC remains unchanged and therefore remains same-zone only.

create or replace function public.map_booking_operational_table_atomic(
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
  v_mapping_result jsonb;
  v_previous_section text;
  v_target_booking_section text;
  v_target_table public.show_tables%rowtype;
  v_target_zone text;
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

  select *
    into v_target_table
    from public.show_tables
   where id = p_target_table_id;

  if v_target_table.id is null or v_target_table.show_id <> v_booking.show_id then
    raise exception 'TABLE_NOT_AVAILABLE';
  end if;

  v_target_zone := public.normalize_booking_capacity_zone(v_target_table.section);
  v_target_booking_section := case v_target_zone
    when 'golden-circle' then 'Golden Circle'
    when 'middle-ring' then 'Middle Ring'
    when 'royal-booths' then 'Private Booths'
    when 'royal-balcony' then 'Royal Balcony'
    else null
  end;

  if v_target_booking_section is null then
    raise exception 'TABLE_ZONE_NOT_SUPPORTED';
  end if;

  v_previous_section := v_booking.section;

  -- This update and the hardened table mapping call below share one database
  -- transaction. Any validation or claim failure rolls the section change back.
  update public.bookings
     set section = v_target_booking_section,
         updated_at = now()
   where id = v_booking.id;

  v_mapping_result := public.map_booking_physical_table_atomic(
    p_booking_id,
    p_expected_previous_table_id,
    p_target_table_id
  );

  return v_mapping_result || jsonb_build_object(
    'previous_section', v_previous_section,
    'target_section', v_target_booking_section
  );
end
$$;

revoke all on function public.map_booking_operational_table_atomic(uuid, uuid, uuid) from public;
revoke all on function public.map_booking_operational_table_atomic(uuid, uuid, uuid) from anon;
revoke all on function public.map_booking_operational_table_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.map_booking_operational_table_atomic(uuid, uuid, uuid) to service_role;
