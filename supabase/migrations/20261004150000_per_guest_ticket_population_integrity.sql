-- Emergency P0: keep persisted per-guest ticket rows aligned with the
-- authoritative current guest-ticket metadata without affecting legacy
-- booking-level ticket identities.

create or replace function public.guard_surplus_guest_ticket_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized boolean := false;
  v_booking record;
  v_family boolean := false;
  v_metadata jsonb;
begin
  if old.ticket_status::text <> 'cancelled'
     or new.ticket_status::text not in ('issued', 'valid', 'checked_in') then
    return new;
  end if;

  select booking.id, booking.guest_count, booking.notes
    into v_booking
    from public.bookings booking
   where booking.id = new.booking_id;
  if v_booking.id is null
     or v_booking.notes is null
     or not v_booking.notes like '__zingara_booking_meta__:%' then
    return new;
  end if;

  begin
    v_metadata := substring(
      v_booking.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
  exception when others then
    return new;
  end;
  if jsonb_typeof(v_metadata -> 'guestTickets') is distinct from 'array' then
    return new;
  end if;

  select
    coalesce(bool_or(item ->> 'ticketCode' = new.ticket_code), false),
    coalesce(bool_or(
      regexp_replace(item ->> 'ticketCode', '[0-9]+(R[A-Z0-9]+)?$', '') =
      regexp_replace(new.ticket_code, '[0-9]+(R[A-Z0-9]+)?$', '')
    ), false)
    into v_authorized, v_family
    from jsonb_array_elements(v_metadata -> 'guestTickets') item
   where coalesce((item ->> 'index')::integer, 1) <= v_booking.guest_count;

  if v_family and not v_authorized then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_surplus_guest_ticket_reactivation()
  from public, anon, authenticated;

drop trigger if exists tickets_guard_surplus_guest_reactivation
  on public.tickets;
create trigger tickets_guard_surplus_guest_reactivation
  before update of ticket_status on public.tickets
  for each row execute function public.guard_surplus_guest_ticket_reactivation();

create or replace function public.reconcile_guest_tickets_after_pax_reduction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_surplus_codes text[] := '{}';
  v_surplus_ids uuid[] := '{}';
begin
  if new.guest_count >= old.guest_count
     or new.notes is null
     or not new.notes like '__zingara_booking_meta__:%' then
    return new;
  end if;

  begin
    v_metadata := substring(
      new.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
  exception when others then
    return new;
  end;
  if jsonb_typeof(v_metadata -> 'guestTickets') is distinct from 'array' then
    return new;
  end if;

  with authorized as (
    select
      item ->> 'ticketCode' as ticket_code,
      regexp_replace(
        item ->> 'ticketCode', '[0-9]+(R[A-Z0-9]+)?$', ''
      ) as family_prefix
    from jsonb_array_elements(v_metadata -> 'guestTickets') item
    where coalesce((item ->> 'index')::integer, 1) <= new.guest_count
  ), surplus as (
    select ticket.id, ticket.ticket_code
    from public.tickets ticket
    where ticket.booking_id = new.id
      and ticket.ticket_status::text in ('issued', 'valid', 'expired', 'checked_in')
      and not exists (
        select 1 from authorized where authorized.ticket_code = ticket.ticket_code
      )
      and exists (
        select 1 from authorized
        where authorized.family_prefix = regexp_replace(
          ticket.ticket_code, '[0-9]+(R[A-Z0-9]+)?$', ''
        )
      )
  )
  select
    coalesce(array_agg(surplus.id order by surplus.ticket_code), '{}'),
    coalesce(array_agg(surplus.ticket_code order by surplus.ticket_code), '{}')
    into v_surplus_ids, v_surplus_codes
    from surplus;

  if cardinality(v_surplus_ids) = 0 then
    return new;
  end if;
  if exists (
    select 1 from public.tickets ticket
    where ticket.id = any(v_surplus_ids)
      and (
        ticket.ticket_status::text = 'checked_in'
        or exists (
          select 1 from public.ticket_validations validation
          where validation.ticket_id = ticket.id
            and validation.result::text = 'accepted'
        )
      )
  ) then
    raise exception 'TICKET_SURVIVOR_REVIEW_REQUIRED';
  end if;

  update public.tickets
     set ticket_status = 'void', updated_at = clock_timestamp()
   where id = any(v_surplus_ids)
     and ticket_status::text in ('issued', 'valid', 'expired');

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    source_area
  ) values (
    'booking.guest-ticket-population-reconciled',
    '{}'::text[],
    'SYSTEM',
    jsonb_build_object(
      'guest_count', new.guest_count,
      'invalidated_ticket_codes', to_jsonb(v_surplus_codes),
      'invalidated_count', cardinality(v_surplus_codes)
    ),
    jsonb_build_object('guest_count', old.guest_count),
    array['ticket_status'],
    new.id::text,
    new.booking_reference,
    'booking',
    'success',
    'Per-guest ticket population reconciled after guest-count reduction.',
    'Bookings'
  );
  return new;
end;
$$;

revoke all on function public.reconcile_guest_tickets_after_pax_reduction()
  from public, anon, authenticated;

drop trigger if exists bookings_reconcile_guest_tickets_after_pax_reduction
  on public.bookings;
create trigger bookings_reconcile_guest_tickets_after_pax_reduction
  after update of guest_count, notes on public.bookings
  for each row
  when (new.guest_count < old.guest_count)
  execute function public.reconcile_guest_tickets_after_pax_reduction();

create or replace function public.cleanup_zng_9g8l48_surplus_tickets_atomic(
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
  v_expected_keep text[];
  v_expected_void text[];
  v_keep text[];
  v_metadata jsonb;
  v_void text[];
  v_voided integer;
begin
  if p_expected_booking_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'TICKET_CLEANUP_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('ZNG-9G8L48'));
  select booking.*, show_row.date as show_date, show_row.time as show_time,
         show_row.venue as show_venue
    into v_booking
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
   where booking.booking_reference = 'ZNG-9G8L48'
   for update of booking;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select audit.id into v_existing_audit
    from public.audit_events audit
   where audit.action = 'booking.surplus-guest-tickets-invalidated'
     and audit.entity_id = v_booking.id::text
     and audit.request_id = trim(p_request_id)
     and audit.outcome = 'success'
   limit 1;
  if v_existing_audit is not null then
    return jsonb_build_object(
      'status', 'already_processed', 'idempotent', true,
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_booking_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if v_booking.id <> '3876f62f-ddf0-4f29-a75b-314e7cf810b7'::uuid
     or v_booking.guest_count <> 28
     or v_booking.booking_origin is distinct from 'corporate'
     or v_booking.booking_source <> 'corporate-direct'
     or v_booking.booking_status::text <> 'pending_payment'
     or v_booking.section <> 'Private Booths'
     or v_booking.show_venue::text <> 'johannesburg'
     or v_booking.show_date <> date '2026-12-11'
     or v_booking.show_time <> time '17:00:00'
     or v_booking.total_amount <> 64800
     or v_booking.amount_paid <> 0
     or v_booking.balance_outstanding <> 64800 then
    raise exception 'TICKET_CLEANUP_BOOKING_CHANGED';
  end if;

  begin
    v_metadata := substring(
      v_booking.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
  exception when others then
    raise exception 'TICKET_CLEANUP_METADATA_INVALID';
  end;
  select array_agg(
    format('ZNG-9G8L48-%s', lpad(ticket_index::text, 2, '0'))
    order by ticket_index
  ) into v_expected_keep
    from generate_series(1, 28) ticket_index;
  select array_agg(
    format('ZNG-9G8L48-%s', lpad(ticket_index::text, 2, '0'))
    order by ticket_index
  ) into v_expected_void
    from generate_series(29, 40) ticket_index;
  select array_agg(item ->> 'ticketCode' order by (item ->> 'index')::integer)
    into v_keep
    from jsonb_array_elements(v_metadata -> 'guestTickets') item
   where (item ->> 'index')::integer <= 28;
  if v_keep is distinct from v_expected_keep
     or jsonb_array_length(v_metadata -> 'guestTickets') <> 28 then
    raise exception 'TICKET_CLEANUP_SURVIVOR_SET_CHANGED';
  end if;

  select array_agg(ticket.ticket_code order by ticket.ticket_code)
    into v_void
    from public.tickets ticket
   where ticket.booking_id = v_booking.id
     and ticket.ticket_code = any(v_expected_void)
     and ticket.ticket_status::text = 'valid';
  if v_void is distinct from v_expected_void
     or (select count(*) from public.tickets where booking_id = v_booking.id) <> 40
     or exists (
       select 1 from public.tickets ticket
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code = any(v_expected_keep)
         and ticket.ticket_status::text <> 'valid'
     )
     or exists (
       select 1 from public.ticket_validations validation
       join public.tickets ticket on ticket.id = validation.ticket_id
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code = any(v_expected_void)
     )
     or exists (
       select 1 from public.apple_wallet_registrations registration
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
  if v_voided <> 12 then raise exception 'TICKET_CLEANUP_COUNT_MISMATCH'; end if;

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'booking.surplus-guest-tickets-invalidated',
    '{}'::text[],
    trim(p_actor_name),
    jsonb_build_object(
      'guest_count', 28,
      'valid_ticket_codes', to_jsonb(v_expected_keep),
      'void_ticket_codes', to_jsonb(v_expected_void),
      'valid_ticket_count', 28,
      'void_ticket_count', 12
    ),
    jsonb_build_object(
      'guest_count', 28,
      'valid_ticket_count', 40,
      'void_ticket_count', 0
    ),
    array['ticket_status'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    'Invalidate surplus historical per-guest tickets after the authoritative 40 to 28 guest reduction.',
    trim(p_request_id),
    'Emergency Ticket Integrity Cleanup'
  );

  return jsonb_build_object(
    'status', 'processed', 'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'guest_count', 28,
    'valid_ticket_codes', v_expected_keep,
    'void_ticket_codes', v_expected_void,
    'valid_ticket_count', 28,
    'void_ticket_count', 12
  );
end;
$$;

revoke all on function public.cleanup_zng_9g8l48_surplus_tickets_atomic(
  timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.cleanup_zng_9g8l48_surplus_tickets_atomic(
  timestamptz, text, text
) to service_role;

comment on function public.cleanup_zng_9g8l48_surplus_tickets_atomic(
  timestamptz, text, text
) is
  'Hard-bounded cleanup for ZNG-9G8L48: preserve canonical tickets 01-28 and void unscanned, unregistered historical tickets 29-40.';
