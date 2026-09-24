-- Stage 1 stores normalized evidence only. Uploaded Dineplan binaries are parsed
-- in memory and are not retained.
create table if not exists public.dineplan_reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  checksum text not null unique check (checksum ~ '^[a-f0-9]{64}$'),
  original_filename text not null check (length(trim(original_filename)) > 0),
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null references public.staff_profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  source_generated_at timestamptz,
  performance_date date,
  performance_time time,
  venue text check (venue is null or venue in ('cape-town', 'johannesburg')),
  show_id uuid references public.shows(id) on delete restrict,
  reservation_count integer not null default 0 check (reservation_count >= 0),
  covers integer not null default 0 check (covers >= 0),
  normalized_reservations jsonb not null default '[]'::jsonb check (jsonb_typeof(normalized_reservations) = 'array'),
  reconciliation_results jsonb check (reconciliation_results is null or jsonb_typeof(reconciliation_results) = 'object'),
  status text not null default 'preview' check (status in ('preview', 'reconciled')),
  compared_at timestamptz,
  compared_by uuid references public.staff_profiles(id) on delete restrict
);

create table if not exists public.dineplan_reconciliation_reviews (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.dineplan_reconciliation_snapshots(id) on delete cascade,
  result_key text not null,
  disposition text not null check (disposition in ('reviewed', 'no_action', 'box_office', 'management_review')),
  notes text,
  reviewed_by uuid not null references public.staff_profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique (snapshot_id, result_key)
);

create table if not exists public.dineplan_reconciliation_actions (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique check (action_key ~ '^[a-f0-9]{64}$'),
  latest_snapshot_id uuid not null references public.dineplan_reconciliation_snapshots(id) on delete restrict,
  source_result_key text not null,
  show_id uuid not null references public.shows(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  booking_kind text not null default 'unknown' check (booking_kind in ('corporate','standard','unknown')),
  booking_reference text,
  guest_label text not null,
  venue text not null check (venue in ('cape-town', 'johannesburg')),
  performance_date date not null,
  performance_time time,
  zone text,
  pax integer not null default 0 check (pax >= 0),
  classification text not null check (classification in ('dineplan_newer', 'review')),
  severity text not null check (severity in ('critical', 'normal')),
  action_kind text not null check (action_kind in ('review_booking','review_zone','verify_cancel','verify_pax','verify_payment','verify_performance')),
  manual_action text not null,
  dineplan_state text not null,
  zingara_state text not null,
  capacity_impact integer not null default 0 check (capacity_impact >= 0),
  material_fingerprint text not null check (material_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'unacknowledged' check (status in ('unacknowledged','acknowledged','resolved','no_action')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  source_generated_at timestamptz,
  acknowledged_by uuid references public.staff_profiles(id) on delete restrict,
  acknowledged_at timestamptz,
  acknowledgement_note text,
  no_action_by uuid references public.staff_profiles(id) on delete restrict,
  no_action_at timestamptz,
  no_action_reason text,
  resolved_at timestamptz,
  resolved_by_snapshot_id uuid references public.dineplan_reconciliation_snapshots(id) on delete restrict,
  notification_claimed_at timestamptz,
  last_notified_at timestamptz,
  last_escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dineplan_reconciliation_action_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.dineplan_reconciliation_actions(id) on delete cascade,
  snapshot_id uuid references public.dineplan_reconciliation_snapshots(id) on delete restrict,
  event_type text not null check (event_type in ('acknowledged','created','digest_failed','digest_sent','materially_changed','no_action','resolved_by_reconciliation','reopened')),
  actor_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.dineplan_reconciliation_settings (
  id smallint primary key default 1 check (id = 1),
  action_recipient_staff_ids uuid[] not null default '{}',
  corporate_recipient_staff_ids uuid[] not null default '{}',
  management_cc_staff_ids uuid[] not null default '{}',
  hourly_reminders_enabled boolean not null default false,
  normal_acknowledged_cadence_hours integer not null default 3 check (normal_acknowledged_cadence_hours between 1 and 24),
  pre_show_escalation_hours integer not null default 3 check (pre_show_escalation_hours between 1 and 24),
  snapshot_stale_hours integer not null default 24 check (snapshot_stale_hours between 1 and 168),
  updated_by uuid references public.staff_profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.dineplan_reconciliation_settings (id)
values (1)
on conflict (id) do nothing;

-- Initial operational recipients are seeded as editable staff-profile configuration.
-- Reminder delivery remains disabled until management explicitly enables it.
update public.dineplan_reconciliation_settings
set action_recipient_staff_ids = array(
      select id from public.staff_profiles
       where active = true
         and lower(email) in (
           'fatima@zingara.co.za',
           'jacques@zingara.co.za',
           'retha@zingara.co.za',
           'sharonricketts@zingara.co.za'
         )
    ),
    corporate_recipient_staff_ids = array(
      select id from public.staff_profiles
       where active = true
         and lower(email) in ('michael@zingara.co.za', 'lisa@zingara.co.za')
    ),
    management_cc_staff_ids = array(
      select id from public.staff_profiles
       where active = true
         and lower(email) in (
           'aswin@zingara.co.za',
           'tracy@zingara.co.za',
           'nicky-annedebeer@zingara.co.za',
           'marvin@zingara.co.za',
           'kaden@kaden.co.za'
         )
    )
where id = 1;

create table if not exists public.dineplan_reconciliation_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  action_ids uuid[] not null default '{}',
  recipient_staff_ids uuid[] not null default '{}',
  cc_staff_ids uuid[] not null default '{}',
  audience text not null default 'general' check (audience in ('corporate','general')),
  subject text not null,
  delivery_type text not null check (delivery_type in ('hourly','pre_show','preview')),
  status text not null check (status in ('failed','preview','sent','skipped')),
  error_message text,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists dineplan_reconciliation_snapshots_date_idx
  on public.dineplan_reconciliation_snapshots (performance_date, uploaded_at desc);
create index if not exists dineplan_reconciliation_snapshots_show_idx
  on public.dineplan_reconciliation_snapshots (show_id, uploaded_at desc);
create index if not exists dineplan_reconciliation_reviews_snapshot_idx
  on public.dineplan_reconciliation_reviews (snapshot_id, reviewed_at desc);
create index if not exists dineplan_reconciliation_actions_outstanding_idx
  on public.dineplan_reconciliation_actions (status, performance_date, severity, last_notified_at);
create index if not exists dineplan_reconciliation_actions_show_idx
  on public.dineplan_reconciliation_actions (show_id, updated_at desc);
create index if not exists dineplan_reconciliation_action_events_action_idx
  on public.dineplan_reconciliation_action_events (action_id, occurred_at desc);

create or replace function public.claim_due_dineplan_reconciliation_actions(
  p_normal_acknowledged_cadence_hours integer default 3,
  p_limit integer default 500
)
returns setof public.dineplan_reconciliation_actions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select a.id
      from public.dineplan_reconciliation_actions a
     where a.status in ('unacknowledged','acknowledged')
       and (
         a.action_kind = 'verify_payment'
         or ((a.performance_date + coalesce(a.performance_time, time '23:59')) at time zone 'Africa/Johannesburg') >= now()
       )
       and (
         a.last_notified_at is null
         or a.last_notified_at <= now() - make_interval(hours => case
           when a.severity = 'critical' or a.status = 'unacknowledged' then 1
           else greatest(1, least(24, p_normal_acknowledged_cadence_hours))
         end)
       )
       and (a.notification_claimed_at is null or a.notification_claimed_at < now() - interval '15 minutes')
     order by case when a.severity = 'critical' then 0 else 1 end, a.performance_date, a.first_detected_at
     for update skip locked
     limit greatest(1, least(500, p_limit))
  )
  update public.dineplan_reconciliation_actions a
     set notification_claimed_at = now(), updated_at = now()
    from due
   where a.id = due.id
  returning a.*;
end;
$$;

alter table public.dineplan_reconciliation_snapshots enable row level security;
alter table public.dineplan_reconciliation_reviews enable row level security;
alter table public.dineplan_reconciliation_actions enable row level security;
alter table public.dineplan_reconciliation_action_events enable row level security;
alter table public.dineplan_reconciliation_settings enable row level security;
alter table public.dineplan_reconciliation_digest_deliveries enable row level security;

revoke all on public.dineplan_reconciliation_snapshots from anon, authenticated;
revoke all on public.dineplan_reconciliation_reviews from anon, authenticated;
revoke all on public.dineplan_reconciliation_actions from anon, authenticated;
revoke all on public.dineplan_reconciliation_action_events from anon, authenticated;
revoke all on public.dineplan_reconciliation_settings from anon, authenticated;
revoke all on public.dineplan_reconciliation_digest_deliveries from anon, authenticated;
grant select, insert, update, delete on public.dineplan_reconciliation_snapshots to service_role;
grant select, insert, update, delete on public.dineplan_reconciliation_reviews to service_role;
grant select, insert, update, delete on public.dineplan_reconciliation_actions to service_role;
grant select, insert on public.dineplan_reconciliation_action_events to service_role;
grant select, update on public.dineplan_reconciliation_settings to service_role;
grant select, insert on public.dineplan_reconciliation_digest_deliveries to service_role;
revoke all on function public.claim_due_dineplan_reconciliation_actions(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_dineplan_reconciliation_actions(integer, integer) to service_role;

comment on table public.dineplan_reconciliation_snapshots is
  'Private, normalized, read-only Dineplan export evidence for temporary Stage 1 reconciliation.';
comment on table public.dineplan_reconciliation_reviews is
  'Operational review metadata only; never mutates authoritative booking state.';
comment on table public.dineplan_reconciliation_actions is
  'Read-only-to-bookings operational actions derived from stored Dineplan reconciliation evidence.';
comment on table public.dineplan_reconciliation_action_events is
  'Immutable acknowledgement, resolution and digest history for Dineplan reconciliation actions.';
comment on table public.dineplan_reconciliation_settings is
  'Staff-recipient and reminder policy for the temporary Dineplan reconciliation action digest.';
