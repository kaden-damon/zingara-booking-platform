-- P0: extend the existing reinstatement workflow to manually released bookings
-- only when immutable cancellation and payment evidence support restoration.

create or replace function public.preview_booking_reinstatement(
  p_booking_reference text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocations jsonb := '[]'::jsonb;
  v_booking public.bookings%rowtype;
  v_capacity record;
  v_cancellation_proven boolean := false;
  v_code text := 'READY';
  v_entitlement record;
  v_existing_tickets integer := 0;
  v_payment_evidence boolean := false;
  v_preview jsonb;
  v_released_at timestamptz;
  v_refund_exists boolean := false;
  v_show public.shows%rowtype;
  v_system_expired boolean := false;
begin
  select * into v_booking
    from public.bookings
   where booking_reference = upper(trim(p_booking_reference));
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  v_system_expired := v_booking.booking_origin is not distinct from 'corporate'
    and v_booking.booking_source = 'corporate-direct'
    and v_booking.corporate_payment_expired_at is not null
    and exists (
      select 1 from public.audit_events expiry
       where expiry.entity_id = v_booking.id::text
         and expiry.action = 'corporate.payment_deadline.expired'
         and expiry.outcome = 'success'
    );

  if v_system_expired then
    select public.preview_expired_corporate_reinstatement(p_booking_reference)
      into v_preview;
    return v_preview || jsonb_build_object(
      'reinstatement_type', 'corporate_expiry',
      'historical_performance', false,
      'existing_ticket_count', (
        select count(*) from public.tickets ticket where ticket.booking_id = v_booking.id
      )
    );
  end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;

  v_cancellation_proven := exists (
    select 1 from public.audit_events cancellation
     where cancellation.entity_id = v_booking.id::text
       and cancellation.action = 'booking.cancel'
       and cancellation.outcome = 'success'
       and cancellation.before_values ->> 'booking_status'
           in ('new', 'confirmed', 'pending_payment', 'checked_in')
       and cancellation.after_values ->> 'booking_status' = 'cancelled'
  );
  select max(cancellation.created_at) into v_released_at
    from public.audit_events cancellation
   where cancellation.entity_id = v_booking.id::text
     and cancellation.action = 'booking.cancel'
     and cancellation.outcome = 'success';

  v_refund_exists := exists (
    select 1 from public.payment_refunds refund
     where refund.booking_id = v_booking.id
       and refund.completed_at is not null
  );

  v_payment_evidence := coalesce(v_booking.amount_paid, 0) > 0
    and v_booking.payment_status::text in ('deposit_paid', 'fully_paid')
    and (
      exists (
        select 1 from public.legacy_booking_payment_evidence evidence
         where evidence.booking_id = v_booking.id
           and round(evidence.source_payment_amount, 2)
               >= round(v_booking.amount_paid, 2)
      )
      or coalesce((
        select sum(payment.amount)
          from public.payments payment
         where payment.booking_id = v_booking.id
           and payment.payment_status::text in ('deposit_paid', 'fully_paid')
           and not exists (
             select 1 from public.manual_payment_reversals reversal
              where reversal.payment_id = payment.id
           )
      ), 0) >= round(v_booking.amount_paid, 2)
    );

  select count(*) into v_existing_tickets
    from public.tickets ticket where ticket.booking_id = v_booking.id;

  for v_entitlement in
    select public.normalize_booking_capacity_zone(zone_id) as zone_id, sum(pax)::integer as pax
      from (
        select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
          from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
        union all
        select v_booking.section, v_booking.guest_count
         where v_booking.zone_entitlements is null
      ) zones
     where public.normalize_booking_capacity_zone(zone_id) is not null
     group by 1
     order by 1
  loop
    select * into v_capacity
      from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'zone_id', v_entitlement.zone_id,
      'pax', v_entitlement.pax,
      'active_entitlement', v_capacity.active_entitlement_pax,
      'effective_capacity', v_capacity.effective_operational_capacity,
      'available_before', greatest(v_capacity.effective_operational_capacity - v_capacity.active_entitlement_pax, 0),
      'available_after', greatest(v_capacity.effective_operational_capacity - v_capacity.active_entitlement_pax - v_entitlement.pax, 0),
      'deficit', greatest(v_capacity.active_entitlement_pax + v_entitlement.pax - v_capacity.effective_operational_capacity, 0)
    ));
  end loop;

  if v_booking.booking_status::text <> 'cancelled'
     or v_booking.archived_at is not null
     or not v_cancellation_proven
     or v_refund_exists then
    v_code := 'NOT_ELIGIBLE';
  elsif not v_payment_evidence then
    v_code := 'PAYMENT_REQUIRED';
  elsif exists (
    select 1 from jsonb_array_elements(v_allocations) allocation
     where coalesce((allocation ->> 'deficit')::integer, 0) > 0
  ) then
    v_code := 'CAPACITY_BLOCKED';
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'booking_status', v_booking.booking_status,
    'payment_status', v_booking.payment_status,
    'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_booking.balance_outstanding,
    'guest_count', v_booking.guest_count,
    'expired_at', v_released_at,
    'updated_at', v_booking.updated_at,
    'system_expired', false,
    'payment_satisfied', v_payment_evidence,
    'eligible', v_code = 'READY',
    'code', v_code,
    'allocations', v_allocations,
    'floor_assignment_required', v_booking.table_id is null,
    'reinstatement_type', 'released_booking',
    'historical_performance', v_show.date < (now() at time zone 'Africa/Johannesburg')::date,
    'show_status', v_show.status,
    'existing_ticket_count', v_existing_tickets
  );
end;
$$;

revoke all on function public.preview_booking_reinstatement(text)
  from public, anon, authenticated;
grant execute on function public.preview_booking_reinstatement(text)
  to service_role;

create or replace function public.reinstate_released_booking_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
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
  v_allocations jsonb := '[]'::jsonb;
  v_booking public.bookings%rowtype;
  v_capacity record;
  v_entitlement record;
  v_existing_audit_id uuid;
  v_now timestamptz := clock_timestamp();
  v_payment_evidence boolean := false;
  v_show public.shows%rowtype;
  v_ticket_count integer := 0;
  v_venue text;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_updated_at is null
     or nullif(trim(p_idempotency_key), '') is null
     or length(trim(p_idempotency_key)) > 128 then
    raise exception 'BOOKING_REINSTATEMENT_INPUT_INVALID';
  end if;

  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and permission.key = 'bookings:manage';
  if v_actor_name is null then raise exception 'BOOKING_REINSTATEMENT_PERMISSION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings
   where booking_reference = upper(trim(p_booking_reference)) for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select id into v_existing_audit_id from public.audit_events
   where action = 'booking.reinstated'
     and entity_id = v_booking.id::text
     and request_id = trim(p_idempotency_key)
     and outcome = 'success' limit 1;
  if v_existing_audit_id is not null then
    return jsonb_build_object(
      'status', 'already_processed', 'idempotent', true,
      'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
      'booking_status', v_booking.booking_status, 'payment_status', v_booking.payment_status,
      'updated_at', v_booking.updated_at
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if v_booking.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in') then
    raise exception 'BOOKING_REINSTATEMENT_ALREADY_ACTIVE';
  end if;
  if v_booking.booking_status::text <> 'cancelled'
     or v_booking.archived_at is not null
     or exists (
       select 1 from public.payment_refunds refund
        where refund.booking_id = v_booking.id and refund.completed_at is not null
     )
     or not exists (
       select 1 from public.audit_events cancellation
        where cancellation.entity_id = v_booking.id::text
          and cancellation.action = 'booking.cancel'
          and cancellation.outcome = 'success'
          and cancellation.before_values ->> 'booking_status'
              in ('new', 'confirmed', 'pending_payment', 'checked_in')
          and cancellation.after_values ->> 'booking_status' = 'cancelled'
     ) then
    raise exception 'BOOKING_REINSTATEMENT_NOT_ELIGIBLE';
  end if;

  v_payment_evidence := coalesce(v_booking.amount_paid, 0) > 0
    and v_booking.payment_status::text in ('deposit_paid', 'fully_paid')
    and (
      exists (
        select 1 from public.legacy_booking_payment_evidence evidence
         where evidence.booking_id = v_booking.id
           and round(evidence.source_payment_amount, 2)
               >= round(v_booking.amount_paid, 2)
      )
      or coalesce((
        select sum(payment.amount)
          from public.payments payment
         where payment.booking_id = v_booking.id
           and payment.payment_status::text in ('deposit_paid', 'fully_paid')
           and not exists (
             select 1 from public.manual_payment_reversals reversal
              where reversal.payment_id = payment.id
           )
      ), 0) >= round(v_booking.amount_paid, 2)
    );
  if not v_payment_evidence then raise exception 'BOOKING_REINSTATEMENT_PAYMENT_REQUIRED'; end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  v_venue := case
    when lower(coalesce(v_show.venue, '')) like '%johannesburg%'
      or lower(coalesce(v_show.venue, '')) in ('jhb', 'joburg') then 'johannesburg'
    when lower(coalesce(v_show.venue, '')) like '%cape town%'
      or lower(coalesce(v_show.venue, '')) in ('cpt', 'cape-town', 'zingara') then 'cape-town'
    else replace(lower(trim(coalesce(v_show.venue, ''))), ' ', '-')
  end;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or v_venue = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then raise exception 'SHOW_OUTSIDE_STAFF_SCOPE'; end if;

  for v_entitlement in
    select public.normalize_booking_capacity_zone(zone_id) as zone_id, sum(pax)::integer as pax
      from (
        select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
          from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
        union all
        select v_booking.section, v_booking.guest_count
         where v_booking.zone_entitlements is null
      ) zones
     where public.normalize_booking_capacity_zone(zone_id) is not null
     group by 1
     order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_booking.show_id::text || ':' || v_entitlement.zone_id, 0)
    );
    select * into v_capacity
      from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);
    if v_capacity.active_entitlement_pax + v_entitlement.pax
       > v_capacity.effective_operational_capacity then
      raise exception 'BOOKING_REINSTATEMENT_CAPACITY_EXCEEDED|%|%|%|%|%',
        v_entitlement.zone_id, v_entitlement.pax,
        v_capacity.active_entitlement_pax,
        v_capacity.effective_operational_capacity,
        v_capacity.active_entitlement_pax + v_entitlement.pax - v_capacity.effective_operational_capacity;
    end if;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'zone_id', v_entitlement.zone_id,
      'pax', v_entitlement.pax,
      'active_entitlement_before', v_capacity.active_entitlement_pax,
      'active_entitlement_after', v_capacity.active_entitlement_pax + v_entitlement.pax,
      'effective_capacity', v_capacity.effective_operational_capacity,
      'available_after', v_capacity.effective_operational_capacity - v_capacity.active_entitlement_pax - v_entitlement.pax
    ));
  end loop;

  update public.bookings
     set booking_status = 'confirmed', updated_at = v_now
   where id = v_booking.id;

  update public.tickets
     set ticket_status = 'valid', updated_at = v_now
   where booking_id = v_booking.id and ticket_status = 'cancelled';
  get diagnostics v_ticket_count = row_count;

  insert into public.booking_lifecycle_events (
    booking_id, changed_by, created_at, from_status, note, reason, to_status
  ) values (
    v_booking.id, p_actor_auth_user_id, v_now, 'cancelled',
    format('Booking reinstated by %s.', v_actor_name),
    'Existing payment evidence and approved capacity verified. Historical show, table and attendance state preserved.',
    'confirmed'
  );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.reinstated', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'booking_status', 'confirmed', 'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding,
      'guest_count', v_booking.guest_count, 'show_id', v_booking.show_id,
      'table_id', v_booking.table_id, 'allocations', v_allocations,
      'floor_assignment_required', v_booking.table_id is null,
      'existing_tickets_reactivated', v_ticket_count,
      'historical_performance', v_show.date < (v_now at time zone 'Africa/Johannesburg')::date
    ),
    jsonb_build_object(
      'booking_status', v_booking.booking_status, 'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding,
      'guest_count', v_booking.guest_count, 'show_id', v_booking.show_id,
      'table_id', v_booking.table_id
    ),
    array['booking_status', 'ticket_status'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    'Existing payment evidence and approved capacity verified; no financial, table, attendance or show data changed.',
    trim(p_idempotency_key), 'Booking Details · Reinstatement', p_user_agent
  );

  return jsonb_build_object(
    'status', 'processed', 'idempotent', false,
    'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
    'booking_status', 'confirmed', 'payment_status', v_booking.payment_status,
    'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding,
    'guest_count', v_booking.guest_count, 'show_id', v_booking.show_id,
    'table_id', v_booking.table_id, 'allocations', v_allocations,
    'floor_assignment_required', v_booking.table_id is null,
    'existing_tickets_reactivated', v_ticket_count,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.reinstate_released_booking_atomic(
  text, timestamptz, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.reinstate_released_booking_atomic(
  text, timestamptz, text, uuid, uuid, text
) to service_role;
