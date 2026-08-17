create sequence if not exists public.staff_issue_ticket_reference_seq;

create or replace function public.generate_staff_issue_ticket_reference()
returns text
language sql
as $$
  select 'BUG-' || lpad(nextval('public.staff_issue_ticket_reference_seq')::text, 6, '0')
$$;

create table if not exists public.staff_issue_reports (
  id uuid primary key default gen_random_uuid(),
  ticket_reference text not null unique default public.generate_staff_issue_ticket_reference(),
  reporter_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  category text not null check (
    category in (
      'system_technical',
      'operations',
      'booking',
      'payments',
      'customer_crm',
      'floor_seating',
      'tickets_qr',
      'ux_ui',
      'reporting_analytics',
      'feature_request',
      'other'
    )
  ),
  priority text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'critical')
  ),
  status text not null default 'logged' check (
    status in ('logged', 'scheduled', 'in_progress', 'completed')
  ),
  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  location text,
  module_or_area text,
  admin_notes text,
  resolution_notes text,
  metadata jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_issue_reports_reporter_idx
  on public.staff_issue_reports (reporter_staff_id, created_at desc);

create index if not exists staff_issue_reports_status_idx
  on public.staff_issue_reports (status, created_at desc);

create index if not exists staff_issue_reports_priority_idx
  on public.staff_issue_reports (priority, created_at desc);

create index if not exists staff_issue_reports_category_idx
  on public.staff_issue_reports (category, created_at desc);

create index if not exists staff_issue_reports_created_at_idx
  on public.staff_issue_reports (created_at desc);

create or replace function public.set_staff_issue_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.title = trim(new.title);
  new.description = trim(new.description);
  new.location = nullif(trim(coalesce(new.location, '')), '');
  new.module_or_area = nullif(trim(coalesce(new.module_or_area, '')), '');
  new.admin_notes = nullif(trim(coalesce(new.admin_notes, '')), '');
  new.resolution_notes = nullif(trim(coalesce(new.resolution_notes, '')), '');
  return new;
end;
$$;

drop trigger if exists staff_issue_reports_set_updated_at on public.staff_issue_reports;
create trigger staff_issue_reports_set_updated_at
  before insert or update on public.staff_issue_reports
  for each row
  execute function public.set_staff_issue_reports_updated_at();

alter table public.staff_issue_reports enable row level security;

revoke all on public.staff_issue_reports from anon, authenticated;
grant select, insert, update, delete on public.staff_issue_reports to service_role;
grant usage, select on sequence public.staff_issue_ticket_reference_seq to service_role;
