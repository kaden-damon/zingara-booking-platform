-- Phase 41.2Y-P0-C: bounded recovery for Corporate bookings proven to have
-- been cancelled by the automated payment-deadline workflow.

create or replace function public.preview_corporate_expiry_mass_recovery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocations jsonb;
  v_booking record;
  v_capacity record;
  v_category text;
  v_deficit integer;
  v_duplicate_references text[];
  v_entitlement record;
  v_key text;
  v_reserved jsonb := '{}'::jsonb;
  v_reserved_pax integer;
  v_results jsonb := '[]'::jsonb;
  v_restore_count integer := 0;
  v_restore_pax integer := 0;
  v_capacity_count integer := 0;
  v_capacity_pax integer := 0;
  v_duplicate_count integer := 0;
  v_duplicate_pax integer := 0;
  v_ineligible_count integer := 0;
  v_ineligible_pax integer := 0;
  v_other_count integer := 0;
  v_other_pax integer := 0;
  v_total_count integer := 0;
  v_total_pax integer := 0;
begin
  for v_booking in
    select
      booking.*,
      expiry.created_at as expiry_audit_at,
      expiry.before_values as expiry_before_values,
      show_row.date as show_date,
      show_row.time as show_time,
      show_row.venue
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
    join lateral (
      select audit.created_at, audit.before_values
      from public.audit_events audit
      where audit.entity_id = booking.id::text
        and audit.action = 'corporate.payment_deadline.expired'
        and audit.outcome = 'success'
      order by audit.created_at desc
      limit 1
    ) expiry on true
    where booking.booking_origin is not distinct from 'corporate'
      and booking.booking_source = 'corporate-direct'
      and booking.booking_status::text = 'cancelled'
      and booking.corporate_payment_expired_at is not null
      and show_row.date >= (clock_timestamp() at time zone 'Africa/Johannesburg')::date
    order by booking.created_at, expiry.created_at, booking.id
  loop
    v_total_count := v_total_count + 1;
    v_total_pax := v_total_pax + v_booking.guest_count;
    v_category := 'restore_now';
    v_allocations := '[]'::jsonb;
    v_duplicate_references := '{}';

    if v_booking.archived_at is not null
       or v_booking.payment_status::text in ('cancelled', 'refunded')
       or exists (
         select 1
         from public.payment_refunds refund
         where refund.booking_id = v_booking.id
           and refund.completed_at is not null
       )
       or exists (
         select 1
         from public.audit_events later_action
         where later_action.entity_id = v_booking.id::text
           and later_action.created_at > v_booking.expiry_audit_at
           and later_action.outcome = 'success'
           and later_action.action in (
             'booking.cancel',
             'booking.archive',
             'booking.refund'
           )
       ) then
      v_category := 'ineligible_manual_or_restricted';
    end if;

    if v_category = 'restore_now' then
      select coalesce(array_agg(other.booking_reference order by other.created_at), '{}')
      into v_duplicate_references
      from public.bookings other
      where other.id <> v_booking.id
        and other.show_id = v_booking.show_id
        and other.archived_at is null
        and other.booking_status::text in ('new', 'pending_payment', 'confirmed', 'checked_in')
        and other.guest_count = v_booking.guest_count
        and (
          other.customer_id = v_booking.customer_id
          or (
            nullif(lower(regexp_replace(trim(other.company_name), '\\s+', ' ', 'g')), '') is not null
            and lower(regexp_replace(trim(other.company_name), '\\s+', ' ', 'g')) =
                lower(regexp_replace(trim(v_booking.company_name), '\\s+', ' ', 'g'))
          )
        )
        and not exists (
          select 1
          from public.duplicate_booking_review_dispositions disposition
          where disposition.decision = 'legitimate_separate_bookings'
            and disposition.record_ids @> array[v_booking.id, other.id]::uuid[]
        );

      if cardinality(v_duplicate_references) > 0 then
        v_category := 'duplicate_replacement_review';
      end if;
    end if;

    if v_category = 'restore_now' then
      for v_entitlement in
        select public.normalize_booking_capacity_zone(zone_id) as zone_id, pax
        from (
          select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
          from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
          union all
          select v_booking.section, v_booking.guest_count
          where v_booking.zone_entitlements is null
        ) zones
        where public.normalize_booking_capacity_zone(zone_id) is not null
        order by 1
      loop
        select * into v_capacity
        from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);

        if v_capacity.effective_operational_capacity is null then
          v_category := 'other_blocker';
          exit;
        end if;

        v_key := v_booking.show_id::text || ':' || v_entitlement.zone_id;
        v_reserved_pax := coalesce((v_reserved ->> v_key)::integer, 0);
        v_deficit := greatest(
          v_capacity.active_entitlement_pax + v_reserved_pax + v_entitlement.pax -
            v_capacity.effective_operational_capacity,
          0
        );
        v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
          'zone_id', v_entitlement.zone_id,
          'pax', v_entitlement.pax,
          'base_capacity', v_capacity.base_capacity,
          'temporary_capacity', v_capacity.temporary_capacity,
          'effective_capacity', v_capacity.effective_operational_capacity,
          'active_entitlement', v_capacity.active_entitlement_pax,
          'earlier_recovery_pax', v_reserved_pax,
          'available', greatest(
            v_capacity.effective_operational_capacity -
              v_capacity.active_entitlement_pax - v_reserved_pax,
            0
          ),
          'deficit', v_deficit
        ));
        if v_deficit > 0 then
          v_category := 'capacity_blocked';
        end if;
      end loop;

      if v_allocations = '[]'::jsonb then
        v_category := 'other_blocker';
      end if;
    end if;

    if v_category = 'restore_now' then
      for v_entitlement in
        select allocation ->> 'zone_id' as zone_id,
               (allocation ->> 'pax')::integer as pax
        from jsonb_array_elements(v_allocations) allocation
      loop
        v_key := v_booking.show_id::text || ':' || v_entitlement.zone_id;
        v_reserved := jsonb_set(
          v_reserved,
          array[v_key],
          to_jsonb(coalesce((v_reserved ->> v_key)::integer, 0) + v_entitlement.pax),
          true
        );
      end loop;
      v_restore_count := v_restore_count + 1;
      v_restore_pax := v_restore_pax + v_booking.guest_count;
    elsif v_category = 'capacity_blocked' then
      v_capacity_count := v_capacity_count + 1;
      v_capacity_pax := v_capacity_pax + v_booking.guest_count;
    elsif v_category = 'duplicate_replacement_review' then
      v_duplicate_count := v_duplicate_count + 1;
      v_duplicate_pax := v_duplicate_pax + v_booking.guest_count;
    elsif v_category = 'ineligible_manual_or_restricted' then
      v_ineligible_count := v_ineligible_count + 1;
      v_ineligible_pax := v_ineligible_pax + v_booking.guest_count;
    else
      v_other_count := v_other_count + 1;
      v_other_pax := v_other_pax + v_booking.guest_count;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'company_name', v_booking.company_name,
      'guest_count', v_booking.guest_count,
      'show_id', v_booking.show_id,
      'show_date', v_booking.show_date,
      'show_time', v_booking.show_time,
      'venue', v_booking.venue,
      'created_at', v_booking.created_at,
      'expired_at', v_booking.corporate_payment_expired_at,
      'expiry_audit_at', v_booking.expiry_audit_at,
      'pre_expiry_status', v_booking.expiry_before_values ->> 'booking_status',
      'pre_expiry_table_id', v_booking.expiry_before_values ->> 'table_id',
      'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'updated_at', v_booking.updated_at,
      'category', v_category,
      'allocations', v_allocations,
      'duplicate_references', to_jsonb(v_duplicate_references),
      'floor_assignment_required', true
    ));
  end loop;

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'order', 'booking.created_at, expiry audit timestamp, booking.id',
    'summary', jsonb_build_object(
      'total', jsonb_build_object('count', v_total_count, 'pax', v_total_pax),
      'restore_now', jsonb_build_object('count', v_restore_count, 'pax', v_restore_pax),
      'capacity_blocked', jsonb_build_object('count', v_capacity_count, 'pax', v_capacity_pax),
      'duplicate_replacement_review', jsonb_build_object('count', v_duplicate_count, 'pax', v_duplicate_pax),
      'ineligible_manual_or_restricted', jsonb_build_object('count', v_ineligible_count, 'pax', v_ineligible_pax),
      'other_blocker', jsonb_build_object('count', v_other_count, 'pax', v_other_pax)
    ),
    'bookings', v_results
  );
end;
$$;

revoke all on function public.preview_corporate_expiry_mass_recovery()
  from public, anon, authenticated;
grant execute on function public.preview_corporate_expiry_mass_recovery()
  to service_role;

create or replace function public.recover_system_expired_corporate_booking_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_request_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocations jsonb := '[]'::jsonb;
  v_booking public.bookings%rowtype;
  v_capacity record;
  v_duplicate_references text[];
  v_entitlement record;
  v_existing_audit uuid;
  v_new_status public.booking_status;
  v_now timestamptz := clock_timestamp();
  v_ticket_count integer := 0;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'CORPORATE_EXPIRY_RECOVERY_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking
  from public.bookings
  where booking_reference = upper(trim(p_booking_reference))
  for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select audit.id into v_existing_audit
  from public.audit_events audit
  where audit.action = 'corporate.booking.expiry-recovered'
    and audit.entity_id = v_booking.id::text
    and audit.request_id = trim(p_request_id)
    and audit.outcome = 'success'
  limit 1;
  if v_existing_audit is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'idempotent', true,
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status,
      'updated_at', v_booking.updated_at
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if v_booking.archived_at is not null
     or v_booking.booking_origin is distinct from 'corporate'
     or v_booking.booking_source <> 'corporate-direct'
     or v_booking.booking_status::text <> 'cancelled'
     or v_booking.corporate_payment_expired_at is null
     or not exists (
       select 1
       from public.audit_events expiry
       where expiry.entity_id = v_booking.id::text
         and expiry.action = 'corporate.payment_deadline.expired'
         and expiry.outcome = 'success'
     )
     or v_booking.payment_status::text in ('cancelled', 'refunded')
     or exists (
       select 1
       from public.payment_refunds refund
       where refund.booking_id = v_booking.id
         and refund.completed_at is not null
     )
     or exists (
       select 1
       from public.audit_events later_action
       where later_action.entity_id = v_booking.id::text
         and later_action.created_at > v_booking.corporate_payment_expired_at
         and later_action.outcome = 'success'
         and later_action.action in ('booking.cancel', 'booking.archive', 'booking.refund')
     ) then
    raise exception 'CORPORATE_EXPIRY_RECOVERY_NOT_ELIGIBLE';
  end if;

  select coalesce(array_agg(other.booking_reference order by other.created_at), '{}')
  into v_duplicate_references
  from public.bookings other
  where other.id <> v_booking.id
    and other.show_id = v_booking.show_id
    and other.archived_at is null
    and other.booking_status::text in ('new', 'pending_payment', 'confirmed', 'checked_in')
    and other.guest_count = v_booking.guest_count
    and (
      other.customer_id = v_booking.customer_id
      or (
        nullif(lower(regexp_replace(trim(other.company_name), '\\s+', ' ', 'g')), '') is not null
        and lower(regexp_replace(trim(other.company_name), '\\s+', ' ', 'g')) =
            lower(regexp_replace(trim(v_booking.company_name), '\\s+', ' ', 'g'))
      )
    )
    and not exists (
      select 1
      from public.duplicate_booking_review_dispositions disposition
      where disposition.decision = 'legitimate_separate_bookings'
        and disposition.record_ids @> array[v_booking.id, other.id]::uuid[]
    );
  if cardinality(v_duplicate_references) > 0 then
    raise exception 'CORPORATE_EXPIRY_RECOVERY_DUPLICATE_REVIEW|%',
      array_to_string(v_duplicate_references, ',');
  end if;

  for v_entitlement in
    select public.normalize_booking_capacity_zone(zone_id) as zone_id, pax
    from (
      select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
      from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
      union all
      select v_booking.section, v_booking.guest_count
      where v_booking.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_id) is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_booking.show_id::text || ':' || v_entitlement.zone_id, 0)
    );
    select * into v_capacity
    from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);
    if v_capacity.active_entitlement_pax + v_entitlement.pax >
       v_capacity.effective_operational_capacity then
      raise exception 'CORPORATE_EXPIRY_RECOVERY_CAPACITY_EXCEEDED|%|%|%|%|%',
        v_entitlement.zone_id,
        v_entitlement.pax,
        v_capacity.active_entitlement_pax,
        v_capacity.effective_operational_capacity,
        v_capacity.active_entitlement_pax + v_entitlement.pax -
          v_capacity.effective_operational_capacity;
    end if;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'zone_id', v_entitlement.zone_id,
      'pax', v_entitlement.pax,
      'active_entitlement_before', v_capacity.active_entitlement_pax,
      'active_entitlement_after', v_capacity.active_entitlement_pax + v_entitlement.pax,
      'effective_capacity', v_capacity.effective_operational_capacity,
      'available_after', v_capacity.effective_operational_capacity -
        v_capacity.active_entitlement_pax - v_entitlement.pax
    ));
  end loop;

  if v_allocations = '[]'::jsonb then
    raise exception 'CORPORATE_EXPIRY_RECOVERY_ZONE_INVALID';
  end if;

  v_new_status := case
    when v_booking.payment_status::text in ('fully_paid', 'comp_vip')
      or (
        coalesce(v_booking.total_amount, 0) > 0
        and coalesce(v_booking.amount_paid, 0) >= coalesce(v_booking.total_amount, 0)
      )
      then 'confirmed'::public.booking_status
    else 'pending_payment'::public.booking_status
  end;

  update public.bookings
  set booking_status = v_new_status,
      corporate_payment_protected_at = case
        when coalesce(amount_paid, 0) > 0
          then coalesce(corporate_payment_protected_at, v_now)
        else corporate_payment_protected_at
      end,
      table_id = null,
      updated_at = v_now
  where id = v_booking.id;

  if v_new_status = 'confirmed'::public.booking_status then
    update public.booking_payment_links
    set revoked_at = v_now, status = 'revoked', updated_at = v_now
    where booking_id = v_booking.id and status = 'active';
  end if;

  update public.tickets
  set ticket_status = case when ticket_status = 'cancelled' then 'valid' else ticket_status end,
      updated_at = v_now
  where booking_id = v_booking.id
    and ticket_status not in ('refunded', 'void', 'checked_in');
  get diagnostics v_ticket_count = row_count;

  insert into public.booking_lifecycle_events (
    booking_id, created_at, from_status, note, reason, to_status
  ) values (
    v_booking.id,
    v_now,
    'cancelled',
    format('System-expired Corporate booking recovered by %s.', trim(p_actor_name)),
    'Management-authorised emergency recovery; live capacity validated and financial state preserved.',
    v_new_status
  );

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'corporate.booking.expiry-recovered',
    '{}'::text[],
    trim(p_actor_name),
    jsonb_build_object(
      'booking_status', v_new_status,
      'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'allocations', v_allocations,
      'floor_assignment_required', true,
      'tickets_updated', v_ticket_count,
      'corporate_payment_expired_at', v_booking.corporate_payment_expired_at
    ),
    jsonb_build_object(
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'expired_at', v_booking.corporate_payment_expired_at
    ),
    array['booking_status', 'corporate_payment_protected_at'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    'Management-authorised emergency recovery; live capacity validated and financial state preserved.',
    trim(p_request_id),
    'Emergency Corporate Expiry Recovery'
  );

  return jsonb_build_object(
    'status', 'processed',
    'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'booking_status', v_new_status,
    'payment_status', v_booking.payment_status,
    'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_booking.balance_outstanding,
    'allocations', v_allocations,
    'floor_assignment_required', true,
    'tickets_updated', v_ticket_count,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.recover_system_expired_corporate_booking_atomic(
  text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.recover_system_expired_corporate_booking_atomic(
  text, timestamptz, text, text
) to service_role;

comment on function public.preview_corporate_expiry_mass_recovery() is
  'Read-only deterministic recovery classification for current/future Corporate bookings with immutable automated-expiry evidence.';
comment on function public.recover_system_expired_corporate_booking_atomic(text, timestamptz, text, text) is
  'Restores one proven system-expired Corporate booking without changing its financial truth or assigning a table.';
