alter table public.dineplan_reconciliation_snapshots
  add column if not exists parser_version integer not null default 1 check (parser_version > 0),
  add column if not exists parse_quality jsonb not null default '{"duplicateRows":0,"malformedIdentities":0,"missingContactFields":0,"parserTrusted":true,"sourceCovers":null,"sourceReservations":null,"warnings":[]}'::jsonb
    check (jsonb_typeof(parse_quality) = 'object');

alter table public.dineplan_reconciliation_snapshots
  drop constraint if exists dineplan_reconciliation_snapshots_checksum_key;

create unique index if not exists dineplan_reconciliation_snapshots_checksum_parser_idx
  on public.dineplan_reconciliation_snapshots (checksum, parser_version);

alter table public.dineplan_reconciliation_snapshots
  drop constraint if exists dineplan_reconciliation_snapshots_status_check;

alter table public.dineplan_reconciliation_snapshots
  add constraint dineplan_reconciliation_snapshots_status_check
  check (status in ('preview', 'reconciled', 'review_required'));
