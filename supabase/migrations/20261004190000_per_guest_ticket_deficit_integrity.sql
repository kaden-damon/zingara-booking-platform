-- Emergency P0: persist canonical per-guest identities when authoritative pax
-- increases, and repair the eleven proven historical deficits through the same
-- population reconciler.

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

  select array_agg(
    v_family_prefix || case
      when ticket_index < 100 then lpad(ticket_index::text, 2, '0')
      else ticket_index::text
    end
    order by ticket_index
  ) into v_expected_codes
    from generate_series(1, v_booking.guest_count) ticket_index;

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
        v_family_prefix || case
          when ticket_index < 100 then lpad(ticket_index::text, 2, '0')
          else ticket_index::text
        end as ticket_code
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

create or replace function public.reconcile_guest_tickets_after_pax_increase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.guest_count <= old.guest_count then return new; end if;
  perform public.reconcile_per_guest_ticket_population(
    new.id,
    'SYSTEM',
    'Per-guest ticket population reconciled after guest-count increase.',
    'ticket-population-increase:' || new.id::text || ':' || new.updated_at::text
  );
  return new;
end;
$$;

revoke all on function public.reconcile_guest_tickets_after_pax_increase()
  from public, anon, authenticated;

drop trigger if exists bookings_reconcile_guest_tickets_after_pax_increase
  on public.bookings;
create trigger bookings_reconcile_guest_tickets_after_pax_increase
  after update of guest_count on public.bookings
  for each row
  when (new.guest_count > old.guest_count)
  execute function public.reconcile_guest_tickets_after_pax_increase();

create or replace function public.repair_historical_guest_ticket_deficit_atomic(
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
  v_expected_existing integer;
  v_expected_guest_count integer;
  v_family_prefix text;
  v_result jsonb;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_booking_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'TICKET_REPAIR_INPUT_INVALID';
  end if;

  case trim(p_booking_reference)
    when 'ZNG-MDW4HJ' then v_expected_booking_id := '9eb95991-f6ea-4fc6-8166-ed8d2d4e94c7'; v_expected_existing := 8; v_expected_guest_count := 20;
    when 'ZNG-43V3AQ' then v_expected_booking_id := '5bdffed3-03ab-4d12-8170-27e5d04fc789'; v_expected_existing := 73; v_expected_guest_count := 77;
    when 'ZNG-562EB5' then v_expected_booking_id := 'f1501889-0dd3-4b5c-9685-7e21e053d486'; v_expected_existing := 3; v_expected_guest_count := 7;
    when 'ZNG-3VCJ3F' then v_expected_booking_id := '4471a18e-489a-4a40-b4ca-d18e9f45cd83'; v_expected_existing := 6; v_expected_guest_count := 8;
    when 'ZNG-LNLM2Q' then v_expected_booking_id := '03df03b4-0cfc-4da7-ac64-ebb9007bf722'; v_expected_existing := 5; v_expected_guest_count := 7;
    when 'ZNG-PHPZ96' then v_expected_booking_id := '21276c93-6af3-472c-ae43-e0ec4a2058c6'; v_expected_existing := 6; v_expected_guest_count := 8;
    when 'ZNG-X8F2P7' then v_expected_booking_id := '30a87812-ca96-490c-b553-322a8a7c6aaa'; v_expected_existing := 4; v_expected_guest_count := 6;
    when 'ZNG-Z4TS5A' then v_expected_booking_id := '0d220352-5971-40a0-979f-3c1a9d2dac53'; v_expected_existing := 14; v_expected_guest_count := 16;
    when 'ZNG-ZBKJUS' then v_expected_booking_id := '4a9fd714-496e-4f19-b345-915ed35c9f78'; v_expected_existing := 2; v_expected_guest_count := 4;
    when 'ZNG-BRQDS4' then v_expected_booking_id := '116b4a54-8a7c-491e-bae8-87e3670c8f15'; v_expected_existing := 7; v_expected_guest_count := 8;
    when 'ZNG-GQEC53' then v_expected_booking_id := '7124ff22-d40b-48c1-be6b-37cffd47b2dc'; v_expected_existing := 22; v_expected_guest_count := 23;
    else raise exception 'TICKET_REPAIR_BOOKING_NOT_AUTHORIZED';
  end case;
  v_family_prefix := trim(p_booking_reference) || '-';

  perform pg_advisory_xact_lock(hashtext(trim(p_booking_reference)));
  select booking.*
    into v_booking
    from public.bookings booking
   where booking.booking_reference = trim(p_booking_reference)
   for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select audit.id
    into v_existing_audit
    from public.audit_events audit
   where audit.action = 'booking.missing-guest-tickets-reconciled'
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
  if v_booking.id <> v_expected_booking_id
     or v_booking.guest_count <> v_expected_guest_count
     or v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded')
     or (select count(*) from public.tickets where booking_id = v_booking.id)
        <> v_expected_existing
     or (select count(*) from public.tickets
         where booking_id = v_booking.id
           and ticket_status::text in ('issued', 'valid', 'checked_in'))
        <> v_expected_existing
     or exists (
       select 1 from public.tickets ticket
       where ticket.booking_id = v_booking.id
         and ticket.ticket_code <> v_family_prefix || case
           when substring(ticket.ticket_code from '([0-9]+)$')::integer < 100
             then lpad(substring(ticket.ticket_code from '([0-9]+)$'), 2, '0')
           else substring(ticket.ticket_code from '([0-9]+)$')
         end
     ) then
    raise exception 'TICKET_REPAIR_STATE_CHANGED';
  end if;

  v_result := public.reconcile_per_guest_ticket_population(
    v_booking.id,
    trim(p_actor_name),
    'Management-authorised repair of a proven historical per-guest ticket deficit.',
    trim(p_request_id)
  );
  if coalesce((v_result ->> 'created_count')::integer, 0)
       <> v_expected_guest_count - v_expected_existing then
    raise exception 'TICKET_REPAIR_COUNT_MISMATCH';
  end if;
  return v_result || jsonb_build_object('idempotent', false);
end;
$$;

revoke all on function public.repair_historical_guest_ticket_deficit_atomic(
  text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.repair_historical_guest_ticket_deficit_atomic(
  text, timestamptz, text, text
) to service_role;

comment on function public.repair_historical_guest_ticket_deficit_atomic(
  text, timestamptz, text, text
) is
  'Hard-bounded repair for eleven proven historical per-guest ticket deficits.';
