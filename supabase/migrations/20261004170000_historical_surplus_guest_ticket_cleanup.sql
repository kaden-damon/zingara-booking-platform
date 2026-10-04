-- Emergency P0: hard-bounded cleanup for the remaining proven historical
-- per-guest ticket surpluses. Booking-level ticket identities are preserved.

create or replace function public.cleanup_historical_surplus_guest_tickets_atomic(
  p_booking_reference text,
  p_expected_booking_updated_at timestamptz,
  p_request_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_existing_audit uuid;
  v_expected_booking_id uuid;
  v_expected_guest_count integer;
  v_expected_historical_count integer;
  v_expected_total_ticket_rows integer;
  v_expected_booking_level_code text;
  v_family_prefix text;
  v_expected_keep text[];
  v_expected_void text[];
  v_actual_keep text[];
  v_actual_void text[];
  v_voided integer;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_booking_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'TICKET_CLEANUP_INPUT_INVALID';
  end if;

  case trim(p_booking_reference)
    when 'ZNG-98R23K' then
      v_expected_booking_id := '4dbb5a88-e256-4ed1-8975-38f1f5d8db44';
      v_expected_guest_count := 56;
      v_expected_historical_count := 65;
      v_expected_total_ticket_rows := 65;
      v_family_prefix := 'ZNG-98R23K-';
    when 'ZNG-KEE532' then
      v_expected_booking_id := 'f80f1ce1-8fe2-4d89-9c0f-c9ef9d317720';
      v_expected_guest_count := 21;
      v_expected_historical_count := 28;
      v_expected_total_ticket_rows := 28;
      v_family_prefix := 'ZNG-KEE532-';
    when 'DP-76BGPC' then
      v_expected_booking_id := 'd67a7e77-eaf4-4ba3-96d7-526ab94e9dd5';
      v_expected_guest_count := 32;
      v_expected_historical_count := 38;
      v_expected_total_ticket_rows := 39;
      v_expected_booking_level_code := 'DP-76BGPC-01';
      v_family_prefix := 'ZQR-DP76BGPC-9JH-';
    when 'ZNG-YNHL4M' then
      v_expected_booking_id := 'd195a4a6-a14c-4c33-a731-4cd629a189ac';
      v_expected_guest_count := 13;
      v_expected_historical_count := 14;
      v_expected_total_ticket_rows := 14;
      v_family_prefix := 'ZNG-YNHL4M-';
    when 'ZNG-6BBP4D' then
      v_expected_booking_id := '123398d5-0fa9-4943-b5a3-08761c23ead4';
      v_expected_guest_count := 12;
      v_expected_historical_count := 13;
      v_expected_total_ticket_rows := 13;
      v_family_prefix := 'ZNG-6BBP4D-';
    else
      raise exception 'TICKET_CLEANUP_BOOKING_NOT_AUTHORIZED';
  end case;

  perform pg_advisory_xact_lock(hashtext(trim(p_booking_reference)));

  select booking.*, show_row.date as show_date, show_row.time as show_time,
         show_row.venue as show_venue
    into v_booking
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
   where booking.booking_reference = trim(p_booking_reference)
   for update of booking;

  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select audit.id
    into v_existing_audit
    from public.audit_events audit
   where audit.action = 'booking.surplus-guest-tickets-invalidated'
     and audit.entity_id = v_booking.id::text
     and audit.request_id = trim(p_request_id)
     and audit.outcome = 'success'
   limit 1;
  if v_existing_audit is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'idempotent', true,
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_booking_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if v_booking.id <> v_expected_booking_id
     or v_booking.guest_count <> v_expected_guest_count
     or v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded') then
    raise exception 'TICKET_CLEANUP_BOOKING_CHANGED';
  end if;

  -- These financial and show assertions ensure the cleanup cannot silently run
  -- after an unrelated booking mutation.
  if (v_booking.booking_reference = 'ZNG-98R23K' and (
        v_booking.show_venue::text <> 'cape-town'
        or v_booking.show_date <> date '2026-11-18'
        or v_booking.show_time <> time '18:00:00'
        or v_booking.section <> 'Private Booths'
        or v_booking.total_amount <> 113220
        or v_booking.amount_paid <> 113220
        or v_booking.balance_outstanding <> 0
      ))
     or (v_booking.booking_reference = 'ZNG-KEE532' and (
        v_booking.show_venue::text <> 'johannesburg'
        or v_booking.show_date <> date '2026-11-20'
        or v_booking.show_time <> time '17:00:00'
        or v_booking.section <> 'Middle Ring'
        or v_booking.total_amount <> 49140
        or v_booking.amount_paid <> 0
        or v_booking.balance_outstanding <> 49140
      ))
     or (v_booking.booking_reference = 'DP-76BGPC' and (
        v_booking.show_venue::text <> 'johannesburg'
        or v_booking.show_date <> date '2026-10-17'
        or v_booking.show_time <> time '17:00:00'
        or v_booking.section <> 'Golden Circle'
        or v_booking.total_amount <> 65835
        or v_booking.amount_paid <> 65835
        or v_booking.balance_outstanding <> 0
      ))
     or (v_booking.booking_reference = 'ZNG-YNHL4M' and (
        v_booking.show_venue::text <> 'johannesburg'
        or v_booking.show_date <> date '2026-10-09'
        or v_booking.show_time <> time '17:00:00'
        or v_booking.section <> 'Golden Circle'
        or v_booking.total_amount <> 27335
        or v_booking.amount_paid <> 24255
        or v_booking.balance_outstanding <> 3080
      ))
     or (v_booking.booking_reference = 'ZNG-6BBP4D' and (
        v_booking.show_venue::text <> 'cape-town'
        or v_booking.show_date <> date '2026-10-24'
        or v_booking.show_time <> time '18:00:00'
        or v_booking.section <> 'Golden Circle'
        or v_booking.total_amount <> 22523
        or v_booking.amount_paid <> 22523
        or v_booking.balance_outstanding <> 0
      )) then
    raise exception 'TICKET_CLEANUP_BOOKING_CHANGED';
  end if;

  select array_agg(
    v_family_prefix || lpad(ticket_index::text, 2, '0') order by ticket_index
  ) into v_expected_keep
    from generate_series(1, v_expected_guest_count) ticket_index;
  select array_agg(
    v_family_prefix || lpad(ticket_index::text, 2, '0') order by ticket_index
  ) into v_expected_void
    from generate_series(
      v_expected_guest_count + 1,
      v_expected_historical_count
    ) ticket_index;

  select array_agg(ticket.ticket_code order by ticket.ticket_code)
    into v_actual_keep
    from public.tickets ticket
   where ticket.booking_id = v_booking.id
     and ticket.ticket_code = any(v_expected_keep)
     and ticket.ticket_status::text in ('issued', 'valid', 'checked_in');
  select array_agg(ticket.ticket_code order by ticket.ticket_code)
    into v_actual_void
    from public.tickets ticket
   where ticket.booking_id = v_booking.id
     and ticket.ticket_code = any(v_expected_void)
     and ticket.ticket_status::text = 'valid';

  if v_actual_keep is distinct from v_expected_keep
     or v_actual_void is distinct from v_expected_void
     or (select count(*) from public.tickets where booking_id = v_booking.id)
        <> v_expected_total_ticket_rows
     or exists (
       select 1 from public.tickets ticket
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code like v_family_prefix || '%'
         and ticket.ticket_code <> all(v_expected_keep)
         and ticket.ticket_code <> all(v_expected_void)
     )
     or (v_expected_booking_level_code is not null and not exists (
       select 1 from public.tickets ticket
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code = v_expected_booking_level_code
         and ticket.ticket_status::text = 'valid'
     ))
     or exists (
       select 1
       from public.ticket_validations validation
       join public.tickets ticket on ticket.id = validation.ticket_id
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code = any(v_expected_void)
     )
     or exists (
       select 1
       from public.apple_wallet_registrations registration
       join public.tickets ticket on ticket.id = registration.ticket_id
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code = any(v_expected_void)
     ) then
    raise exception 'TICKET_CLEANUP_TICKET_STATE_CHANGED';
  end if;

  update public.tickets
     set ticket_status = 'void', updated_at = clock_timestamp()
   where booking_id = v_booking.id
     and ticket_code = any(v_expected_void)
     and ticket_status::text = 'valid';
  get diagnostics v_voided = row_count;
  if v_voided <> cardinality(v_expected_void) then
    raise exception 'TICKET_CLEANUP_COUNT_MISMATCH';
  end if;

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'booking.surplus-guest-tickets-invalidated',
    '{}'::text[],
    trim(p_actor_name),
    jsonb_build_object(
      'guest_count', v_expected_guest_count,
      'valid_ticket_codes', to_jsonb(v_expected_keep),
      'void_ticket_codes', to_jsonb(v_expected_void),
      'valid_per_guest_ticket_count', v_expected_guest_count,
      'voided_count', cardinality(v_expected_void),
      'booking_level_ticket_preserved', v_expected_booking_level_code
    ),
    jsonb_build_object(
      'guest_count', v_expected_guest_count,
      'active_per_guest_ticket_count', v_expected_historical_count
    ),
    array['ticket_status'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    'Management-authorised reconciliation of proven historical surplus per-guest ticket identities.',
    trim(p_request_id),
    'Emergency Ticket Integrity Cleanup'
  );

  return jsonb_build_object(
    'status', 'processed',
    'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'guest_count', v_expected_guest_count,
    'valid_ticket_codes', v_expected_keep,
    'void_ticket_codes', v_expected_void,
    'booking_level_ticket_preserved', v_expected_booking_level_code,
    'valid_per_guest_ticket_count', v_expected_guest_count,
    'voided_count', cardinality(v_expected_void)
  );
end;
$$;

revoke all on function public.cleanup_historical_surplus_guest_tickets_atomic(
  text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.cleanup_historical_surplus_guest_tickets_atomic(
  text, timestamptz, text, text
) to service_role;

comment on function public.cleanup_historical_surplus_guest_tickets_atomic(
  text, timestamptz, text, text
) is
  'Hard-bounded, revision-protected cleanup for five proven historical per-guest ticket surplus populations.';
