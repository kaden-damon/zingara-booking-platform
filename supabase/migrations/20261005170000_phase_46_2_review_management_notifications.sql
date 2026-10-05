create table if not exists public.review_management_configuration (
  id boolean primary key default true check (id),
  immediate_enabled boolean not null default false,
  daily_enabled boolean not null default false,
  daily_time time without time zone not null default '08:00:00',
  immediate_recipient_staff_ids uuid[] not null default '{}'::uuid[],
  daily_recipient_staff_ids uuid[] not null default '{}'::uuid[],
  immediate_activated_at timestamptz,
  daily_activated_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.review_management_configuration (
  id, immediate_recipient_staff_ids, daily_recipient_staff_ids
)
select true, coalesce(array_agg(id order by full_name), '{}'::uuid[]), coalesce(array_agg(id order by full_name), '{}'::uuid[])
from public.staff_profiles
where active = true
  and lower(email) in ('kaden@kaden.co.za', 'nicky-annedebeer@zingara.co.za')
on conflict (id) do nothing;

create table if not exists public.review_management_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.guest_reviews(id) on delete restrict,
  status text not null check (status in ('claimed', 'sent', 'failed')),
  primary_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id)
);

create table if not exists public.review_management_daily_deliveries (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('claimed', 'sent', 'failed', 'skipped')),
  primary_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  review_count integer not null default 0 check (review_count >= 0),
  attention_count integer not null default 0 check (attention_count >= 0),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);

alter table public.review_management_configuration enable row level security;
alter table public.review_management_alert_deliveries enable row level security;
alter table public.review_management_daily_deliveries enable row level security;
revoke all on public.review_management_configuration, public.review_management_alert_deliveries, public.review_management_daily_deliveries from anon, authenticated;
grant select, insert, update on public.review_management_configuration, public.review_management_alert_deliveries, public.review_management_daily_deliveries to service_role;

create or replace function public.claim_review_management_alert(p_review_id uuid, p_primary_emails text[], p_cc_emails text[])
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  insert into public.review_management_alert_deliveries (review_id, status, primary_emails, cc_emails)
  values (p_review_id, 'claimed', coalesce(p_primary_emails, '{}'), coalesce(p_cc_emails, '{}'))
  on conflict (review_id) do update set
    status = 'claimed', primary_emails = excluded.primary_emails, cc_emails = excluded.cc_emails,
    claimed_at = now(), completed_at = null, error_message = null, updated_at = now()
  where review_management_alert_deliveries.status = 'failed';
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

create or replace function public.complete_review_management_alert(p_review_id uuid, p_status text, p_error_message text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent', 'failed') then raise exception 'Invalid review alert delivery status.'; end if;
  update public.review_management_alert_deliveries set status = p_status, completed_at = now(),
    error_message = case when p_status = 'failed' then left(p_error_message, 1000) else null end, updated_at = now()
  where review_id = p_review_id and status = 'claimed';
end; $$;

create or replace function public.claim_review_management_daily(p_report_date date, p_period_start timestamptz, p_period_end timestamptz, p_primary_emails text[], p_cc_emails text[], p_review_count integer, p_attention_count integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  insert into public.review_management_daily_deliveries (report_date, period_start, period_end, status, primary_emails, cc_emails, review_count, attention_count)
  values (p_report_date, p_period_start, p_period_end, 'claimed', coalesce(p_primary_emails, '{}'), coalesce(p_cc_emails, '{}'), greatest(p_review_count, 0), greatest(p_attention_count, 0))
  on conflict (report_date) do update set
    status = 'claimed', period_start = excluded.period_start, period_end = excluded.period_end,
    primary_emails = excluded.primary_emails, cc_emails = excluded.cc_emails,
    review_count = excluded.review_count, attention_count = excluded.attention_count,
    claimed_at = now(), completed_at = null, error_message = null, updated_at = now()
  where review_management_daily_deliveries.status = 'failed';
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

create or replace function public.complete_review_management_daily(p_report_date date, p_status text, p_error_message text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then raise exception 'Invalid review summary delivery status.'; end if;
  update public.review_management_daily_deliveries set status = p_status, completed_at = now(),
    error_message = case when p_status = 'failed' then left(p_error_message, 1000) else null end, updated_at = now()
  where report_date = p_report_date and status = 'claimed';
end; $$;

revoke all on function public.claim_review_management_alert(uuid,text[],text[]) from public;
revoke all on function public.complete_review_management_alert(uuid,text,text) from public;
revoke all on function public.claim_review_management_daily(date,timestamptz,timestamptz,text[],text[],integer,integer) from public;
revoke all on function public.complete_review_management_daily(date,text,text) from public;
grant execute on function public.claim_review_management_alert(uuid,text[],text[]) to service_role;
grant execute on function public.complete_review_management_alert(uuid,text,text) to service_role;
grant execute on function public.claim_review_management_daily(date,timestamptz,timestamptz,text[],text[],integer,integer) to service_role;
grant execute on function public.complete_review_management_daily(date,text,text) to service_role;
