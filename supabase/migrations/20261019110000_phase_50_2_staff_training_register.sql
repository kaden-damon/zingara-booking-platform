-- Phase 50.2: immutable staff training records and acknowledgements.

create table public.staff_training_records (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id),
  trainer_staff_profile_id uuid not null references public.staff_profiles(id),
  title text not null check (char_length(trim(title)) between 3 and 160),
  training_date date not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  description text not null check (char_length(trim(description)) between 3 and 4000),
  competencies text[] not null default '{}',
  demonstrated_independently boolean not null default false,
  acknowledgement_choice text,
  acknowledgement_at timestamptz,
  status text not null default 'awaiting_confirmation',
  corrects_record_id uuid references public.staff_training_records(id),
  correction_reason text,
  created_at timestamptz not null default now(),
  constraint staff_training_acknowledgement_check check (
    acknowledgement_choice is null or acknowledgement_choice in ('understood', 'further_training')
  ),
  constraint staff_training_status_check check (
    status in ('awaiting_confirmation', 'confirmed_understanding', 'further_training_required', 'proficiency_verified')
  ),
  constraint staff_training_correction_check check (
    (corrects_record_id is null and correction_reason is null) or
    (corrects_record_id is not null and char_length(trim(correction_reason)) between 3 and 1000)
  )
);

create table public.staff_training_events (
  id uuid primary key default gen_random_uuid(),
  training_record_id uuid not null references public.staff_training_records(id),
  actor_staff_profile_id uuid not null references public.staff_profiles(id),
  action text not null check (action in ('recorded', 'acknowledged', 'further_training_requested', 'corrected')),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index staff_training_one_correction_per_record
  on public.staff_training_records(corrects_record_id)
  where corrects_record_id is not null;
create unique index staff_training_duplicate_prevention
  on public.staff_training_records(
    staff_profile_id,
    trainer_staff_profile_id,
    training_date,
    start_time,
    lower(title)
  ) where corrects_record_id is null;
create index staff_training_staff_created_idx
  on public.staff_training_records(staff_profile_id, created_at desc, id desc);
create index staff_training_status_created_idx
  on public.staff_training_records(status, created_at desc, id desc);
create index staff_training_trainer_created_idx
  on public.staff_training_records(trainer_staff_profile_id, created_at desc);
create index staff_training_events_record_idx
  on public.staff_training_events(training_record_id, created_at asc);

alter table public.staff_training_records enable row level security;
alter table public.staff_training_events enable row level security;
revoke all on public.staff_training_records from public, anon, authenticated;
revoke all on public.staff_training_events from public, anon, authenticated;
grant all on public.staff_training_records to service_role;
grant all on public.staff_training_events to service_role;

create or replace function public.acknowledge_staff_training(
  p_record_id uuid,
  p_staff_profile_id uuid,
  p_choice text
)
returns public.staff_training_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.staff_training_records;
begin
  if p_choice not in ('understood', 'further_training') then
    raise exception 'Invalid training acknowledgement choice';
  end if;

  select * into v_record
  from public.staff_training_records
  where id = p_record_id
  for update;

  if v_record.id is null then
    raise exception 'Training record not found';
  end if;
  if v_record.staff_profile_id <> p_staff_profile_id then
    raise exception 'Only the trained staff member may acknowledge this record';
  end if;
  if v_record.acknowledgement_choice is not null then
    return v_record;
  end if;

  update public.staff_training_records
  set acknowledgement_choice = p_choice,
      acknowledgement_at = clock_timestamp(),
      status = case
        when p_choice = 'further_training' then 'further_training_required'
        when demonstrated_independently then 'proficiency_verified'
        else 'confirmed_understanding'
      end
  where id = p_record_id
  returning * into v_record;

  insert into public.staff_training_events (
    training_record_id, actor_staff_profile_id, action, details
  ) values (
    p_record_id,
    p_staff_profile_id,
    case when p_choice = 'understood' then 'acknowledged' else 'further_training_requested' end,
    jsonb_build_object('choice', p_choice, 'status', v_record.status)
  );

  return v_record;
end
$$;

revoke all on function public.acknowledge_staff_training(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.acknowledge_staff_training(uuid, uuid, text)
  to service_role;

create or replace function public.create_staff_training_record(
  p_staff_profile_id uuid,
  p_trainer_staff_profile_id uuid,
  p_title text,
  p_training_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_description text,
  p_competencies text[],
  p_demonstrated_independently boolean,
  p_corrects_record_id uuid default null,
  p_correction_reason text default null
)
returns public.staff_training_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.staff_training_records;
begin
  if p_corrects_record_id is not null and not exists (
    select 1 from public.staff_training_records
    where id = p_corrects_record_id and staff_profile_id = p_staff_profile_id
  ) then
    raise exception 'Correction target does not match the trained staff member';
  end if;

  insert into public.staff_training_records (
    staff_profile_id, trainer_staff_profile_id, title, training_date,
    start_time, duration_minutes, description, competencies,
    demonstrated_independently, corrects_record_id, correction_reason
  ) values (
    p_staff_profile_id, p_trainer_staff_profile_id, trim(p_title), p_training_date,
    p_start_time, p_duration_minutes, trim(p_description), coalesce(p_competencies, '{}'),
    p_demonstrated_independently, p_corrects_record_id, nullif(trim(p_correction_reason), '')
  ) returning * into v_record;

  insert into public.staff_training_events (
    training_record_id, actor_staff_profile_id, action, details
  ) values (
    v_record.id,
    p_trainer_staff_profile_id,
    case when p_corrects_record_id is null then 'recorded' else 'corrected' end,
    jsonb_build_object(
      'status', v_record.status,
      'correctsRecordId', p_corrects_record_id,
      'correctionReason', p_correction_reason
    )
  );

  return v_record;
end
$$;

revoke all on function public.create_staff_training_record(
  uuid, uuid, text, date, time, integer, text, text[], boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_staff_training_record(
  uuid, uuid, text, date, time, integer, text, text[], boolean, uuid, text
) to service_role;

comment on table public.staff_training_records is
  'Immutable staff training snapshots. Only acknowledgement fields transition after creation.';
comment on table public.staff_training_events is
  'Append-only evidence for training creation, correction and staff acknowledgement.';
