-- Phase 49.2: authoritative staff email subscriptions and management routing.

create table if not exists public.staff_email_subscriptions (
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  notification_key text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_profiles(id) on delete set null,
  primary key (staff_profile_id, notification_key),
  constraint staff_email_subscriptions_key_check check (
    notification_key in ('daily-booking-review')
  )
);

create table if not exists public.management_email_notification_routes (
  notification_key text primary key,
  enabled boolean not null default true,
  to_staff_profile_ids uuid[] not null default '{}',
  cc_staff_profile_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_profiles(id) on delete set null,
  constraint management_email_notification_routes_key_check check (
    notification_key in ('corporate-enquiry')
  ),
  constraint management_email_notification_routes_no_overlap check (
    not (to_staff_profile_ids && cc_staff_profile_ids)
  )
);

create table if not exists public.staff_email_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null,
  event_key text not null,
  status text not null default 'processing',
  to_staff_profile_ids uuid[] not null default '{}',
  cc_staff_profile_ids uuid[] not null default '{}',
  attempt_count integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_key, event_key),
  constraint staff_email_notification_deliveries_status_check check (
    status in ('processing', 'sent', 'failed', 'suppressed')
  )
);

alter table public.staff_email_subscriptions enable row level security;
alter table public.management_email_notification_routes enable row level security;
alter table public.staff_email_notification_deliveries enable row level security;

revoke all on public.staff_email_subscriptions from public, anon, authenticated;
revoke all on public.management_email_notification_routes from public, anon, authenticated;
revoke all on public.staff_email_notification_deliveries from public, anon, authenticated;
grant all on public.staff_email_subscriptions to service_role;
grant all on public.management_email_notification_routes to service_role;
grant all on public.staff_email_notification_deliveries to service_role;

create or replace function public.claim_staff_email_notification_delivery(
  p_notification_key text,
  p_event_key text,
  p_to_staff_profile_ids uuid[],
  p_cc_staff_profile_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.staff_email_notification_deliveries (
    notification_key,
    event_key,
    status,
    to_staff_profile_ids,
    cc_staff_profile_ids
  ) values (
    p_notification_key,
    p_event_key,
    'processing',
    coalesce(p_to_staff_profile_ids, '{}'),
    coalesce(p_cc_staff_profile_ids, '{}')
  )
  on conflict (notification_key, event_key) do update
  set status = 'processing',
      to_staff_profile_ids = excluded.to_staff_profile_ids,
      cc_staff_profile_ids = excluded.cc_staff_profile_ids,
      attempt_count = public.staff_email_notification_deliveries.attempt_count + 1,
      last_error = null,
      updated_at = clock_timestamp()
  where public.staff_email_notification_deliveries.status = 'failed'
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.claim_staff_email_notification_delivery(text, text, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_staff_email_notification_delivery(text, text, uuid[], uuid[])
  to service_role;

do $$
declare
  v_lisa uuid;
  v_kaden uuid;
begin
  select id into v_lisa
  from public.staff_profiles
  where active = true and lower(email) = 'lisa@zingara.co.za'
  limit 1;

  select id into v_kaden
  from public.staff_profiles
  where active = true and lower(email) = 'kaden@kaden.co.za'
  limit 1;

  if v_lisa is null or v_kaden is null then
    raise exception 'Authoritative Lisa and Kaden staff profiles are required for Corporate enquiry routing';
  end if;

  insert into public.management_email_notification_routes (
    notification_key,
    enabled,
    to_staff_profile_ids,
    cc_staff_profile_ids
  ) values (
    'corporate-enquiry',
    true,
    array[v_lisa],
    array[v_kaden]
  )
  on conflict (notification_key) do nothing;
end
$$;

comment on table public.staff_email_subscriptions is
  'Optional internal email subscriptions that each staff member may manage only for themselves through the authenticated API.';
comment on table public.management_email_notification_routes is
  'Management-controlled mandatory internal email routing using authoritative staff profile identities.';
comment on table public.staff_email_notification_deliveries is
  'Durable idempotency and delivery evidence for internal staff emails.';
