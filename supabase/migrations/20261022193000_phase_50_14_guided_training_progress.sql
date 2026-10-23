create table if not exists public.academy_guided_training_progress (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  module_id text not null check (module_id in ('standard-booking', 'corporate-booking', 'buyout')),
  module_version integer not null check (module_version > 0),
  status text not null check (status in ('in-progress', 'completed')),
  current_step integer not null default 0 check (current_step >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (staff_profile_id, module_id, module_version)
);

create index if not exists academy_guided_training_progress_staff_status_idx
  on public.academy_guided_training_progress (staff_profile_id, status, updated_at desc);

alter table public.academy_guided_training_progress enable row level security;

revoke all on public.academy_guided_training_progress from anon, authenticated;
grant all on public.academy_guided_training_progress to service_role;

comment on table public.academy_guided_training_progress is
  'Versioned staff Academy Guided Training progress. Completion is not trainer-verified proficiency.';
