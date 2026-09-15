-- Phase 41.2K-B: persist management duplicate-review decisions and reconcile
-- only the four explicitly approved booking groups through existing lifecycle
-- semantics. The state guards make a changed Production record fail closed.

create table if not exists public.duplicate_booking_review_dispositions (
  id uuid primary key default gen_random_uuid(),
  review_key text not null unique,
  record_ids uuid[] not null,
  booking_references text[] not null,
  decision text not null check (
    decision in ('legitimate_separate_bookings', 'confirmed_duplicate_resolved')
  ),
  management_decision_by text not null,
  authoritative_booking_id uuid references public.bookings(id) on delete restrict,
  residue_booking_ids uuid[] not null default '{}',
  capacity_released integer not null default 0 check (capacity_released >= 0),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now()
);

create index if not exists duplicate_booking_review_dispositions_decision_idx
  on public.duplicate_booking_review_dispositions (decision, decided_at desc);

alter table public.duplicate_booking_review_dispositions enable row level security;
revoke all on public.duplicate_booking_review_dispositions from public, anon, authenticated;
grant select, insert on public.duplicate_booking_review_dispositions to service_role;

create or replace function public.prevent_duplicate_booking_review_disposition_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'duplicate booking review dispositions are append-only';
end;
$$;

drop trigger if exists duplicate_booking_review_dispositions_no_update
  on public.duplicate_booking_review_dispositions;
create trigger duplicate_booking_review_dispositions_no_update
  before update on public.duplicate_booking_review_dispositions
  for each row execute function public.prevent_duplicate_booking_review_disposition_mutation();

drop trigger if exists duplicate_booking_review_dispositions_no_delete
  on public.duplicate_booking_review_dispositions;
create trigger duplicate_booking_review_dispositions_no_delete
  before delete on public.duplicate_booking_review_dispositions
  for each row execute function public.prevent_duplicate_booking_review_disposition_mutation();

create or replace function public.record_duplicate_booking_review_disposition_atomic(
  p_booking_references text[],
  p_decision text,
  p_management_decision_by text,
  p_authoritative_booking_reference text,
  p_residue_booking_references text[],
  p_capacity_released integer,
  p_actor_name text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authoritative_booking_id uuid;
  v_booking_references text[];
  v_record_ids uuid[];
  v_residue_booking_ids uuid[] := '{}';
  v_review_key text;
  v_existing public.duplicate_booking_review_dispositions%rowtype;
begin
  if p_decision not in ('legitimate_separate_bookings', 'confirmed_duplicate_resolved') then
    raise exception 'INVALID_DUPLICATE_REVIEW_DECISION';
  end if;

  select
    coalesce(array_agg(booking.id order by booking.id::text), '{}'),
    coalesce(array_agg(booking.booking_reference order by booking.booking_reference), '{}')
    into v_record_ids, v_booking_references
    from public.bookings booking
   where booking.booking_reference = any(p_booking_references);

  if cardinality(v_record_ids) <> cardinality(p_booking_references)
     or cardinality(v_record_ids) < 2 then
    raise exception 'DUPLICATE_REVIEW_RECORD_SET_CHANGED';
  end if;

  select string_agg(record_id::text, '|' order by record_id::text)
    into v_review_key
    from unnest(v_record_ids) record_id;

  perform pg_advisory_xact_lock(hashtextextended(v_review_key, 0));

  select *
    into v_existing
    from public.duplicate_booking_review_dispositions disposition
   where disposition.review_key = v_review_key;

  if v_existing.id is not null then
    if v_existing.decision <> p_decision then
      raise exception 'DUPLICATE_REVIEW_DISPOSITION_CONFLICT';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'review_key', v_review_key,
      'decision', v_existing.decision
    );
  end if;

  if p_decision = 'legitimate_separate_bookings' then
    if p_authoritative_booking_reference is not null
       or cardinality(coalesce(p_residue_booking_references, '{}')) > 0
       or coalesce(p_capacity_released, 0) <> 0 then
      raise exception 'LEGITIMATE_GROUP_CANNOT_MUTATE_BOOKINGS';
    end if;
  else
    select booking.id
      into v_authoritative_booking_id
      from public.bookings booking
     where booking.booking_reference = p_authoritative_booking_reference;

    select coalesce(array_agg(booking.id order by booking.id::text), '{}')
      into v_residue_booking_ids
      from public.bookings booking
     where booking.booking_reference = any(coalesce(p_residue_booking_references, '{}'));

    if v_authoritative_booking_id is null
       or cardinality(v_residue_booking_ids) <> cardinality(p_residue_booking_references)
       or not (v_authoritative_booking_id = any(v_record_ids))
       or exists (
         select 1
           from unnest(v_residue_booking_ids) residue_id
          where not (residue_id = any(v_record_ids))
       ) then
      raise exception 'RESOLVED_DUPLICATE_RECORD_SET_CHANGED';
    end if;
  end if;

  insert into public.duplicate_booking_review_dispositions (
    review_key,
    record_ids,
    booking_references,
    decision,
    management_decision_by,
    authoritative_booking_id,
    residue_booking_ids,
    capacity_released,
    reason,
    metadata
  ) values (
    v_review_key,
    v_record_ids,
    v_booking_references,
    p_decision,
    p_management_decision_by,
    v_authoritative_booking_id,
    v_residue_booking_ids,
    coalesce(p_capacity_released, 0),
    p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.audit_events (
    action,
    actor_location_scope,
    actor_name,
    actor_role,
    after_values,
    before_values,
    changed_fields,
    entity_reference,
    entity_type,
    outcome,
    reason,
    source_area
  ) values (
    case
      when p_decision = 'confirmed_duplicate_resolved'
      then 'duplicate-review.confirmed-resolved'
      else 'duplicate-review.legitimate-separated'
    end,
    array['all'],
    p_actor_name,
    'Controlled Production Correction',
    jsonb_build_object(
      'review_key', v_review_key,
      'booking_references', v_booking_references,
      'decision', p_decision,
      'management_decision_by', p_management_decision_by,
      'authoritative_booking_reference', p_authoritative_booking_reference,
      'residue_booking_references', coalesce(p_residue_booking_references, '{}'),
      'capacity_released', coalesce(p_capacity_released, 0),
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    ),
    '{}'::jsonb,
    array['duplicate_review_disposition'],
    v_review_key,
    'duplicate_booking_group',
    'success',
    p_reason,
    'Potential Duplicates'
  );

  return jsonb_build_object(
    'idempotent', false,
    'review_key', v_review_key,
    'decision', p_decision
  );
end;
$$;

revoke all on function public.record_duplicate_booking_review_disposition_atomic(
  text[], text, text, text, text[], integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_duplicate_booking_review_disposition_atomic(
  text[], text, text, text, text[], integer, text, text, jsonb
) to service_role;

create or replace function public.resolve_confirmed_duplicate_booking_group_atomic(
  p_authoritative_booking_reference text,
  p_residue_booking_reference text,
  p_expected_authoritative_status text,
  p_expected_residue_status text,
  p_expected_authoritative_updated_at timestamptz,
  p_expected_residue_updated_at timestamptz,
  p_expected_authoritative_amount_paid numeric,
  p_expected_residue_amount_paid numeric,
  p_expected_residue_table_codes text[],
  p_management_decision_by text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authoritative public.bookings%rowtype;
  v_residue public.bookings%rowtype;
  v_cancel_result jsonb := '{}'::jsonb;
  v_capacity_released integer := 0;
  v_residue_table_codes text[] := '{}';
  v_revoked_link_count integer := 0;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      least(p_authoritative_booking_reference, p_residue_booking_reference)
        || '|'
        || greatest(p_authoritative_booking_reference, p_residue_booking_reference),
      0
    )
  );

  select * into v_authoritative
    from public.bookings
   where booking_reference = p_authoritative_booking_reference
   for update;
  select * into v_residue
    from public.bookings
   where booking_reference = p_residue_booking_reference
   for update;

  if v_authoritative.id is null or v_residue.id is null then
    raise exception 'DUPLICATE_GROUP_BOOKING_NOT_FOUND';
  end if;

  if v_authoritative.booking_status::text <> p_expected_authoritative_status
     or v_authoritative.updated_at is distinct from p_expected_authoritative_updated_at
     or v_authoritative.amount_paid is distinct from p_expected_authoritative_amount_paid then
    raise exception 'EXPECTED_AUTHORITATIVE_STATE_CHANGED';
  end if;

  if v_residue.booking_status::text <> p_expected_residue_status
     or v_residue.updated_at is distinct from p_expected_residue_updated_at
     or v_residue.amount_paid is distinct from p_expected_residue_amount_paid then
    raise exception 'EXPECTED_RESIDUE_STATE_CHANGED';
  end if;

  if v_authoritative.id = v_residue.id
     or v_authoritative.show_id <> v_residue.show_id
     or lower(trim(coalesce(v_authoritative.section, ''))) <>
        lower(trim(coalesce(v_residue.section, '')))
     or v_authoritative.guest_count <> v_residue.guest_count
     or v_authoritative.total_amount <> v_residue.total_amount then
    raise exception 'DUPLICATE_GROUP_IDENTITY_CHANGED';
  end if;

  select coalesce(array_agg(table_row.table_code order by table_row.table_code), '{}')
    into v_residue_table_codes
    from public.show_tables table_row
   where table_row.booking_id = v_residue.id;

  if v_residue_table_codes is distinct from coalesce(p_expected_residue_table_codes, '{}') then
    raise exception 'EXPECTED_RESIDUE_TABLE_STATE_CHANGED';
  end if;

  if v_residue.booking_status::text <> 'cancelled' and exists (
    select 1
      from public.payments payment
     where payment.booking_id = v_residue.id
       and payment.payment_status::text <> 'pending_payment'
  ) then
    raise exception 'EXPECTED_RESIDUE_FINANCIAL_STATE_CHANGED';
  end if;

  if v_residue.booking_status::text <> 'cancelled' and exists (
    select 1
      from public.tickets ticket
     where ticket.booking_id = v_residue.id
       and ticket.ticket_status::text in ('issued', 'valid', 'checked_in', 'expired')
  ) then
    raise exception 'EXPECTED_RESIDUE_TICKET_STATE_CHANGED';
  end if;

  if v_residue.booking_status::text = 'cancelled' then
    if v_residue.table_id is not null or exists (
      select 1 from public.show_tables where booking_id = v_residue.id
    ) then
      raise exception 'CANCELLED_RESIDUE_HAS_ACTIVE_TABLE_CLAIM';
    end if;
  else
    v_capacity_released := v_residue.guest_count;
    select public.cancel_booking_atomic(
      v_residue.booking_reference,
      v_residue.notes,
      p_reason,
      clock_timestamp(),
      null,
      null,
      'System · Phase 41.2K-B',
      'Controlled Production Correction',
      array['all'],
      'phase-41.2k-b:' || v_residue.booking_reference,
      'Phase 41.2K-B controlled Production correction'
    ) into v_cancel_result;
  end if;

  update public.booking_payment_links
     set status = 'revoked',
         revoked_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where booking_id = v_residue.id
     and status = 'active';
  get diagnostics v_revoked_link_count = row_count;

  select public.record_duplicate_booking_review_disposition_atomic(
    array[v_authoritative.booking_reference, v_residue.booking_reference],
    'confirmed_duplicate_resolved',
    p_management_decision_by,
    v_authoritative.booking_reference,
    array[v_residue.booking_reference],
    v_capacity_released,
    'System · Phase 41.2K-B',
    p_reason,
    jsonb_build_object(
      'cancellation', v_cancel_result,
      'revoked_payment_link_count', v_revoked_link_count
    )
  ) into v_result;

  return v_result || jsonb_build_object(
    'capacity_released', v_capacity_released,
    'revoked_payment_link_count', v_revoked_link_count
  );
end;
$$;

revoke all on function public.resolve_confirmed_duplicate_booking_group_atomic(
  text, text, text, text, timestamptz, timestamptz, numeric, numeric, text[], text, text
) from public, anon, authenticated;
grant execute on function public.resolve_confirmed_duplicate_booking_group_atomic(
  text, text, text, text, timestamptz, timestamptz, numeric, numeric, text[], text, text
) to service_role;

-- Management-confirmed duplicate groups. Each call independently locks and
-- revalidates the exact observed Production state before changing the residue.
select public.resolve_confirmed_duplicate_booking_group_atomic(
  'ZNG-46Q9DK', 'ZNG-YHKT5G', 'confirmed', 'pending_payment',
  '2026-09-07 07:53:27.981311+00', '2026-09-07 09:14:32.592786+00',
  2720.00, 0.00, array['302'], 'Aswin Lingard',
  'Management-confirmed duplicate residue; preserve paid public booking ZNG-46Q9DK.'
);

select public.resolve_confirmed_duplicate_booking_group_atomic(
  'ZNG-QY33TY', 'ZNG-2F7QFC', 'confirmed', 'pending_payment',
  '2026-09-08 12:36:29.173+00', '2026-09-05 10:39:32.556731+00',
  13860.00, 0.00, '{}', 'Aswin Lingard',
  'Management-confirmed duplicate residue; preserve paid public booking ZNG-QY33TY.'
);

select public.resolve_confirmed_duplicate_booking_group_atomic(
  'ZNG-AG5HV6', 'ZNG-33E932', 'confirmed', 'cancelled',
  '2026-09-08 12:52:49.107683+00', '2026-09-08 14:02:28.507491+00',
  77962.50, 77962.50, '{}', 'Aswin Lingard',
  'Management-confirmed duplicate group; ZNG-33E932 was already cancelled as duplicate residue.'
);

select public.resolve_confirmed_duplicate_booking_group_atomic(
  'ZNG-RVZD3B', 'ZNG-P34A6K', 'confirmed', 'pending_payment',
  '2026-09-10 03:30:52.001199+00', '2026-09-09 10:29:42.205142+00',
  3850.00, 0.00, '{}', 'Aswin Lingard',
  'Management-confirmed exact retry residue; preserve provider-paid booking ZNG-RVZD3B.'
);

-- Ash confirmed every other booking group in the Phase 41.2K report as a
-- legitimate separate booking. These calls record review state only.
select public.record_duplicate_booking_review_disposition_atomic(
  array['ZNG-PSAFJ2', 'ZNG-P5YVJP'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);
select public.record_duplicate_booking_review_disposition_atomic(
  array['ZNG-SV7845', 'ZNG-RGX6FQ'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);
select public.record_duplicate_booking_review_disposition_atomic(
  array['DP-C2J4NC', 'DP-L2J4NC'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);
select public.record_duplicate_booking_review_disposition_atomic(
  array['ZNG-377FWG', 'ZNG-3TNZDL'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);
select public.record_duplicate_booking_review_disposition_atomic(
  array['ZNG-DB8X7B', 'ZNG-SFGGEE'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);
select public.record_duplicate_booking_review_disposition_atomic(
  array['DP-QK9VNC', 'DP-CK2WNC'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);
select public.record_duplicate_booking_review_disposition_atomic(
  array['ZNG-UMQEAP', 'ZNG-HU48HY'], 'legitimate_separate_bookings',
  'Aswin Lingard', null, '{}', 0, 'System · Phase 41.2K-B',
  'Management confirmed these are legitimate separate bookings.', '{}'::jsonb
);

comment on table public.duplicate_booking_review_dispositions is
  'Append-only management dispositions for booking candidate groups; booking IDs form the stable review identity.';
