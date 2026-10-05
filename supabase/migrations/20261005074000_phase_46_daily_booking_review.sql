create table if not exists public.daily_booking_review_configuration (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  scheduled_time time without time zone not null default '08:00:00',
  subject text not null default 'Your Zingara bookings - {{reportDate}}',
  activated_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.daily_booking_review_configuration (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.daily_booking_review_deliveries (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  report_date date not null,
  status text not null check (status in ('claimed', 'sent', 'failed', 'skipped')),
  primary_email text not null,
  management_cc text,
  booking_count integer not null default 0 check (booking_count >= 0),
  attention_count integer not null default 0 check (attention_count >= 0),
  guest_count integer not null default 0 check (guest_count >= 0),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, report_date)
);

create index if not exists daily_booking_review_deliveries_date_idx
  on public.daily_booking_review_deliveries (report_date desc, status);

alter table public.daily_booking_review_configuration enable row level security;
alter table public.daily_booking_review_deliveries enable row level security;

revoke all on public.daily_booking_review_configuration from anon, authenticated;
revoke all on public.daily_booking_review_deliveries from anon, authenticated;
grant select, insert, update on public.daily_booking_review_configuration to service_role;
grant select, insert, update on public.daily_booking_review_deliveries to service_role;

create or replace function public.claim_daily_booking_review_delivery(
  p_staff_profile_id uuid,
  p_report_date date,
  p_primary_email text,
  p_management_cc text,
  p_booking_count integer,
  p_attention_count integer,
  p_guest_count integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer := 0;
begin
  insert into public.daily_booking_review_deliveries (
    staff_profile_id,
    report_date,
    status,
    primary_email,
    management_cc,
    booking_count,
    attention_count,
    guest_count
  ) values (
    p_staff_profile_id,
    p_report_date,
    'claimed',
    lower(trim(p_primary_email)),
    nullif(lower(trim(p_management_cc)), ''),
    greatest(p_booking_count, 0),
    greatest(p_attention_count, 0),
    greatest(p_guest_count, 0)
  )
  on conflict (staff_profile_id, report_date) do update
    set status = 'claimed',
        primary_email = excluded.primary_email,
        management_cc = excluded.management_cc,
        booking_count = excluded.booking_count,
        attention_count = excluded.attention_count,
        guest_count = excluded.guest_count,
        claimed_at = now(),
        completed_at = null,
        error_message = null,
        updated_at = now()
    where daily_booking_review_deliveries.status = 'failed';

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

create or replace function public.complete_daily_booking_review_delivery(
  p_staff_profile_id uuid,
  p_report_date date,
  p_status text,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Invalid daily booking review delivery status.';
  end if;

  update public.daily_booking_review_deliveries
  set status = p_status,
      completed_at = now(),
      error_message = case when p_status = 'failed' then left(p_error_message, 1000) else null end,
      updated_at = now()
  where staff_profile_id = p_staff_profile_id
    and report_date = p_report_date
    and status = 'claimed';
end;
$$;

revoke all on function public.claim_daily_booking_review_delivery(uuid,date,text,text,integer,integer,integer) from public;
revoke all on function public.complete_daily_booking_review_delivery(uuid,date,text,text) from public;
grant execute on function public.claim_daily_booking_review_delivery(uuid,date,text,text,integer,integer,integer) to service_role;
grant execute on function public.complete_daily_booking_review_delivery(uuid,date,text,text) to service_role;
