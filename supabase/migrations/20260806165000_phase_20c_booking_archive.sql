alter table public.bookings
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text;

create index if not exists bookings_archived_at_idx
  on public.bookings (archived_at);
