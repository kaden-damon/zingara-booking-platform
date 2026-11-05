begin;

create table if not exists public.financial_policy_releases (
  policy_key text primary key,
  activated_at timestamptz,
  activated_by text,
  deployment_id text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_policy_releases enable row level security;
revoke all on table public.financial_policy_releases from public, anon, authenticated;
grant all on table public.financial_policy_releases to service_role;

insert into public.financial_policy_releases (
  policy_key,
  evidence
)
values (
  'online-gratuity-pay-at-venue',
  jsonb_build_object(
    'scope', 'new customer-originated online bookings only',
    'historicalFinancialsChanged', false,
    'activationStatus', 'pending-production-verification'
  )
)
on conflict (policy_key) do nothing;

comment on table public.financial_policy_releases is
  'Immutable activation evidence for financial policy transitions. Application code does not use this table to recalculate historical bookings.';

commit;
