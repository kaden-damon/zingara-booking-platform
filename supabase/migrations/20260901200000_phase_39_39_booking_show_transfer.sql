-- Phase 39.39: move an existing booking between performances without changing
-- its identity, pricing, payments, ticket, QR payload, or communication history.

create or replace function public.transfer_booking_show_atomic(
  p_booking_reference text,
  p_expected_show_id uuid,
  p_destination_show_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
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
  v_booking public.bookings%rowtype;
  v_destination_show public.shows%rowtype;
  v_destination_table public.show_tables%rowtype;
  v_metadata jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_old_table_code text;
  v_released_table_count integer := 0;
  v_target_claimed boolean := false;
  v_zone text;
begin
  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  select *
    into v_destination_show
    from public.shows
   where id = p_destination_show_id;

  if v_destination_show.id is null then
    raise exception 'DESTINATION_SHOW_NOT_FOUND';
  end if;

  if v_booking.show_id = v_destination_show.id then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'destination_show_id', v_destination_show.id,
      'idempotent', true,
      'table_id', v_booking.table_id
    );
  end if;

  if v_booking.show_id <> p_expected_show_id then
    raise exception 'BOOKING_SHOW_CHANGED';
  end if;

  if v_booking.archived_at is not null then
    raise exception 'ARCHIVED_BOOKING_TRANSFER_BLOCKED';
  end if;

  if v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'BOOKING_STATUS_TRANSFER_BLOCKED';
  end if;

  if v_destination_show.status::text <> 'active' then
    raise exception 'DESTINATION_SHOW_NOT_ACTIVE';
  end if;

  v_zone := public.normalize_booking_capacity_zone(v_booking.section);

  if v_zone is null then
    raise exception 'BOOKING_ZONE_NOT_SUPPORTED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_destination_show.id::text || ':' || v_zone, 0)
  );

  if v_booking.table_id is not null then
    select table_code
      into v_old_table_code
      from public.show_tables
     where id = v_booking.table_id;
  end if;

  if v_old_table_code is not null then
    select *
      into v_destination_table
      from public.show_tables
     where show_id = v_destination_show.id
       and table_code = v_old_table_code
       and public.normalize_booking_capacity_zone(section) = v_zone
       and is_physical
       and capacity_configured
       and capacity is not null
       and capacity >= v_booking.guest_count
       and status = 'available'
       and booking_id is null
       and merged_parent_id is null
       and cardinality(coalesce(merged_from, '{}'::uuid[])) = 0
     for update;
  end if;

  update public.show_tables
     set booking_id = null,
         status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
         updated_at = v_now
   where booking_id = v_booking.id;
  get diagnostics v_released_table_count = row_count;

  if v_destination_table.id is not null then
    update public.show_tables
       set booking_id = v_booking.id,
           status = 'booked',
           updated_at = v_now
     where id = v_destination_table.id
       and booking_id is null
       and status = 'available';
    v_target_claimed := found;
  end if;

  v_new_notes := v_booking.notes;

  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata, '{showId}', to_jsonb(v_destination_show.id::text), true);
      v_metadata := jsonb_set(v_metadata, '{bookingDate}', to_jsonb(v_destination_show.date::text), true);
      v_metadata := jsonb_set(
        v_metadata,
        '{tableId}',
        to_jsonb(case when v_target_claimed then v_destination_table.id::text else 'requires-floor-assignment' end),
        true
      );
      v_metadata := jsonb_set(
        v_metadata,
        '{tableNumber}',
        to_jsonb(case when v_target_claimed then v_destination_table.table_code else 'Requires floor assignment' end),
        true
      );
      v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;
    exception when others then
      v_new_notes := v_booking.notes;
    end;
  end if;

  update public.bookings
     set show_id = v_destination_show.id,
         table_id = case when v_target_claimed then v_destination_table.id else null end,
         notes = v_new_notes,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.booking_lifecycle_events (
    booking_id,
    changed_by,
    from_status,
    note,
    reason,
    to_status
  ) values (
    v_booking.id,
    p_actor_auth_user_id,
    v_booking.booking_status,
    format(
      'Moved from %s on %s at %s to %s on %s at %s. Zone preserved: %s. Table: %s to %s.',
      (select name from public.shows where id = v_booking.show_id),
      (select date from public.shows where id = v_booking.show_id),
      (select time from public.shows where id = v_booking.show_id),
      v_destination_show.name,
      v_destination_show.date,
      v_destination_show.time,
      v_booking.section,
      coalesce(v_old_table_code, 'Unassigned'),
      case when v_target_claimed then v_destination_table.table_code else 'Requires floor assignment' end
    ),
    'Booking moved to another show by authorised staff.',
    v_booking.booking_status
  );

  insert into public.audit_events (
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
    request_id,
    source_area,
    user_agent
  ) values (
    'booking.show-transfer',
    p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]),
    p_actor_name,
    p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'show_id', v_destination_show.id,
      'show_name', v_destination_show.name,
      'show_date', v_destination_show.date,
      'show_time', v_destination_show.time,
      'section', v_booking.section,
      'table_id', case when v_target_claimed then v_destination_table.id else null end,
      'table_code', case when v_target_claimed then v_destination_table.table_code else null end
    ),
    jsonb_build_object(
      'show_id', v_booking.show_id,
      'section', v_booking.section,
      'table_id', v_booking.table_id,
      'table_code', v_old_table_code
    ),
    array['show_id', 'table_id'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    'Booking moved to another show; identity, pricing, payment, and ticket state preserved.',
    p_request_id,
    'Bookings',
    p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'destination_show_id', v_destination_show.id,
    'idempotent', false,
    'released_table_count', v_released_table_count,
    'table_assigned', v_target_claimed,
    'table_code', case when v_target_claimed then v_destination_table.table_code else null end,
    'table_id', case when v_target_claimed then v_destination_table.id else null end
  );
end
$$;

revoke all on function public.transfer_booking_show_atomic(
  text, uuid, uuid, uuid, uuid, text, text, text[], text, text
) from public, anon, authenticated;

grant execute on function public.transfer_booking_show_atomic(
  text, uuid, uuid, uuid, uuid, text, text, text[], text, text
) to service_role;
