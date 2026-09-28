-- Phase 41.2W-P0-H: configurable SAST Dineplan email checkpoints.

alter table public.dineplan_reconciliation_settings
  add column if not exists scheduled_emails_enabled boolean not null default false,
  add column if not exists morning_email_time time not null default time '09:00',
  add column if not exists midday_email_time time not null default time '12:00',
  add column if not exists final_email_time time not null default time '15:30';

update public.dineplan_reconciliation_settings
   set scheduled_emails_enabled = hourly_reminders_enabled
 where scheduled_emails_enabled is distinct from hourly_reminders_enabled;

alter table public.dineplan_reconciliation_settings
  drop constraint if exists dineplan_reconciliation_settings_schedule_order_check;

alter table public.dineplan_reconciliation_settings
  add constraint dineplan_reconciliation_settings_schedule_order_check
  check (morning_email_time < midday_email_time and midday_email_time < final_email_time);

alter table public.dineplan_reconciliation_digest_deliveries
  drop constraint if exists dineplan_reconciliation_digest_deliveries_delivery_type_check;

alter table public.dineplan_reconciliation_digest_deliveries
  add constraint dineplan_reconciliation_digest_deliveries_delivery_type_check
  check (delivery_type in ('hourly','pre_show','preview','immediate','scheduled','upload_reminder'));

create table if not exists public.dineplan_reconciliation_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  venue text not null check (venue in ('cape-town','johannesburg')),
  performance_date date not null,
  checkpoint_date date not null,
  checkpoint_name text not null check (checkpoint_name in ('morning','midday','final')),
  checkpoint_at timestamptz not null,
  status text not null default 'claimed' check (status in ('claimed','failed','sent','skipped')),
  delivery_kind text not null default 'none' check (delivery_kind in ('none','action_digest','upload_reminder','review_reminder')),
  result text,
  source_snapshot_id uuid references public.dineplan_reconciliation_snapshots(id) on delete set null,
  error_message text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (show_id, checkpoint_date, checkpoint_name)
);

create index if not exists dineplan_reconciliation_schedule_runs_latest_idx
  on public.dineplan_reconciliation_schedule_runs (checkpoint_at desc);

create or replace function public.claim_dineplan_schedule_checkpoint(
  p_show_id uuid,
  p_venue text,
  p_performance_date date,
  p_checkpoint_date date,
  p_checkpoint_name text,
  p_checkpoint_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_venue not in ('cape-town','johannesburg')
     or p_checkpoint_name not in ('morning','midday','final') then
    raise exception 'Invalid Dineplan schedule checkpoint';
  end if;

  insert into public.dineplan_reconciliation_schedule_runs (
    show_id,
    venue,
    performance_date,
    checkpoint_date,
    checkpoint_name,
    checkpoint_at
  ) values (
    p_show_id,
    p_venue,
    p_performance_date,
    p_checkpoint_date,
    p_checkpoint_name,
    p_checkpoint_at
  )
  on conflict (show_id, checkpoint_date, checkpoint_name)
  do update
     set status = 'claimed',
         result = null,
         error_message = null,
         attempt_count = dineplan_reconciliation_schedule_runs.attempt_count + 1,
         claimed_at = now(),
         completed_at = null
   where dineplan_reconciliation_schedule_runs.status = 'failed'
      or (
        dineplan_reconciliation_schedule_runs.status = 'claimed'
        and dineplan_reconciliation_schedule_runs.claimed_at < now() - interval '15 minutes'
      )
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.claim_due_dineplan_reconciliation_actions(integer, integer);

create function public.claim_due_dineplan_reconciliation_actions(
  p_normal_acknowledged_cadence_hours integer default 3,
  p_limit integer default 500,
  p_show_ids uuid[] default null,
  p_notified_before timestamptz default null
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
       and (p_show_ids is null or a.show_id = any(p_show_ids))
       and (
         a.action_kind = 'verify_payment'
         or ((a.performance_date + coalesce(a.performance_time, time '23:59')) at time zone 'Africa/Johannesburg') >= now()
       )
       and (
         a.last_notified_at is null
         or (
           p_notified_before is not null
           and a.last_notified_at <= p_notified_before
         )
         or (
           p_notified_before is null
           and a.last_notified_at <= now() - make_interval(hours => case
             when a.severity = 'critical' or a.status = 'unacknowledged' then 1
             else greatest(1, least(24, p_normal_acknowledged_cadence_hours))
           end)
         )
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

alter table public.dineplan_reconciliation_schedule_runs enable row level security;
revoke all on public.dineplan_reconciliation_schedule_runs from public, anon, authenticated;
grant select, insert, update on public.dineplan_reconciliation_schedule_runs to service_role;

revoke all on function public.claim_dineplan_schedule_checkpoint(uuid, text, date, date, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_dineplan_schedule_checkpoint(uuid, text, date, date, text, timestamptz)
  to service_role;

revoke all on function public.claim_due_dineplan_reconciliation_actions(integer, integer, uuid[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_dineplan_reconciliation_actions(integer, integer, uuid[], timestamptz)
  to service_role;

comment on table public.dineplan_reconciliation_schedule_runs is
  'Atomic delivery ledger for configurable SAST Dineplan email checkpoints; never mutates booking data.';
