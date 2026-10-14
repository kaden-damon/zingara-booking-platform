-- P0: Corporate pax amendments must keep the agreed booking total and update
-- the authoritative zone entitlement in the same transaction.

begin;

create or replace function public.reconcile_corporate_booking_guest_count_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_guest_count integer,
  p_reason text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id text,
  p_user_agent text
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
  v_booking public.bookings%rowtype;
  v_existing_pax integer;
  v_floor_queue boolean := false;
  v_limit integer;
  v_metadata jsonb;
  v_new_entitlements jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_show public.shows%rowtype;
  v_table_code text;
  v_zone text;
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
     and permission.key = 'bookings:reconcile';

  if v_actor_name is null then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;
  if p_guest_count is null or p_guest_count <= 0 then raise exception 'GUEST_COUNT_INVALID'; end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;

  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if v_booking.booking_origin <> 'corporate'
     or v_booking.booking_source <> 'corporate-direct' then
    raise exception 'CORPORATE_BOOKING_REQUIRED';
  end if;
  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;
  if v_booking.guest_count = p_guest_count then raise exception 'GUEST_COUNT_UNCHANGED'; end if;
  if v_booking.zone_entitlements is not null
     and jsonb_array_length(v_booking.zone_entitlements) > 1 then
    raise exception 'CORPORATE_ZONE_ALLOCATION_REQUIRED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if p_guest_count > v_booking.guest_count and v_show.status::text <> 'active' then
    raise exception 'SHOW_NOT_ACTIVE';
  end if;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or replace(lower(trim(coalesce(v_show.venue, ''))), ' ', '-') = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  v_zone := public.normalize_booking_capacity_zone(coalesce(
    v_booking.zone_entitlements -> 0 ->> 'zoneId',
    v_booking.section
  ));
  if v_zone is null then raise exception 'CORPORATE_ZONE_ENTITLEMENTS_INVALID'; end if;
  v_new_entitlements := jsonb_build_array(jsonb_build_object(
    'zoneId', v_zone,
    'pax', p_guest_count
  ));
  if not public.corporate_zone_entitlements_valid(v_new_entitlements, p_guest_count) then
    raise exception 'CORPORATE_ZONE_ENTITLEMENTS_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text || ':' || v_zone, 0));
  v_limit := public.booking_capacity_zone_effective_limit(v_booking.show_id, v_zone);
  select coalesce(sum(public.booking_zone_entitlement_pax(
    booking.zone_entitlements, booking.section, booking.guest_count, v_zone
  )), 0)::integer
    into v_existing_pax
    from public.bookings booking
   where booking.show_id = v_booking.show_id
     and booking.id <> v_booking.id
     and booking.archived_at is null
     and booking.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');
  if v_limit is not null and v_existing_pax + p_guest_count > v_limit then
    raise exception using errcode = '23514', message = format(
      'ZONE_CAPACITY_EXCEEDED|%s|%s|%s', v_zone, v_limit, v_existing_pax + p_guest_count
    );
  end if;

  perform 1 from public.show_tables where booking_id = v_booking.id order by id for update;
  if v_booking.table_id is not null then
    select table_code into v_table_code
      from public.show_tables
     where id = v_booking.table_id
       and show_id = v_booking.show_id
       and booking_id = v_booking.id
     for update;
    if v_table_code is null then raise exception 'BOOKING_TABLE_STATE_INVALID'; end if;
  end if;
  if not public.booking_table_claims_fit_guest_count(v_booking.id, p_guest_count) then
    update public.show_tables
       set booking_id = null,
           status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
           updated_at = v_now
     where booking_id = v_booking.id;
    v_floor_queue := true;
  elsif v_booking.table_id is null then
    v_floor_queue := true;
  end if;

  v_new_notes := v_booking.notes;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata, '{partySize}', to_jsonb(p_guest_count), true);
      v_metadata := jsonb_set(v_metadata, '{zoneId}', to_jsonb(v_zone), true);
      v_metadata := jsonb_set(v_metadata, '{zoneTitle}', to_jsonb(v_booking.section), true);
      if v_floor_queue then
        v_metadata := jsonb_set(v_metadata, '{tableId}', to_jsonb('requires-floor-assignment'::text), true);
        v_metadata := jsonb_set(v_metadata, '{tableNumber}', to_jsonb('Requires floor assignment'::text), true);
      end if;
      if jsonb_typeof(v_metadata -> 'guestTickets') = 'array' then
        v_metadata := jsonb_set(
          v_metadata,
          '{guestTickets}',
          coalesce((
            select jsonb_agg(jsonb_set(ticket, '{total}', to_jsonb(p_guest_count), true))
            from jsonb_array_elements(v_metadata -> 'guestTickets') ticket
            where coalesce((ticket ->> 'index')::integer, 1) <= p_guest_count
          ), '[]'::jsonb),
          true
        );
      end if;
      v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;
    exception when others then
      raise exception 'BOOKING_METADATA_INVALID';
    end;
  end if;

  update public.bookings
     set guest_count = p_guest_count,
         zone_entitlements = v_new_entitlements,
         table_id = case when v_floor_queue then null else v_booking.table_id end,
         notes = v_new_notes,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.corporate-guest-count-reconciliation', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'guest_count', p_guest_count,
      'zone_entitlements', v_new_entitlements,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'additional_amount', 0,
      'pricing_source', 'corporate-fixed-total',
      'table_id', case when v_floor_queue then null else v_booking.table_id end
    ),
    jsonb_build_object(
      'guest_count', v_booking.guest_count,
      'zone_entitlements', v_booking.zone_entitlements,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'table_id', v_booking.table_id
    ),
    array['guest_count', 'zone_entitlements', 'table_id'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    trim(p_reason), p_request_id, 'Bookings', p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'guest_count', p_guest_count,
    'previous_guest_count', v_booking.guest_count,
    'added_guests', greatest(p_guest_count - v_booking.guest_count, 0),
    'payment_basis', 'full',
    'unit_amount', 0,
    'additional_amount', 0,
    'total_amount', v_booking.total_amount,
    'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_booking.balance_outstanding,
    'payment_status', v_booking.payment_status,
    'table_id', case when v_floor_queue then null else v_booking.table_id end,
    'table_code', case when v_floor_queue then null else v_table_code end,
    'floor_assignment_required', v_floor_queue,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.reconcile_corporate_booking_guest_count_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reconcile_corporate_booking_guest_count_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) to service_role;

-- The target show has 103 other Private Booth guests. Restoring the proven
-- 40-person entitlement requires exactly five approved operational seats.
do $correction$
declare
  v_booking public.bookings%rowtype;
  v_existing_pax integer;
  v_state record;
begin
  select * into v_booking from public.bookings
   where booking_reference = 'ZNG-JLDCP6' for update;
  if v_booking.id is null then raise exception 'P0_BOOKING_NOT_FOUND'; end if;
  if v_booking.id <> 'f5023a3b-3c6b-4259-89f0-c54de94c678d'::uuid
     or v_booking.show_id <> 'a05929e8-9a04-44b2-8862-acc94f082ad0'::uuid
     or v_booking.guest_count <> 4
     or v_booking.section <> 'Private Booths'
     or v_booking.total_amount <> 68850
     or v_booking.amount_paid <> 0
     or v_booking.balance_outstanding <> 68850
     or v_booking.booking_origin <> 'corporate'
     or v_booking.booking_source <> 'corporate-direct' then
    raise exception 'P0_BOOKING_STATE_CHANGED';
  end if;
  if not exists (
    select 1 from public.audit_events audit
     where audit.entity_id = v_booking.id::text
       and audit.action = 'booking.guest-count-financial-reconciliation'
       and (audit.after_values ->> 'guest_count')::integer = 40
       and (audit.after_values ->> 'total_amount')::numeric = 68850
       and audit.outcome = 'success'
  ) then
    raise exception 'P0_40_GUEST_HISTORY_NOT_PROVEN';
  end if;
  if exists (
    select 1 from public.show_zone_operational_capacity_adjustments
     where request_id = 'p0-zng-jldcp6-private-booths-restore'
  ) then
    return;
  end if;

  select * into v_state from public.booking_capacity_zone_state(
    v_booking.show_id, 'royal-booths', null
  );
  select coalesce(sum(public.booking_zone_entitlement_pax(
    booking.zone_entitlements, booking.section, booking.guest_count, 'royal-booths'
  )), 0)::integer into v_existing_pax
  from public.bookings booking
  where booking.show_id = v_booking.show_id
    and booking.id <> v_booking.id
    and booking.archived_at is null
    and booking.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

  if v_existing_pax <> 103
     or v_state.effective_operational_capacity <> 138
     or v_existing_pax + 40 - v_state.effective_operational_capacity <> 5 then
    raise exception 'P0_CAPACITY_STATE_CHANGED';
  end if;

  insert into public.show_zone_operational_capacity_adjustments (
    show_id, zone_id, seats, booking_id, booking_reference,
    approved_maximum, request_id, actor_name, reason
  ) values (
    v_booking.show_id, 'royal-booths', 5, v_booking.id,
    v_booking.booking_reference, 5,
    'p0-zng-jldcp6-private-booths-restore',
    'Codex / management-authorised P0 restoration',
    'Restore proven 40-person Corporate Private Booth entitlement without creating a physical table.'
  );

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'show.zone-operational-capacity.approved-added', '{}'::text[],
    'Codex / management-authorised P0 restoration',
    jsonb_build_object(
      'show_id', v_booking.show_id,
      'zone_id', 'royal-booths',
      'booking_reference', v_booking.booking_reference,
      'temporary_capacity', v_state.temporary_capacity + 5,
      'effective_capacity', v_state.effective_operational_capacity + 5
    ),
    jsonb_build_object(
      'show_id', v_booking.show_id,
      'zone_id', 'royal-booths',
      'temporary_capacity', v_state.temporary_capacity,
      'effective_capacity', v_state.effective_operational_capacity
    ),
    array['temporary_operational_capacity'], v_booking.show_id::text,
    v_booking.booking_reference, 'show', 'success',
    'Management-authorised five-seat operational exception for the proven Corporate entitlement restoration.',
    'p0-zng-jldcp6-private-booths-restore', 'Corporate Booking Recovery'
  );
end;
$correction$;

commit;
