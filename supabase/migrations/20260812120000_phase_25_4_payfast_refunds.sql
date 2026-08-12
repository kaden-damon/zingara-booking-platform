create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  booking_reference text not null,
  provider text not null default 'payfast',
  provider_payment_id text not null,
  provider_refund_id text,
  refund_amount numeric(10,2) not null check (refund_amount > 0),
  refund_type text not null default 'full' check (refund_type in ('full')),
  refund_reason text not null check (char_length(trim(refund_reason)) between 3 and 255),
  refund_status text not null default 'processing' check (
    refund_status in ('processing', 'accepted', 'failed')
  ),
  provider_response jsonb not null default '{}'::jsonb,
  requested_by uuid references public.staff_profiles(id) on delete set null,
  requested_auth_user_id uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_refunds_full_success_uidx
  on public.payment_refunds (booking_id)
  where refund_type = 'full' and refund_status in ('processing', 'accepted');

create index if not exists payment_refunds_booking_reference_idx
  on public.payment_refunds (booking_reference, created_at desc);

create index if not exists payment_refunds_provider_payment_idx
  on public.payment_refunds (provider, provider_payment_id, created_at desc);

alter table public.payment_refunds enable row level security;

revoke all on table public.payment_refunds from anon, authenticated;
grant select, insert, update, delete on table public.payment_refunds to service_role;
