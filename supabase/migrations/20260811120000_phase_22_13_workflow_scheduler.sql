do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'post_show_review'
      and enumtypid = 'public.communication_type'::regtype
  ) then
    alter type public.communication_type add value 'post_show_review';
  end if;
end $$;

create table if not exists public.workflow_configurations (
  id uuid primary key default gen_random_uuid(),
  workflow_key text not null unique check (workflow_key in ('pre_show_reminder', 'post_show_review')),
  enabled boolean not null default false,
  timing_offset_days integer not null,
  activated_at timestamptz,
  subject text not null,
  body text not null,
  cape_town_review_url text,
  johannesburg_review_url text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (timing_offset_days between 1 and 30),
  check (
    workflow_key <> 'post_show_review'
    or timing_offset_days between 1 and 7
  ),
  check (
    cape_town_review_url is null
    or cape_town_review_url = ''
    or cape_town_review_url ~* '^https://'
  ),
  check (
    johannesburg_review_url is null
    or johannesburg_review_url = ''
    or johannesburg_review_url ~* '^https://'
  )
);

create index if not exists workflow_configurations_enabled_idx
  on public.workflow_configurations (enabled, workflow_key);

alter table public.workflow_configurations enable row level security;

revoke all on public.workflow_configurations from anon, authenticated;
grant select, insert, update on public.workflow_configurations to service_role;

insert into public.workflow_configurations (
  workflow_key,
  enabled,
  timing_offset_days,
  activated_at,
  subject,
  body,
  cape_town_review_url,
  johannesburg_review_url
) values
  (
    'pre_show_reminder',
    false,
    7,
    null,
    'Your Zingara experience is almost here ✨',
    'Dear {{customerName}}, your Zingara experience is almost here. We look forward to welcoming you for {{showName}} on {{showDate}} at {{showTime}}. Booking reference: {{bookingRef}}. Location: {{location}}. Guests: {{guest_count}}. Seating zone: {{seatingZone}}. View your ticket: {{ticketUrl}}. Beverages are charged separately. A 12.5% gratuity will be applied to beverages and the dinner portion of your tickets for bookings of 6 or more.',
    null,
    null
  ),
  (
    'post_show_review',
    false,
    1,
    null,
    'Rate your Zingara experience',
    'Dear {{customerName}}, thank you for joining us at {{showName}}. We hope your evening with Zingara was unforgettable. We would be grateful if you shared your experience with us: {{reviewUrl}}',
    null,
    null
  )
on conflict (workflow_key) do nothing;
