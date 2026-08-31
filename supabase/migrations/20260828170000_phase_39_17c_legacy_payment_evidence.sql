create table if not exists public.legacy_booking_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  source_system text not null check (source_system = 'dineplan'),
  source_document text not null,
  source_checksum text not null check (source_checksum ~ '^[a-f0-9]{64}$'),
  source_row_number integer not null check (source_row_number > 1),
  source_row_fingerprint text not null check (source_row_fingerprint ~ '^[a-f0-9]{64}$'),
  source_payment_amount numeric(12, 2) not null default 0 check (source_payment_amount >= 0),
  source_ticket_amount numeric(12, 2) not null default 0 check (source_ticket_amount >= 0),
  full_card_amount numeric(12, 2) not null default 0 check (full_card_amount >= 0),
  pre_paid_card_amount numeric(12, 2) not null default 0 check (pre_paid_card_amount >= 0),
  pre_paid_eft_amount numeric(12, 2) not null default 0 check (pre_paid_eft_amount >= 0),
  full_eft_amount numeric(12, 2) not null default 0 check (full_eft_amount >= 0),
  complimentary boolean not null default false,
  complimentary_amount numeric(12, 2) not null default 0 check (complimentary_amount >= 0),
  ticket_gratuity_amount numeric(12, 2) not null default 0 check (ticket_gratuity_amount >= 0),
  bar_tab_paid_amount numeric(12, 2) not null default 0 check (bar_tab_paid_amount >= 0),
  bar_gratuity_amount numeric(12, 2) not null default 0 check (bar_gratuity_amount >= 0),
  halaal_meals_amount numeric(12, 2) not null default 0 check (halaal_meals_amount >= 0),
  kosher_meals_amount numeric(12, 2) not null default 0 check (kosher_meals_amount >= 0),
  classification_reason text not null,
  match_basis text[] not null,
  reconciliation_note text,
  recorded_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (source_checksum, source_row_number),
  unique (source_row_fingerprint),
  check (cardinality(match_basis) > 0)
);

comment on table public.legacy_booking_payment_evidence is
  'Reviewed historical Dineplan payment classification evidence. Modern payment rows remain authoritative.';

alter table public.legacy_booking_payment_evidence enable row level security;

revoke all on table public.legacy_booking_payment_evidence from public, anon, authenticated;
grant select, insert on table public.legacy_booking_payment_evidence to service_role;

create index if not exists legacy_booking_payment_evidence_booking_idx
  on public.legacy_booking_payment_evidence (booking_id);
