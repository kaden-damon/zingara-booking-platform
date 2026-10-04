-- Emergency P0 continuation: permit the final management-approved FNB recovery
-- with no more than the single operational Middle Ring seat proven necessary.

create or replace function public.recover_fnb_system_expired_corporate_booking_atomic(
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
  v_added integer;
  v_after record;
  v_before record;
  v_booking record;
  v_existing_audit uuid;
  v_recovery jsonb;
begin
  if p_expected_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'FNB_CORPORATE_RECOVERY_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('ZNG-N5GDTU'));
  select booking.*, show_row.date as show_date, show_row.time as show_time,
         show_row.venue as show_venue
    into v_booking
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
   where booking.booking_reference = 'ZNG-N5GDTU'
   for update of booking;
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
  if v_booking.booking_origin is distinct from 'corporate'
     or v_booking.booking_source <> 'corporate-direct'
     or v_booking.booking_status::text <> 'cancelled'
     or v_booking.archived_at is not null
     or v_booking.show_venue::text <> 'johannesburg'
     or v_booking.show_date <> date '2026-11-26'
     or v_booking.show_time <> time '17:00:00'
     or v_booking.guest_count <> 12
     or public.normalize_booking_capacity_zone(v_booking.section) <> 'middle-ring'
     or v_booking.zone_entitlements is not null
     or v_booking.corporate_payment_expired_at is null then
    raise exception 'FNB_CORPORATE_RECOVERY_BOOKING_CHANGED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_booking.show_id::text || ':middle-ring', 0)
  );
  select * into v_before
    from public.booking_capacity_zone_state(v_booking.show_id, 'middle-ring');
  if v_before.effective_operational_capacity is null then
    raise exception 'FNB_CORPORATE_RECOVERY_ZONE_INVALID';
  end if;

  v_added := greatest(
    v_before.active_entitlement_pax + v_booking.guest_count -
      v_before.effective_operational_capacity,
    0
  );
  if v_added > 1 then
    raise exception 'FNB_CORPORATE_RECOVERY_REAPPROVAL_REQUIRED|%|1', v_added;
  end if;

  if v_added > 0 then
    insert into public.show_zone_operational_capacity_adjustments (
      show_id, zone_id, seats, booking_id, booking_reference,
      approved_maximum, request_id, actor_name, reason
    ) values (
      v_booking.show_id, 'middle-ring', v_added, v_booking.id,
      v_booking.booking_reference, 1, trim(p_request_id), trim(p_actor_name),
      'Corporate auto-expiry recovery'
    );
  end if;

  select * into v_after
    from public.booking_capacity_zone_state(v_booking.show_id, 'middle-ring');
  if v_after.active_entitlement_pax + v_booking.guest_count >
     v_after.effective_operational_capacity then
    raise exception 'FNB_CORPORATE_RECOVERY_CAPACITY_EXCEEDED';
  end if;

  v_recovery := public.recover_system_expired_corporate_booking_atomic(
    v_booking.booking_reference,
    p_expected_updated_at,
    trim(p_request_id),
    trim(p_actor_name)
  );

  if v_added > 0 then
    insert into public.audit_events (
      action, actor_location_scope, actor_name, after_values, before_values,
      changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
      request_id, source_area
    ) values (
      'show.zone-operational-capacity.approved-added',
      '{}'::text[],
      trim(p_actor_name),
      jsonb_build_object(
        'show_id', v_booking.show_id,
        'zone_id', 'middle-ring',
        'temporary_capacity', v_after.temporary_capacity,
        'effective_capacity', v_after.effective_operational_capacity,
        'booking_reference', v_booking.booking_reference,
        'temporary_addition', v_added
      ),
      jsonb_build_object(
        'show_id', v_booking.show_id,
        'zone_id', 'middle-ring',
        'temporary_capacity', v_before.temporary_capacity,
        'effective_capacity', v_before.effective_operational_capacity,
        'active_entitlement', v_before.active_entitlement_pax
      ),
      array['temporary_operational_capacity'],
      v_booking.show_id::text,
      v_booking.booking_reference,
      'show',
      'success',
      'Corporate auto-expiry recovery',
      trim(p_request_id) || ':middle-ring',
      'Emergency Corporate Expiry Recovery'
    );
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'base_capacity', v_after.base_capacity,
    'temporary_capacity_added', v_added,
    'temporary_capacity_after', v_after.temporary_capacity,
    'effective_operational_capacity_after', v_after.effective_operational_capacity,
    'active_entitlement_before_restore', v_after.active_entitlement_pax,
    'active_entitlement_after_restore',
      v_after.active_entitlement_pax + v_booking.guest_count,
    'recovery', v_recovery
  );
end;
$$;

revoke all on function public.recover_fnb_system_expired_corporate_booking_atomic(
  timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.recover_fnb_system_expired_corporate_booking_atomic(
  timestamptz, text, text
) to service_role;

comment on function public.recover_fnb_system_expired_corporate_booking_atomic(
  timestamptz, text, text
) is
  'Hard-bounded recovery for ZNG-N5GDTU: at most one show-specific Middle Ring operational seat, then same-identity Corporate recovery.';

-- Both Corporate expiry candidates already have a proven active survivor. Record
-- the evidence-backed resolution without restoring or otherwise mutating either
-- booking pair.
select public.record_duplicate_booking_review_disposition_atomic(
  array['DP-JHB-A6E9AD454CE4', 'ZNG-TGYRT2']::text[],
  'confirmed_duplicate_resolved',
  'Kaden Damon',
  'DP-JHB-A6E9AD454CE4',
  array['ZNG-TGYRT2']::text[],
  0,
  'System · Emergency P0 Continuation',
  'Preserve the imported, fully paid KLM Motors booking; the cancelled Corporate row is duplicate expiry residue.',
  jsonb_build_object(
    'resolution', 'active survivor retained; cancelled residue not restored',
    'financial_mutation', false,
    'entitlement_mutation', false
  )
);

select public.record_duplicate_booking_review_disposition_atomic(
  array['ZNG-CY6SKZ', 'ZNG-8X6CHC']::text[],
  'confirmed_duplicate_resolved',
  'Kaden Damon',
  'ZNG-CY6SKZ',
  array['ZNG-8X6CHC']::text[],
  0,
  'System · Emergency P0 Continuation',
  'Preserve the later active MIH Holdings replacement; the cancelled pre-expiry row is duplicate residue.',
  jsonb_build_object(
    'resolution', 'active survivor retained; cancelled residue not restored',
    'financial_mutation', false,
    'entitlement_mutation', false
  )
);
