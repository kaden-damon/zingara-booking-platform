create table if not exists public.automated_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_key text not null check (workflow_key in ('post_show_review', 'pre_show_reminder')),
  execution_mode text not null check (execution_mode in ('dry-run', 'send')),
  source text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  eligible_count integer not null default 0 check (eligible_count >= 0),
  attempted_count integer not null default 0 check (attempted_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  suppressed_count integer not null default 0 check (suppressed_count >= 0),
  deduplicated_count integer not null default 0 check (deduplicated_count >= 0),
  reason_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(reason_counts) = 'object'),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automated_workflow_runs_lookup_idx
  on public.automated_workflow_runs (workflow_key, started_at desc);

create unique index if not exists communications_post_show_review_once_uidx
  on public.communications (booking_id, type, channel)
  where type = 'post_show_review'
    and channel = 'email'
    and status in ('sending', 'sent', 'suppressed');

alter table public.automated_workflow_runs enable row level security;
revoke all on table public.automated_workflow_runs from public, anon, authenticated;
grant select, insert, update on table public.automated_workflow_runs to service_role;

comment on table public.automated_workflow_runs is
  'Bounded durable evidence for authenticated automated workflow executions.';
comment on index public.communications_post_show_review_once_uidx is
  'Prevents concurrent or retried automated review runs from sending more than one invitation per booking.';
