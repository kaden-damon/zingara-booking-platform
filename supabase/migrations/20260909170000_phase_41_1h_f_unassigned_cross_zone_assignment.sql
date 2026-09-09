-- Phase 41.1H-F: let the existing operational-table mapping transaction
-- distinguish an unassigned booking from a true table reallocation. Assigned
-- moves retain the existing map_booking_physical_table_atomic path.

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

  if v_booking.zone_entitlements is not null
     and jsonb_array_length(v_booking.zone_entitlements) <> 1 then
    raise exception 'MULTI_ZONE_CORPORATE_WORKFLOW_REQUIRED';
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

  -- The booking capacity trigger validates the destination effective zone
  -- capacity in this transaction. A single persisted Corporate entitlement is
  -- moved with the section; Standard bookings continue to use section directly.
  update public.bookings
     set section = v_target_booking_section,
         zone_entitlements = case
           when v_booking.zone_entitlements is null then null
           else jsonb_build_array(jsonb_build_object(
             'zoneId', v_target_zone,
             'pax', v_booking.guest_count
           ))
         end,
         updated_at = now()
   where id = v_booking.id;

  if v_booking.table_id is null then
    v_mapping_result := public.assign_unallocated_booking_table_atomic(
      p_booking_id,
      p_target_table_id
    );
  else
    v_mapping_result := public.map_booking_physical_table_atomic(
      p_booking_id,
      p_expected_previous_table_id,
      p_target_table_id
    );
  end if;

  return v_mapping_result || jsonb_build_object(
    'previous_section', v_previous_section,
    'target_section', v_target_booking_section,
    'assignment_mode', case
      when v_booking.table_id is null then 'unassigned-to-assigned'
      else 'assigned-to-assigned'
    end
  );
end
$$;

revoke all on function public.map_booking_operational_table_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.map_booking_operational_table_atomic(uuid, uuid, uuid)
  to service_role;
