-- P0: preserve ticket identities across guest reductions/increases and make
-- guest-ticket regeneration one atomic, auditable operation.

alter table public.tickets
  add column if not exists replaced_by_ticket_id uuid
    references public.tickets(id) on delete restrict,
  add column if not exists replacement_recorded_at timestamptz;

alter table public.tickets
  drop constraint if exists tickets_replacement_not_self;
alter table public.tickets
  add constraint tickets_replacement_not_self
  check (replaced_by_ticket_id is null or replaced_by_ticket_id <> id);

create unique index if not exists tickets_replaced_by_ticket_id_key
  on public.tickets(replaced_by_ticket_id)
  where replaced_by_ticket_id is not null;

create or replace function public.regenerate_guest_ticket_atomic(
  p_booking_id uuid,
  p_current_ticket_code text,
  p_new_ticket_code text,
  p_regenerated_at timestamptz,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.tickets%rowtype;
  v_metadata jsonb;
  v_metadata_tickets jsonb;
  v_new_ticket public.tickets%rowtype;
  v_occurrences integer;
begin
  if p_booking_id is null
     or nullif(trim(p_current_ticket_code), '') is null
     or nullif(trim(p_new_ticket_code), '') is null
     or p_regenerated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128 then
    raise exception 'TICKET_REGENERATION_INPUT_INVALID';
  end if;

  select booking.* into v_booking
    from public.bookings booking
   where booking.id = p_booking_id
   for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.notes is null
     or not v_booking.notes like '__zingara_booking_meta__:%' then
    raise exception 'TICKET_POPULATION_METADATA_INVALID';
  end if;

  begin
    v_metadata := substring(
      v_booking.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
  exception when others then
    raise exception 'TICKET_POPULATION_METADATA_INVALID';
  end;
  if jsonb_typeof(v_metadata -> 'guestTickets') is distinct from 'array' then
    raise exception 'TICKET_POPULATION_METADATA_INVALID';
  end if;

  select ticket.* into v_current
    from public.tickets ticket
   where ticket.booking_id = v_booking.id
     and ticket.ticket_code = trim(p_current_ticket_code)
   for update;
  if v_current.id is null then raise exception 'TICKET_NOT_FOUND'; end if;
  if v_current.ticket_status::text not in ('issued', 'valid')
     or v_current.replaced_by_ticket_id is not null then
    raise exception 'TICKET_REGENERATION_STATE_CHANGED';
  end if;

  select count(*)::integer into v_occurrences
    from jsonb_array_elements(v_metadata -> 'guestTickets') item
   where item ->> 'ticketCode' = v_current.ticket_code;
  if v_occurrences <> 1 then
    raise exception 'TICKET_REGENERATION_IDENTITY_AMBIGUOUS';
  end if;

  if trim(p_new_ticket_code) = v_current.ticket_code
     or trim(p_new_ticket_code) !~ 'R[A-Z0-9]+$'
     or regexp_replace(trim(p_new_ticket_code), 'R[A-Z0-9]+$', '') <>
        regexp_replace(v_current.ticket_code, 'R[A-Z0-9]+$', '')
     or exists (
       select 1 from public.tickets ticket
       where ticket.ticket_code = trim(p_new_ticket_code)
     ) then
    raise exception 'TICKET_REGENERATION_IDENTITY_INVALID';
  end if;

  insert into public.tickets (
    booking_id, issued_at, qr_payload, ticket_code, ticket_status, ticket_url
  ) values (
    v_booking.id,
    v_current.issued_at,
    trim(p_new_ticket_code),
    trim(p_new_ticket_code),
    'valid',
    '/ticket/' || trim(p_new_ticket_code)
  ) returning * into v_new_ticket;

  update public.tickets
     set ticket_status = 'void',
         replaced_by_ticket_id = v_new_ticket.id,
         replacement_recorded_at = p_regenerated_at,
         updated_at = p_regenerated_at
   where id = v_current.id
     and ticket_status::text in ('issued', 'valid')
     and replaced_by_ticket_id is null;
  if not found then raise exception 'TICKET_REGENERATION_STATE_CHANGED'; end if;

  select jsonb_agg(
    case
      when item ->> 'ticketCode' = v_current.ticket_code then
        jsonb_set(
          jsonb_set(
            jsonb_set(item, '{ticketCode}', to_jsonb(v_new_ticket.ticket_code), true),
            '{regeneratedAt}', to_jsonb(p_regenerated_at), true
          ),
          '{status}', to_jsonb('valid'::text), true
        )
      else item
    end
    order by ordinal
  ) into v_metadata_tickets
    from jsonb_array_elements(v_metadata -> 'guestTickets')
      with ordinality guest(item, ordinal);

  v_metadata := jsonb_set(v_metadata, '{guestTickets}', v_metadata_tickets, true);
  update public.bookings
     set notes = '__zingara_booking_meta__:' || v_metadata::text,
         updated_at = p_regenerated_at
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'booking.guest-ticket-regenerated',
    '{}'::text[],
    'SYSTEM',
    jsonb_build_object(
      'ticket_id', v_new_ticket.id,
      'ticket_code', v_new_ticket.ticket_code,
      'replaces_ticket_id', v_current.id,
      'replacement_recorded_at', p_regenerated_at
    ),
    jsonb_build_object(
      'ticket_id', v_current.id,
      'ticket_code', v_current.ticket_code,
      'ticket_status', v_current.ticket_status
    ),
    array['ticket_status', 'replaced_by_ticket_id', 'guestTickets'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    'Guest ticket regenerated with an atomic replacement relationship.',
    trim(p_request_id),
    'Live Tickets'
  );

  return jsonb_build_object(
    'status', 'processed',
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'ticket_code', v_new_ticket.ticket_code,
    'ticket_id', v_new_ticket.id,
    'replaced_ticket_code', v_current.ticket_code,
    'replaced_ticket_id', v_current.id
  );
end;
$$;

revoke all on function public.regenerate_guest_ticket_atomic(
  uuid, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.regenerate_guest_ticket_atomic(
  uuid, text, text, timestamptz, text
) to service_role;

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
  v_reactivated_codes text[] := '{}';
begin
  select booking.* into v_booking
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
       where regexp_replace(item ->> 'ticketCode', '[0-9]+(R[A-Z0-9]+)?$', '') <>
             v_family_prefix
     ) then
    raise exception 'TICKET_POPULATION_FAMILY_AMBIGUOUS';
  end if;

  -- Prefer the active identity named in booking metadata. When a previous
  -- guest reduction removed that metadata entry, reuse only the exact void
  -- identity recorded by the latest successful reduction audit.
  select array_agg(
    coalesce(
      active_identity.ticket_code,
      dormant_identity.ticket_code,
      expected.canonical_code
    ) order by expected.ticket_index
  ) into v_expected_codes
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
    ) active_identity on true
    left join lateral (
      select ticket.ticket_code
      from public.audit_events audit
      cross join lateral jsonb_array_elements_text(
        coalesce(audit.after_values -> 'invalidated_ticket_codes', '[]'::jsonb)
      ) invalidated(ticket_code)
      join public.tickets ticket
        on ticket.booking_id = v_booking.id
       and ticket.ticket_code = invalidated.ticket_code
       and ticket.ticket_status::text = 'void'
       and ticket.replaced_by_ticket_id is null
      where active_identity.ticket_code is null
        and audit.entity_id = v_booking.id::text
        and audit.action = 'booking.guest-ticket-population-reconciled'
        and audit.outcome = 'success'
        and regexp_replace(ticket.ticket_code, '[0-9]+(R[A-Z0-9]+)?$', '') =
            v_family_prefix
        and ((regexp_match(
          ticket.ticket_code, '([0-9]+)(R[A-Z0-9]+)?$'
        ))[1])::integer = expected.ticket_index
        and not exists (
          select 1
          from public.tickets other
          where other.booking_id = v_booking.id
            and other.ticket_status::text in ('issued', 'valid', 'checked_in')
            and regexp_replace(
              other.ticket_code, '[0-9]+(R[A-Z0-9]+)?$', ''
            ) = v_family_prefix
            and ((regexp_match(
              other.ticket_code, '([0-9]+)(R[A-Z0-9]+)?$'
            ))[1])::integer = expected.ticket_index
        )
      order by audit.created_at desc, ticket.updated_at desc
      limit 1
    ) dormant_identity on true;

  with proven_dormant as (
    select ticket.id, ticket.ticket_code
    from public.tickets ticket
    where ticket.booking_id = v_booking.id
      and ticket.ticket_code = any(v_expected_codes)
      and ticket.ticket_status::text = 'void'
      and ticket.replaced_by_ticket_id is null
      and exists (
        select 1
        from public.audit_events audit
        cross join lateral jsonb_array_elements_text(
          coalesce(audit.after_values -> 'invalidated_ticket_codes', '[]'::jsonb)
        ) invalidated(ticket_code)
        where audit.entity_id = v_booking.id::text
          and audit.action = 'booking.guest-ticket-population-reconciled'
          and audit.outcome = 'success'
          and invalidated.ticket_code = ticket.ticket_code
      )
      and not exists (
        select 1 from public.ticket_validations validation
        where validation.ticket_id = ticket.id
          and validation.result::text = 'accepted'
      )
      and not exists (
        select 1
        from public.tickets other
        where other.booking_id = v_booking.id
          and other.id <> ticket.id
          and other.ticket_status::text in ('issued', 'valid', 'checked_in')
          and regexp_replace(
            other.ticket_code, '[0-9]+(R[A-Z0-9]+)?$', ''
          ) = v_family_prefix
          and ((regexp_match(
            other.ticket_code, '([0-9]+)(R[A-Z0-9]+)?$'
          ))[1])::integer = ((regexp_match(
            ticket.ticket_code, '([0-9]+)(R[A-Z0-9]+)?$'
          ))[1])::integer
      )
  ), reactivated as (
    update public.tickets ticket
       set ticket_status = 'valid', updated_at = clock_timestamp()
      from proven_dormant dormant
     where ticket.id = dormant.id
       and ticket.ticket_status::text = 'void'
    returning ticket.ticket_code
  )
  select coalesce(array_agg(ticket_code order by ticket_code), '{}')
    into v_reactivated_codes
    from reactivated;

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
  ) into v_issued_at
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
      v_booking.id, v_issued_at, missing.code, missing.code, 'valid',
      '/ticket/' || missing.code
    from missing
    order by missing.code
    returning ticket_code
  )
  select coalesce(array_agg(ticket_code order by ticket_code), '{}')
    into v_created_codes
    from inserted;

  if cardinality(v_created_codes) = 0
     and cardinality(v_reactivated_codes) = 0 then
    return jsonb_build_object(
      'status', 'already_complete',
      'created_count', 0,
      'reactivated_count', 0,
      'booking_reference', v_booking.booking_reference
    );
  end if;

  select jsonb_agg(
    case
      when existing.item is not null then
        jsonb_set(
          jsonb_set(existing.item, '{total}', to_jsonb(v_booking.guest_count), true),
          '{status}', to_jsonb('valid'::text), true
        )
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
  ) into v_metadata_tickets
    from (
      select ticket_index, v_expected_codes[ticket_index] as ticket_code
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
      'reactivated_ticket_codes', to_jsonb(v_reactivated_codes),
      'reactivated_count', cardinality(v_reactivated_codes),
      'valid_per_guest_ticket_count', v_booking.guest_count
    ),
    jsonb_build_object(
      'guest_count', v_booking.guest_count,
      'persisted_per_guest_ticket_count',
        v_booking.guest_count - cardinality(v_created_codes) -
        cardinality(v_reactivated_codes)
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
    'reactivated_ticket_codes', v_reactivated_codes,
    'reactivated_count', cardinality(v_reactivated_codes),
    'valid_per_guest_ticket_count', v_booking.guest_count
  );
end;
$$;

revoke all on function public.reconcile_per_guest_ticket_population(
  uuid, text, text, text
) from public, anon, authenticated;

comment on column public.tickets.replaced_by_ticket_id is
  'Atomic successor identity for a regenerated guest ticket; the original QR row remains immutable and void.';
comment on function public.regenerate_guest_ticket_atomic(
  uuid, text, text, timestamptz, text
) is
  'Atomically voids one active guest ticket, persists its successor identity, updates booking metadata and records audit evidence.';
