create table if not exists booking_payment_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  booking_reference text not null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked', 'used', 'expired')),
  expires_at timestamptz not null,
  sent_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists booking_payment_links_booking_id_idx
  on booking_payment_links (booking_id);

create index if not exists booking_payment_links_reference_status_idx
  on booking_payment_links (booking_reference, status);

create index if not exists booking_payment_links_expires_at_idx
  on booking_payment_links (expires_at);

alter table public.booking_payment_links enable row level security;
