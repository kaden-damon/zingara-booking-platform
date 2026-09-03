-- Phase 39.53: assign a confirmed, unallocated booking to one operational
-- table atomically. UI suggestions remain advisory; every invariant is
-- enforced again while the booking and target table are locked.

create or replace function public.assign_unallocated_booking_table_atomic(
  p_booking_id uuid,
  p_target_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_target public.show_tables%rowtype;
  v_member_count integer;
  v_member_capacity integer;
begin
  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status::text <> 'confirmed' then
    raise exception 'BOOKING_NOT_ASSIGNABLE';
  end if;

  if v_booking.table_id is not null then
    raise exception 'BOOKING_ALREADY_ASSIGNED';
  end if;

  select *
    into v_target
    from public.show_tables
   where id = p_target_table_id
   for update;

  if v_target.id is null
     or v_target.show_id <> v_booking.show_id
     or public.normalize_booking_capacity_zone(v_target.section)
        <> public.normalize_booking_capacity_zone(v_booking.section)
     or not v_target.capacity_configured
     or v_target.capacity is null
     or v_target.capacity < v_booking.guest_count
     or v_target.status::text <> 'available'
     or v_target.booking_id is not null
     or v_target.merged_parent_id is not null
     or not (
       (v_target.is_physical and coalesce(cardinality(v_target.merged_from), 0) = 0)
       or (
         not v_target.is_physical
         and v_target.is_override
         and v_target.availability_scope::text = 'operational'
       )
     ) then
    raise exception 'TABLE_NOT_AVAILABLE';
  end if;

  if not v_target.is_physical
     and coalesce(cardinality(v_target.merged_from), 0) > 0 then
    perform 1
      from public.show_tables member
     where member.id = any(v_target.merged_from)
     for update;

    select count(*), coalesce(sum(member.capacity), 0)
      into v_member_count, v_member_capacity
      from public.show_tables member
     where member.id = any(v_target.merged_from)
       and member.show_id = v_target.show_id
       and public.normalize_booking_capacity_zone(member.section)
           = public.normalize_booking_capacity_zone(v_target.section)
       and member.is_physical
       and member.capacity_configured
       and member.capacity is not null
       and member.status::text = 'disabled'
       and member.booking_id is null
       and member.merged_parent_id = v_target.id
       and coalesce(cardinality(member.merged_from), 0) = 0;

    if v_member_count <> cardinality(v_target.merged_from)
       or v_member_capacity <> v_target.capacity then
      raise exception 'MERGED_TABLE_NOT_AVAILABLE';
    end if;
  end if;

  update public.show_tables
     set booking_id = v_booking.id,
         status = 'booked',
         updated_at = now()
   where id = v_target.id
     and booking_id is null
     and status::text = 'available';

  if not found then
    raise exception 'TABLE_NOT_AVAILABLE';
  end if;

  update public.bookings
     set table_id = v_target.id,
         updated_at = now()
   where id = v_booking.id
     and table_id is null;

  if not found then
    raise exception 'BOOKING_ALREADY_ASSIGNED';
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'show_id', v_booking.show_id,
    'table_id', v_target.id,
    'table_code', v_target.table_code
  );
end
$$;

revoke all on function public.assign_unallocated_booking_table_atomic(uuid, uuid) from public;
revoke all on function public.assign_unallocated_booking_table_atomic(uuid, uuid) from anon;
revoke all on function public.assign_unallocated_booking_table_atomic(uuid, uuid) from authenticated;
grant execute on function public.assign_unallocated_booking_table_atomic(uuid, uuid) to service_role;
