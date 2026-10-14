-- Persist blocked Dineplan import identities instead of using a session-local
-- scratch relation. The transaction id keeps concurrent attempts isolated and
-- the retained rows provide durable investigation evidence.

create table if not exists public.dineplan_import_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  attempt_id bigint not null default txid_current(),
  row_number integer not null,
  booking_id uuid references public.bookings(id) on delete restrict,
  booking_reference text,
  show_id uuid references public.shows(id) on delete restrict,
  venue text,
  performance_date date,
  performance_time time,
  customer_name text,
  source_reference text,
  incoming_fingerprint text,
  bound_source_reference text,
  bound_fingerprint text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists dineplan_import_identity_conflicts_attempt_idx
  on public.dineplan_import_identity_conflicts (attempt_id, row_number);
create index if not exists dineplan_import_identity_conflicts_booking_idx
  on public.dineplan_import_identity_conflicts (booking_id, created_at desc);

alter table public.dineplan_import_identity_conflicts enable row level security;
revoke all on public.dineplan_import_identity_conflicts from public, anon, authenticated;
grant select, insert on public.dineplan_import_identity_conflicts to service_role;

comment on table public.dineplan_import_identity_conflicts is
  'Private durable evidence for Dineplan import attempts blocked before any customer or booking mutation.';

do $$
declare
  v_definition text;
  v_end integer;
  v_start integer;
  v_temp_end_token constant text := '  truncate pg_temp.dineplan_identity_conflicts;';
  v_temp_start_token constant text := '  create temporary table if not exists pg_temp.dineplan_identity_conflicts (';
begin
  select pg_get_functiondef(function_oid)
    into v_definition
    from (
      select to_regprocedure(
        'public.execute_data_portability_import(text,text,jsonb,text,uuid,timestamptz)'
      ) as function_oid
    ) resolved
   where function_oid is not null;

  if v_definition is null then
    raise exception 'The guarded data portability import function is missing.';
  end if;

  v_start := strpos(v_definition, v_temp_start_token);
  v_end := strpos(v_definition, v_temp_end_token);
  if v_start = 0 or v_end <= v_start then
    raise exception 'The Dineplan import scratch-table block could not be located.';
  end if;

  v_definition := overlay(
    v_definition
    placing ''
    from v_start
    for (v_end + length(v_temp_end_token) - v_start)
  );
  v_definition := replace(
    v_definition,
    'pg_temp.dineplan_identity_conflicts',
    'public.dineplan_import_identity_conflicts'
  );
  v_definition := replace(
    v_definition,
    'if exists (select 1 from public.dineplan_import_identity_conflicts) then',
    'if exists (select 1 from public.dineplan_import_identity_conflicts where attempt_id = txid_current()) then'
  );
  v_definition := replace(
    v_definition,
    'for v_conflict in select * from public.dineplan_import_identity_conflicts order by row_number',
    'for v_conflict in select * from public.dineplan_import_identity_conflicts where attempt_id = txid_current() order by row_number'
  );
  v_definition := replace(
    v_definition,
    '(select count(*) from public.dineplan_import_identity_conflicts)',
    '(select count(*) from public.dineplan_import_identity_conflicts where attempt_id = txid_current())'
  );
  v_definition := replace(
    v_definition,
    'from public.dineplan_import_identity_conflicts
      )',
    'from public.dineplan_import_identity_conflicts
        where attempt_id = txid_current()
      )'
  );

  if v_definition like '%pg_temp.dineplan_identity_conflicts%'
     or v_definition like '%create temporary table if not exists%'
     or v_definition not like '%where attempt_id = txid_current()%' then
    raise exception 'The durable Dineplan conflict rewrite did not complete safely.';
  end if;

  execute v_definition;
end;
$$;

