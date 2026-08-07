create table if not exists public.booking_edit_locks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_reference text not null,
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  staff_user_id uuid,
  staff_name text not null,
  staff_role text not null,
  session_id text not null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  takeover_requested_at timestamptz,
  takeover_requested_by uuid references public.staff_profiles(id) on delete set null,
  takeover_requested_by_name text,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_edit_locks_one_active_per_booking_idx
  on public.booking_edit_locks (booking_reference)
  where released_at is null;

create index if not exists booking_edit_locks_active_last_activity_idx
  on public.booking_edit_locks (last_activity_at)
  where released_at is null;

create index if not exists booking_edit_locks_staff_profile_idx
  on public.booking_edit_locks (staff_profile_id)
  where released_at is null;

alter table public.booking_edit_locks enable row level security;

revoke all on public.booking_edit_locks from anon, authenticated;
grant all on public.booking_edit_locks to service_role;
