-- P0: guest-count increases must preserve a valid regenerated per-guest ticket
-- instead of treating its void predecessor as the active canonical identity.

create or replace function public.reconcile_per_guest_ticket_population(
  p_booking_id uuid,
  p_actor_name text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_created_codes text[] := '{}';
  v_expected_codes text[];
  v_family_prefix text;
  v_issued_at timestamptz;
  v_metadata jsonb;
  v_metadata_tickets jsonb;
begin
  select booking.*
    into v_booking
    from public.bookings booking
   where booking.id = p_booking_id
   for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  if v_booking.notes is null
     or not v_booking.notes like '__zingara_booking_meta__:%' then
    return jsonb_build_object('status', 'not_per_guest', 'created_count', 0);
  end if;
  begin
    v_metadata := substring(
      v_booking.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
  exception when others then
    raise exception 'TICKET_POPULATION_METADATA_INVALID';
  end;
  v_metadata_tickets := v_metadata -> 'guestTickets';
  if jsonb_typeof(v_metadata_tickets) is distinct from 'array'
     or jsonb_array_length(v_metadata_tickets) = 0 then
    return jsonb_build_object('status', 'not_per_guest', 'created_count', 0);
  end if;

  select regexp_replace(item ->> 'ticketCode', '[0-9]+(R[A-Z0-9]+)?$', '')
    into v_family_prefix
    from jsonb_array_elements(v_metadata_tickets) item
   order by coalesce((item ->> 'index')::integer, 1)
   limit 1;
  if nullif(v_family_prefix, '') is null
     or exists (
       select 1
       from jsonb_array_elements(v_metadata_tickets) item
       where regexp_replace(
         item ->> 'ticketCode', '[0-9]+(R[A-Z0-9]+)?$', ''
       ) <> v_family_prefix
     ) then
    raise exception 'TICKET_POPULATION_FAMILY_AMBIGUOUS';
  end if;

  -- A regenerated ticket is the authoritative identity for its guest index when
  -- metadata points to it and the persisted ticket is still active. Otherwise
  -- retain the canonical identity and its terminal-state safety check.
  select array_agg(
    coalesce(active_identity.ticket_code, expected.canonical_code)
    order by expected.ticket_index
  )
    into v_expected_codes
    from (
      select
        ticket_index,
        v_family_prefix || case
          when ticket_index < 100 then lpad(ticket_index::text, 2, '0')
          else ticket_index::text
        end as canonical_code
      from generate_series(1, v_booking.guest_count) ticket_index
    ) expected
    left join lateral (
      select ticket.ticket_code
      from jsonb_array_elements(v_metadata_tickets) item
      join public.tickets ticket
        on ticket.booking_id = v_booking.id
       and ticket.ticket_code = item ->> 'ticketCode'
       and ticket.ticket_status::text in ('issued', 'valid', 'checked_in')
      where coalesce((item ->> 'index')::integer, 1) = expected.ticket_index
      limit 1
    ) active_identity on true;

  if exists (
    select 1
    from public.tickets ticket
    where ticket.booking_id = v_booking.id
      and ticket.ticket_code = any(v_expected_codes)
      and ticket.ticket_status::text in ('cancelled', 'expired', 'refunded', 'void')
  ) then
    raise exception 'TICKET_POPULATION_TERMINAL_IDENTITY_REVIEW_REQUIRED';
  end if;

  select coalesce(
    nullif(v_metadata ->> 'ticketIssuedAt', '')::timestamptz,
    min(ticket.issued_at),
    v_booking.created_at,
    clock_timestamp()
  )
    into v_issued_at
    from public.tickets ticket
   where ticket.booking_id = v_booking.id
     and ticket.ticket_code like v_family_prefix || '%';

  with missing as (
    select code
    from unnest(v_expected_codes) code
    where not exists (
      select 1 from public.tickets ticket where ticket.ticket_code = code
    )
  ), inserted as (
    insert into public.tickets (
      booking_id, issued_at, qr_payload, ticket_code, ticket_status, ticket_url
    )
    select
      v_booking.id,
      v_issued_at,
      missing.code,
      missing.code,
      'valid',
      '/ticket/' || missing.code
    from missing
    order by missing.code
    returning ticket_code
  )
  select coalesce(array_agg(ticket_code order by ticket_code), '{}')
    into v_created_codes
    from inserted;

  if cardinality(v_created_codes) = 0 then
    return jsonb_build_object(
      'status', 'already_complete',
      'created_count', 0,
      'booking_reference', v_booking.booking_reference
    );
  end if;

  select jsonb_agg(
    case
      when existing.item is not null then
        jsonb_set(existing.item, '{total}', to_jsonb(v_booking.guest_count), true)
      else jsonb_build_object(
        'email', '',
        'fullName', 'Guest ' || expected.ticket_index,
        'id', v_booking.booking_reference || '-' || expected.ticket_index,
        'index', expected.ticket_index,
        'mobile', '',
        'status', 'valid',
        'ticketCode', expected.ticket_code,
        'total', v_booking.guest_count
      )
    end
    order by expected.ticket_index
  )
    into v_metadata_tickets
    from (
      select
        ticket_index,
        v_expected_codes[ticket_index] as ticket_code
      from generate_series(1, v_booking.guest_count) ticket_index
    ) expected
    left join lateral (
      select item
      from jsonb_array_elements(v_metadata -> 'guestTickets') item
      where coalesce((item ->> 'index')::integer, 1) = expected.ticket_index
      limit 1
    ) existing on true;

  v_metadata := jsonb_set(v_metadata, '{guestTickets}', v_metadata_tickets, true);
  update public.bookings
     set notes = '__zingara_booking_meta__:' || v_metadata::text
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'booking.missing-guest-tickets-reconciled',
    '{}'::text[],
    coalesce(nullif(trim(p_actor_name), ''), 'SYSTEM'),
    jsonb_build_object(
      'guest_count', v_booking.guest_count,
      'created_ticket_codes', to_jsonb(v_created_codes),
      'created_count', cardinality(v_created_codes),
      'valid_per_guest_ticket_count', v_booking.guest_count
    ),
    jsonb_build_object(
      'guest_count', v_booking.guest_count,
      'persisted_per_guest_ticket_count',
        v_booking.guest_count - cardinality(v_created_codes)
    ),
    array['guestTickets', 'tickets'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    coalesce(
      nullif(trim(p_reason), ''),
      'Canonical per-guest ticket population reconciled to authoritative pax.'
    ),
    nullif(trim(p_request_id), ''),
    'Ticket Integrity'
  );

  return jsonb_build_object(
    'status', 'processed',
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'guest_count', v_booking.guest_count,
    'created_ticket_codes', v_created_codes,
    'created_count', cardinality(v_created_codes),
    'valid_per_guest_ticket_count', v_booking.guest_count
  );
end;
$$;

revoke all on function public.reconcile_per_guest_ticket_population(
  uuid, text, text, text
) from public, anon, authenticated;
