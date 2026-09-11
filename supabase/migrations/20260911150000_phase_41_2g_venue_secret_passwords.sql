create table if not exists public.venue_secret_password_schedules (
  id uuid primary key default gen_random_uuid(),
  venue_location text not null check (venue_location in ('cape-town', 'johannesburg')),
  scope_type text not null check (scope_type in ('show', 'date', 'range')),
  show_id uuid references public.shows(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  phrase text not null check (char_length(btrim(phrase)) between 2 and 80),
  enabled boolean not null default true,
  created_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time)),
  check ((scope_type = 'show' and show_id is not null) or (scope_type <> 'show' and show_id is null)),
  check ((scope_type = 'date' and start_date = end_date) or scope_type <> 'date')
);

create unique index if not exists venue_secret_password_one_show_override
  on public.venue_secret_password_schedules(show_id)
  where enabled and scope_type = 'show';

create index if not exists venue_secret_password_schedule_lookup
  on public.venue_secret_password_schedules(venue_location, enabled, start_date, end_date);

create or replace function public.guard_secret_password_schedule_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.phrase := btrim(new.phrase);
  new.updated_at := now();

  perform pg_advisory_xact_lock(hashtext('venue-secret-password:' || new.venue_location));

  if new.enabled and new.scope_type <> 'show' and exists (
    select 1
      from public.venue_secret_password_schedules existing
     where existing.id <> new.id
       and existing.enabled
       and existing.scope_type <> 'show'
       and existing.venue_location = new.venue_location
       and daterange(existing.start_date, existing.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'SECRET_PASSWORD_SCHEDULE_OVERLAP';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_secret_password_schedule_overlap() from public, anon, authenticated;

drop trigger if exists guard_secret_password_schedule_overlap on public.venue_secret_password_schedules;
create trigger guard_secret_password_schedule_overlap
before insert or update on public.venue_secret_password_schedules
for each row execute function public.guard_secret_password_schedule_overlap();

alter table public.venue_secret_password_schedules enable row level security;
revoke all on table public.venue_secret_password_schedules from anon, authenticated;
grant select, insert, update, delete on table public.venue_secret_password_schedules to service_role;
