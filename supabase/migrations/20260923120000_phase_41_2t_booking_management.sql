-- Phase 41.2T: stale-safe cancellation and public-capacity Standard moves.
-- Provider refunds remain in the existing payment_refunds/PayFast workflow.

create or replace function public.cancel_managed_booking_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_action_origin text,
  p_policy jsonb,
  p_actor_staff_profile_id uuid default null,
  p_actor_auth_user_id uuid default null,
  p_actor_name text default null,
  p_actor_role text default null,
  p_actor_location_scope text[] default '{}',
  p_request_id text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_metadata jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_released_table_count integer := 0;
  v_revoked_link_count integer := 0;
  v_ticket_count integer := 0;
begin
  if p_action_origin not in ('guest-self-service', 'staff') then
    raise exception 'INVALID_ACTION_ORIGIN';
  end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(btrim(p_booking_reference), '')
   for update;

  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  if v_booking.booking_status::text = 'cancelled' then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'idempotent', true,
      'refund_state', coalesce(p_policy ->> 'refundState', 'manual-refund-required')
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_CHANGED';
  end if;
  if v_booking.archived_at is not null then raise exception 'BOOKING_NOT_MANAGEABLE'; end if;
  if v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'BOOKING_NOT_MANAGEABLE';
  end if;
  if p_action_origin = 'guest-self-service' and (
    v_booking.booking_origin is distinct from 'customer_public'
    or v_booking.booking_source is distinct from 'online'
    or v_booking.corporate_request_id is not null
    or v_booking.payment_status::text = 'comp_vip'
  ) then
    raise exception 'GUEST_MANAGEMENT_NOT_ALLOWED';
  end if;

  v_new_notes := v_booking.notes;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata, '{status}', '"cancelled"'::jsonb, true);
      v_metadata := jsonb_set(v_metadata, '{tableId}', '"requires-floor-assignment"'::jsonb, true);
      v_metadata := jsonb_set(v_metadata, '{tableNumber}', '"Requires floor assignment"'::jsonb, true);
      v_metadata := jsonb_set(v_metadata, '{cancelledAt}', to_jsonb(v_now::text), true);
      v_metadata := jsonb_set(v_metadata, '{cancellationReason}', to_jsonb(coalesce(nullif(btrim(p_reason), ''), 'Booking cancelled.')), true);
      v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;
    exception when others then
      v_new_notes := v_booking.notes;
    end;
  end if;

  update public.bookings
     set booking_status = 'cancelled',
         notes = v_new_notes,
         table_id = null,
         updated_at = v_now
   where id = v_booking.id;

  update public.show_tables
     set booking_id = null,
         status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
         updated_at = v_now
   where booking_id = v_booking.id;
  get diagnostics v_released_table_count = row_count;

  update public.tickets
     set ticket_status = 'cancelled', updated_at = v_now
   where booking_id = v_booking.id
     and ticket_status in ('issued', 'valid', 'checked_in', 'expired');
  get diagnostics v_ticket_count = row_count;

  update public.booking_payment_links
     set status = 'revoked', revoked_at = v_now, updated_at = v_now
   where booking_id = v_booking.id and status = 'active';
  get diagnostics v_revoked_link_count = row_count;

  insert into public.booking_lifecycle_events (
    booking_id, changed_by, from_status, note, reason, to_status
  ) values (
    v_booking.id,
    p_actor_auth_user_id,
    v_booking.booking_status,
    coalesce(nullif(btrim(p_reason), ''), 'Booking cancelled.'),
    coalesce(nullif(btrim(p_reason), ''), 'Booking cancelled.'),
    'cancelled'
  );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.cancel', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]),
    coalesce(nullif(p_actor_name, ''), 'Verified guest'),
    coalesce(nullif(p_actor_role, ''), 'Guest'), p_actor_staff_profile_id,
    jsonb_build_object(
      'booking_status', 'cancelled', 'table_id', null,
      'ticket_status', 'cancelled', 'action_origin', p_action_origin,
      'policy', coalesce(p_policy, '{}'::jsonb),
      'payment_links_revoked', v_revoked_link_count
    ),
    jsonb_build_object(
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status,
      'show_id', v_booking.show_id,
      'guest_count', v_booking.guest_count,
      'table_id', v_booking.table_id,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding
    ),
    array['booking_status', 'table_id', 'ticket_status', 'payment_links'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    coalesce(nullif(btrim(p_reason), ''), 'Booking cancelled.'),
    p_request_id, 'Bookings', p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'idempotent', false,
    'refund_state', coalesce(p_policy ->> 'refundState', 'manual-refund-required'),
    'released_table_count', v_released_table_count,
    'revoked_payment_link_count', v_revoked_link_count,
    'ticket_count', v_ticket_count
  );
end
$$;

create or replace function public.move_public_standard_booking_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_expected_show_id uuid,
  p_destination_show_id uuid,
  p_action_origin text,
  p_actor_staff_profile_id uuid default null,
  p_actor_auth_user_id uuid default null,
  p_actor_name text default null,
  p_actor_role text default null,
  p_actor_location_scope text[] default '{}',
  p_request_id text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_destination public.shows%rowtype;
  v_source public.shows%rowtype;
  v_metadata jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_released_table_count integer := 0;
  v_state record;
  v_zone text;
begin
  if p_action_origin not in ('guest-self-service', 'staff') then
    raise exception 'INVALID_ACTION_ORIGIN';
  end if;

  select * into v_booking from public.bookings
   where booking_reference = nullif(btrim(p_booking_reference), '') for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  if v_booking.show_id = p_destination_show_id then
    return jsonb_build_object(
      'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
      'destination_show_id', v_booking.show_id, 'idempotent', true
    );
  end if;
  if v_booking.updated_at is distinct from p_expected_updated_at
     or v_booking.show_id is distinct from p_expected_show_id then
    raise exception 'BOOKING_CHANGED';
  end if;
  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'BOOKING_NOT_MANAGEABLE';
  end if;
  if v_booking.booking_origin is distinct from 'customer_public'
     or v_booking.booking_source is distinct from 'online'
     or v_booking.corporate_request_id is not null
     or v_booking.payment_status::text = 'comp_vip' then
    raise exception 'STANDARD_PUBLIC_BOOKING_REQUIRED';
  end if;

  select * into v_source from public.shows where id = v_booking.show_id;
  select * into v_destination from public.shows where id = p_destination_show_id;
  if v_destination.id is null then raise exception 'DESTINATION_SHOW_NOT_FOUND'; end if;
  if v_destination.status::text <> 'active' then raise exception 'DESTINATION_SHOW_NOT_ACTIVE'; end if;
  if v_destination.venue is distinct from v_source.venue then raise exception 'DESTINATION_VENUE_MISMATCH'; end if;
  if (v_destination.date + v_destination.time) at time zone 'Africa/Johannesburg' <= v_now then
    raise exception 'DESTINATION_SHOW_NOT_FUTURE';
  end if;

  v_zone := public.normalize_booking_capacity_zone(v_booking.section);
  if v_zone is null then raise exception 'BOOKING_ZONE_NOT_SUPPORTED'; end if;
  if not public.seating_zone_is_enabled(v_zone) then raise exception 'SEATING_ZONE_DISABLED'; end if;
  if exists (
    select 1 from public.show_zone_sales_controls control
     where control.show_id = v_destination.id and control.zone_id = v_zone
       and control.public_sales_open = false
  ) then raise exception 'PUBLIC_ZONE_SALES_CLOSED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_destination.id::text || ':' || v_zone, 0));
  select * into v_state from public.booking_capacity_zone_state(v_destination.id, v_zone);
  if v_state.base_capacity is null
     or v_state.active_entitlement_pax + v_booking.guest_count > v_state.base_capacity then
    raise exception 'PUBLIC_ZONE_CAPACITY_EXCEEDED';
  end if;

  v_new_notes := v_booking.notes;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata, '{showId}', to_jsonb(v_destination.id::text), true);
      v_metadata := jsonb_set(v_metadata, '{bookingDate}', to_jsonb(v_destination.date::text), true);
      v_metadata := jsonb_set(v_metadata, '{tableId}', '"requires-floor-assignment"'::jsonb, true);
      v_metadata := jsonb_set(v_metadata, '{tableNumber}', '"Requires floor assignment"'::jsonb, true);
      v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;
    exception when others then
      v_new_notes := v_booking.notes;
    end;
  end if;

  update public.show_tables
     set booking_id = null,
         status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
         updated_at = v_now
   where booking_id = v_booking.id;
  get diagnostics v_released_table_count = row_count;

  update public.bookings
     set show_id = v_destination.id, table_id = null, notes = v_new_notes,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.booking_lifecycle_events (
    booking_id, changed_by, from_status, note, reason, to_status
  ) values (
    v_booking.id, p_actor_auth_user_id, v_booking.booking_status,
    format('Moved from %s on %s at %s to %s on %s at %s. Zone and %s-guest entitlement preserved.',
      v_source.name, v_source.date, v_source.time, v_destination.name,
      v_destination.date, v_destination.time, v_booking.guest_count),
    'Standard booking moved to another publicly available performance.',
    v_booking.booking_status
  );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.show-transfer', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]),
    coalesce(nullif(p_actor_name, ''), 'Verified guest'),
    coalesce(nullif(p_actor_role, ''), 'Guest'), p_actor_staff_profile_id,
    jsonb_build_object(
      'show_id', v_destination.id, 'section', v_booking.section,
      'table_id', null, 'guest_count', v_booking.guest_count,
      'total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid,
      'action_origin', p_action_origin
    ),
    jsonb_build_object(
      'show_id', v_booking.show_id, 'section', v_booking.section,
      'table_id', v_booking.table_id, 'guest_count', v_booking.guest_count,
      'total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid
    ),
    array['show_id', 'table_id', 'payment_links'], v_booking.id::text,
    v_booking.booking_reference, 'booking', 'success',
    'Standard booking moved; identity, agreed value, payments and ticket identity preserved.',
    p_request_id, 'Bookings', p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
    'destination_show_id', v_destination.id, 'idempotent', false,
    'released_table_count', v_released_table_count
  );
end
$$;

revoke all on function public.cancel_managed_booking_atomic(text,timestamptz,text,text,jsonb,uuid,uuid,text,text,text[],text,text)
  from public, anon, authenticated;
revoke all on function public.move_public_standard_booking_atomic(text,timestamptz,uuid,uuid,text,uuid,uuid,text,text,text[],text,text)
  from public, anon, authenticated;
grant execute on function public.cancel_managed_booking_atomic(text,timestamptz,text,text,jsonb,uuid,uuid,text,text,text[],text,text)
  to service_role;
grant execute on function public.move_public_standard_booking_atomic(text,timestamptz,uuid,uuid,text,uuid,uuid,text,text,text[],text,text)
  to service_role;

comment on function public.cancel_managed_booking_atomic(text,timestamptz,text,text,jsonb,uuid,uuid,text,text,text[],text,text) is
  'Stale-safe idempotent cancellation using the existing booking, Floor, ticket, payment-link, lifecycle and audit architecture.';
comment on function public.move_public_standard_booking_atomic(text,timestamptz,uuid,uuid,text,uuid,uuid,text,text,text[],text,text) is
  'Atomic Standard booking move guarded by public base capacity, zone lifecycle and public zone-sales state.';
