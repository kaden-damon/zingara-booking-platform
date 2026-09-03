-- Phase 39.58B: correct the one proven Corporate conversion zone mismatch.

do $$
declare
  v_booking public.bookings%rowtype;
  v_request public.corporate_requests%rowtype;
  v_metadata jsonb;
  v_capacity integer;
  v_existing_middle_ring_pax integer;
  v_updated_count integer;
begin
  select * into strict v_booking
    from public.bookings
   where booking_reference = 'ZNG-43V3AQ'
   for update;

  select * into strict v_request
    from public.corporate_requests
   where id = 'a18d22e3-c7bb-4c42-bee1-17388780aad9'::uuid
   for update;

  if v_booking.id <> '5bdffed3-03ab-4d12-8170-27e5d04fc789'::uuid
     or v_booking.corporate_request_id <> v_request.id
     or v_request.linked_booking_id <> v_booking.id
     or v_request.linked_booking_reference <> v_booking.booking_reference
     or v_request.seating_preference <> 'MR'
     or v_booking.section <> 'Golden Circle'
     or v_booking.guest_count <> 73
     or v_booking.table_id is not null
     or v_booking.total_amount <> 111690
     or v_booking.amount_paid <> 0
     or v_booking.balance_outstanding <> 111690
     or v_booking.payment_status::text <> 'pending_payment'
     or v_booking.booking_status::text <> 'pending_payment' then
    raise exception 'IFF_CORPORATE_ZONE_CORRECTION_GUARD_FAILED';
  end if;

  if v_booking.notes not like '__zingara_booking_meta__:%' then
    raise exception 'IFF_CORPORATE_ZONE_METADATA_MISSING';
  end if;

  begin
    v_metadata := substring(
      v_booking.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
  exception
    when others then
      raise exception 'IFF_CORPORATE_ZONE_METADATA_INVALID';
  end;

  if v_metadata ->> 'zoneId' <> 'golden-circle'
     or v_metadata ->> 'zoneTitle' <> 'Golden Circle' then
    raise exception 'IFF_CORPORATE_ZONE_METADATA_GUARD_FAILED';
  end if;

  select coalesce(
    nullif(settings #>> '{zonePricing,middle-ring,maxSeats}', '')::integer,
    132
  ) into v_capacity
    from public.venue_settings
   order by updated_at desc
   limit 1;

  select coalesce(sum(guest_count), 0)::integer
    into v_existing_middle_ring_pax
    from public.bookings
   where show_id = v_booking.show_id
     and id <> v_booking.id
     and archived_at is null
     and booking_status::text in (
       'new',
       'confirmed',
       'pending_payment',
       'checked_in'
     )
     and section = 'Middle Ring';

  if v_existing_middle_ring_pax + v_booking.guest_count > v_capacity then
    raise exception 'IFF_CORPORATE_ZONE_CAPACITY_EXCEEDED';
  end if;

  update public.bookings
     set section = 'Middle Ring',
         notes = '__zingara_booking_meta__:' || (
           v_metadata || jsonb_build_object(
             'zoneId', 'middle-ring',
             'zoneTitle', 'Middle Ring'
           )
         )::text,
         updated_at = clock_timestamp()
   where id = v_booking.id
     and section = 'Golden Circle'
     and table_id is null;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'IFF_CORPORATE_ZONE_CORRECTION_NOT_APPLIED';
  end if;

  insert into public.audit_events (
    actor_name,
    actor_role,
    actor_location_scope,
    action,
    entity_type,
    entity_reference,
    entity_id,
    entity_location,
    outcome,
    source_area,
    reason,
    before_values,
    after_values,
    changed_fields
  ) values (
    'SYSTEM',
    'service-role',
    array['cape-town'],
    'corporate.booking-zone-corrected',
    'booking',
    v_booking.booking_reference,
    v_booking.id::text,
    'cape-town',
    'success',
    'Corporate',
    'User-approved Phase 39.58B correction from authoritative linked enquiry seating MR.',
    jsonb_build_object(
      'section', 'Golden Circle',
      'zone_id', 'golden-circle',
      'table_id', v_booking.table_id,
      'guest_count', v_booking.guest_count
    ),
    jsonb_build_object(
      'section', 'Middle Ring',
      'zone_id', 'middle-ring',
      'table_id', v_booking.table_id,
      'guest_count', v_booking.guest_count
    ),
    array['section', 'notes.zoneId', 'notes.zoneTitle']
  );
end;
$$;
