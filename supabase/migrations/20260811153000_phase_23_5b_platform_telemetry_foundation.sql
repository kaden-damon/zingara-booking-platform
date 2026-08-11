create table if not exists public.platform_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  session_type text not null check (session_type in ('public', 'staff')),
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  journey_id text,
  current_area text not null,
  current_stage text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_sessions_active_idx
  on public.platform_sessions (last_seen_at desc);

create index if not exists platform_sessions_type_active_idx
  on public.platform_sessions (session_type, last_seen_at desc);

create index if not exists platform_sessions_staff_profile_idx
  on public.platform_sessions (staff_profile_id, last_seen_at desc)
  where staff_profile_id is not null;

create index if not exists platform_sessions_journey_idx
  on public.platform_sessions (journey_id)
  where journey_id is not null;

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  session_id text,
  journey_id text,
  booking_reference text,
  route text,
  operation text,
  status_code integer,
  duration_ms integer,
  safe_fingerprint text,
  deployment_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_events_created_at_idx
  on public.platform_events (created_at desc);

create index if not exists platform_events_type_created_at_idx
  on public.platform_events (event_type, created_at desc);

create index if not exists platform_events_journey_idx
  on public.platform_events (journey_id, created_at desc)
  where journey_id is not null;

create index if not exists platform_events_booking_reference_idx
  on public.platform_events (booking_reference, created_at desc)
  where booking_reference is not null;

create index if not exists platform_events_severity_idx
  on public.platform_events (severity, created_at desc);

create table if not exists public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  status text not null check (status in ('warning', 'incident', 'recovered')),
  started_at timestamptz not null default now(),
  recovered_at timestamptz,
  fingerprint text,
  summary text not null,
  affected_count integer not null default 0,
  deployment_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_incidents_service_status_idx
  on public.platform_incidents (service, status, started_at desc);

create index if not exists platform_incidents_started_at_idx
  on public.platform_incidents (started_at desc);

create index if not exists platform_incidents_fingerprint_idx
  on public.platform_incidents (fingerprint)
  where fingerprint is not null;

create table if not exists public.platform_metric_rollups (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_grain text not null check (period_grain in ('hour', 'day', 'month')),
  metric_name text not null,
  dimensions jsonb not null default '{}'::jsonb,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_start, period_grain, metric_name, dimensions)
);

create index if not exists platform_metric_rollups_metric_period_idx
  on public.platform_metric_rollups (metric_name, period_start desc);

alter table public.platform_sessions enable row level security;
alter table public.platform_events enable row level security;
alter table public.platform_incidents enable row level security;
alter table public.platform_metric_rollups enable row level security;

revoke all on public.platform_sessions from anon, authenticated;
revoke all on public.platform_events from anon, authenticated;
revoke all on public.platform_incidents from anon, authenticated;
revoke all on public.platform_metric_rollups from anon, authenticated;

grant select, insert, update, delete on public.platform_sessions to service_role;
grant select, insert, update, delete on public.platform_events to service_role;
grant select, insert, update, delete on public.platform_incidents to service_role;
grant select, insert, update, delete on public.platform_metric_rollups to service_role;
