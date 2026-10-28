-- Phase 54.12: durable, audited Box Office approval and bounded continuation
-- for Phase 54.11 hybrid assignment queues. This migration creates no override.

begin;

create table public.automatic_table_assignment_resume_jobs (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete restrict,
  assignment_revision integer not null check (assignment_revision > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  total_bookings integer not null default 0 check (total_bookings >= 0),
  processed_bookings integer not null default 0 check (processed_bookings >= 0),
  assigned_bookings integer not null default 0 check (assigned_bookings >= 0),
  manual_bookings integer not null default 0 check (manual_bookings >= 0),
  skipped_bookings integer not null default 0 check (skipped_bookings >= 0),
  requested_by_staff_id uuid not null references public.staff_profiles(id) on delete restrict,
  requested_by_auth_user_id uuid not null,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  unique (show_id, assignment_revision)
);

create table public.automatic_table_assignment_resume_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.automatic_table_assignment_resume_jobs(id)
    on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'manual', 'skipped')),
  outcome_reason text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  processed_at timestamptz,
  unique (job_id, booking_id)
);

create index automatic_assignment_resume_jobs_show_idx
  on public.automatic_table_assignment_resume_jobs(show_id, created_at desc);
create index automatic_assignment_resume_job_items_pending_idx
  on public.automatic_table_assignment_resume_job_items(job_id, id)
  where status = 'pending';

alter table public.automatic_table_assignment_resume_jobs enable row level security;
alter table public.automatic_table_assignment_resume_job_items enable row level security;
revoke all on public.automatic_table_assignment_resume_jobs
  from public, anon, authenticated;
revoke all on public.automatic_table_assignment_resume_job_items
  from public, anon, authenticated;
grant select, insert, update on public.automatic_table_assignment_resume_jobs
  to service_role;
grant select, insert, update on public.automatic_table_assignment_resume_job_items
  to service_role;

-- Phase 54.11 verified these performances table by table. Add control metadata
-- only; do not adopt their full layouts and do not create an override.
insert into public.show_physical_seating_layouts (
  show_id, layout_version_id, adoption_status,
  automatic_assignment_enabled, adoption_source,
  pause_threshold_percent, assignment_state,
  threshold_override_active, assignment_revision,
  state_changed_at, state_change_reason
)
select queue.show_id, queue.layout_version_id, 'pending_reconciliation',
  true, 'system_reconciliation',
  setting.default_pause_threshold_percent,
  case
    when (queue.evidence_snapshot ->> 'thresholdApprovalRequired')::integer > 0
      then 'threshold_paused'
    else 'enabled'
  end,
  false, 1, now(),
  case
    when (queue.evidence_snapshot ->> 'thresholdApprovalRequired')::integer > 0
      then 'Phase 54.12 control row: Box Office threshold approval required.'
    else 'Phase 54.12 control row: hybrid table-level assignment enabled.'
  end
from public.physical_seating_reconciliation_queue queue
join public.shows show_row on show_row.id = queue.show_id
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
where queue.reason = 'PHASE_54_11_HYBRID_TABLE_ASSIGNMENT'
  and not exists (
    select 1 from public.show_physical_seating_layouts existing
    where existing.show_id = queue.show_id
  );

create or replace function public.get_box_office_assignment_approval_status(
  p_show_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available_seats integer := 0;
  v_available_units integer := 0;
  v_base jsonb;
  v_job public.automatic_table_assignment_resume_jobs%rowtype;
  v_layout_version_id uuid;
  v_waiting integer := 0;
begin
  v_base := public.get_automatic_table_assignment_status(p_show_id);

  select setting.approved_layout_version_id
    into v_layout_version_id
  from public.shows show_row
  join public.physical_seating_venue_settings setting
    on setting.venue = case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else ''
    end
  where show_row.id = p_show_id;

  select count(*)::integer, coalesce(sum(table_row.capacity), 0)::integer
    into v_available_units, v_available_seats
  from public.show_tables table_row
  where table_row.show_id = p_show_id
    and table_row.booking_id is null
    and table_row.status::text = 'available'
    and table_row.merged_parent_id is null
    and public.resolve_hybrid_table_minimum_occupancy(
      table_row.id,
      v_layout_version_id
    ) is not null;

  select count(*)::integer into v_waiting
  from public.bookings booking
  where booking.show_id = p_show_id
    and booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    )
    and booking.table_id is null
    and not exists (
      select 1 from public.show_tables claimed
      where claimed.booking_id = booking.id
        and claimed.merged_parent_id is null
    );

  select * into v_job
  from public.automatic_table_assignment_resume_jobs job
  where job.show_id = p_show_id
  order by job.created_at desc
  limit 1;

  return v_base || jsonb_build_object(
    'hybridAssignmentEnabled', exists (
      select 1
      from public.physical_seating_reconciliation_queue queue
      where queue.show_id = p_show_id
        and queue.reason = 'PHASE_54_11_HYBRID_TABLE_ASSIGNMENT'
    ),
    'awaitingAssignmentCount', v_waiting,
    'availableTableUnits', v_available_units,
    'availableSeatCapacity', v_available_seats,
    'resumeJob', case when v_job.id is null then null else jsonb_build_object(
      'id', v_job.id,
      'status', v_job.status,
      'totalBookings', v_job.total_bookings,
      'processedBookings', v_job.processed_bookings,
      'assignedBookings', v_job.assigned_bookings,
      'manualBookings', v_job.manual_bookings,
      'skippedBookings', v_job.skipped_bookings,
      'createdAt', v_job.created_at,
      'completedAt', v_job.completed_at,
      'lastError', v_job.last_error
    ) end
  );
end;
$$;

create or replace function public.control_hybrid_table_assignment_phase_54_12(
  p_show_id uuid,
  p_action text,
  p_threshold_percent numeric,
  p_reason text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_actor_role text;
  v_adoption public.show_physical_seating_layouts%rowtype;
  v_before jsonb;
  v_show public.shows%rowtype;
  v_venue text;
begin
  if p_action not in ('pause', 'resume', 'threshold') then
    raise exception 'HYBRID_ASSIGNMENT_ACTION_INVALID';
  end if;
  if p_action in ('pause', 'resume')
     and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'OVERRIDE_REASON_REQUIRED';
  end if;
  if p_action = 'threshold'
     and (p_threshold_percent is null
       or p_threshold_percent < 50
       or p_threshold_percent > 100) then
    raise exception 'PAUSE_THRESHOLD_INVALID';
  end if;

  select staff.* into v_actor
  from public.staff_profiles staff
  where staff.id = p_actor_staff_profile_id
    and staff.user_id = p_actor_auth_user_id
    and staff.active
    and exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission
        on permission.id = role_permission.permission_id
      where role_permission.role_id = staff.role_id
        and permission.key = 'bookings:manage'
    )
    and exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission
        on permission.id = role_permission.permission_id
      where role_permission.role_id = staff.role_id
        and permission.key = 'tables:manage'
    );
  if v_actor.id is null then
    raise exception 'AUTOMATIC_ASSIGNMENT_PERMISSION_REQUIRED';
  end if;
  select role.name into v_actor_role
  from public.roles role where role.id = v_actor.role_id;

  select * into v_show from public.shows where id = p_show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else null
  end;
  if v_venue is null
     or not (
       'all' = any(coalesce(v_actor.venue_scope, '{}'::text[]))
       or v_venue = any(coalesce(v_actor.venue_scope, '{}'::text[]))
     ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'automatic-table-assignment:' || p_show_id::text,
    0
  ));
  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = p_show_id
  for update;
  if v_adoption.show_id is null
     or v_adoption.adoption_status <> 'pending_reconciliation'
     or not exists (
       select 1
       from public.physical_seating_reconciliation_queue queue
       where queue.show_id = p_show_id
         and queue.reason = 'PHASE_54_11_HYBRID_TABLE_ASSIGNMENT'
     ) then
    raise exception 'HYBRID_ASSIGNMENT_CONTROL_NOT_AVAILABLE';
  end if;
  v_before := to_jsonb(v_adoption);

  if p_action = 'resume' then
    update public.show_physical_seating_layouts set
      automatic_assignment_enabled = true,
      assignment_state = 'enabled',
      threshold_override_active = true,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(),
      state_changed_by_staff_id = v_actor.id,
      state_change_reason = trim(p_reason),
      updated_at = now()
    where show_id = p_show_id
    returning * into v_adoption;
  elsif p_action = 'pause' then
    update public.show_physical_seating_layouts set
      automatic_assignment_enabled = true,
      assignment_state = 'manual_paused',
      threshold_override_active = false,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(),
      state_changed_by_staff_id = v_actor.id,
      state_change_reason = trim(p_reason),
      updated_at = now()
    where show_id = p_show_id
    returning * into v_adoption;
  else
    update public.show_physical_seating_layouts set
      pause_threshold_percent = p_threshold_percent,
      threshold_override_active = false,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(),
      state_changed_by_staff_id = v_actor.id,
      state_change_reason = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
    where show_id = p_show_id
    returning * into v_adoption;
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, reason,
    source_area
  ) values (
    'show.automatic-table-assignment-' || p_action,
    p_actor_auth_user_id, coalesce(v_actor.venue_scope, '{}'::text[]),
    v_actor.full_name, v_actor_role, v_actor.id, to_jsonb(v_adoption), v_before,
    array['assignment_state', 'pause_threshold_percent',
      'threshold_override_active'],
    p_show_id::text, v_venue, p_show_id::text, 'show', 'success',
    coalesce(nullif(trim(coalesce(p_reason, '')), ''),
      'Hybrid assignment threshold updated.'),
    'Table Plan'
  );

  return public.get_box_office_assignment_approval_status(p_show_id);
end;
$$;

create or replace function public.resume_hybrid_assignment_phase_54_12(
  p_show_id uuid,
  p_reason text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adoption public.show_physical_seating_layouts%rowtype;
  v_job public.automatic_table_assignment_resume_jobs%rowtype;
  v_status jsonb;
begin
  v_status := public.control_hybrid_table_assignment_phase_54_12(
    p_show_id, 'resume', null, p_reason,
    p_actor_staff_profile_id, p_actor_auth_user_id
  );
  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = p_show_id;

  insert into public.automatic_table_assignment_resume_jobs (
    show_id, assignment_revision, requested_by_staff_id,
    requested_by_auth_user_id, reason
  ) values (
    p_show_id, v_adoption.assignment_revision, p_actor_staff_profile_id,
    p_actor_auth_user_id, trim(p_reason)
  )
  on conflict (show_id, assignment_revision) do update set
    updated_at = automatic_table_assignment_resume_jobs.updated_at
  returning * into v_job;

  insert into public.automatic_table_assignment_resume_job_items (
    job_id, booking_id
  )
  select v_job.id, booking.id
  from public.bookings booking
  where booking.show_id = p_show_id
    and booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    )
    and booking.table_id is null
    and not exists (
      select 1 from public.show_tables claimed
      where claimed.booking_id = booking.id
        and claimed.merged_parent_id is null
    )
  on conflict (job_id, booking_id) do nothing;

  update public.automatic_table_assignment_resume_jobs job set
    total_bookings = (
      select count(*) from public.automatic_table_assignment_resume_job_items item
      where item.job_id = job.id
    ),
    status = case when exists (
      select 1 from public.automatic_table_assignment_resume_job_items item
      where item.job_id = job.id and item.status = 'pending'
    ) then 'pending' else 'completed' end,
    completed_at = case when exists (
      select 1 from public.automatic_table_assignment_resume_job_items item
      where item.job_id = job.id and item.status = 'pending'
    ) then null else now() end,
    updated_at = now()
  where job.id = v_job.id
  returning * into v_job;

  return v_status || jsonb_build_object('resumeJobId', v_job.id);
end;
$$;

create or replace function public.process_hybrid_assignment_resume_job_phase_54_12(
  p_job_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_job public.automatic_table_assignment_resume_jobs%rowtype;
  v_pending integer := 0;
  v_result jsonb;
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'HYBRID_ASSIGNMENT_BATCH_LIMIT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'hybrid-assignment-resume-job:' || p_job_id::text,
    0
  ));
  select * into v_job
  from public.automatic_table_assignment_resume_jobs
  where id = p_job_id
  for update;
  if v_job.id is null then raise exception 'RESUME_JOB_NOT_FOUND'; end if;
  if v_job.status = 'completed' then
    return to_jsonb(v_job);
  end if;
  if not exists (
    select 1
    from public.show_physical_seating_layouts adoption
    where adoption.show_id = v_job.show_id
      and adoption.assignment_revision = v_job.assignment_revision
      and adoption.assignment_state = 'enabled'
      and adoption.threshold_override_active
      and adoption.state_changed_by_staff_id = v_job.requested_by_staff_id
  ) then
    update public.automatic_table_assignment_resume_jobs set
      status = 'failed',
      last_error = 'AUTHORISED_THRESHOLD_OVERRIDE_NO_LONGER_ACTIVE',
      updated_at = now()
    where id = v_job.id
    returning * into v_job;
    return to_jsonb(v_job);
  end if;

  update public.automatic_table_assignment_resume_jobs set
    status = 'processing', updated_at = now(), last_error = null
  where id = v_job.id;

  for v_item in
    select item.id, item.booking_id
    from public.automatic_table_assignment_resume_job_items item
    where item.job_id = v_job.id
      and item.status = 'pending'
    order by item.id
    limit p_limit
    for update of item skip locked
  loop
    v_result := public.try_hybrid_table_assignment_phase_54_11(
      v_item.booking_id
    );
    update public.automatic_table_assignment_resume_job_items set
      status = case v_result ->> 'outcome'
        when 'assigned' then 'assigned'
        when 'manual_queue' then 'manual'
        else 'skipped'
      end,
      outcome_reason = coalesce(v_result ->> 'reason', 'ASSIGNED'),
      result = v_result,
      processed_at = now()
    where id = v_item.id
      and status = 'pending';
  end loop;

  select count(*)::integer into v_pending
  from public.automatic_table_assignment_resume_job_items item
  where item.job_id = v_job.id and item.status = 'pending';

  update public.automatic_table_assignment_resume_jobs job set
    processed_bookings = summary.processed,
    assigned_bookings = summary.assigned,
    manual_bookings = summary.manual,
    skipped_bookings = summary.skipped,
    status = case when v_pending = 0 then 'completed' else 'processing' end,
    completed_at = case when v_pending = 0 then now() else null end,
    updated_at = now()
  from (
    select
      count(*) filter (where item.status <> 'pending')::integer as processed,
      count(*) filter (where item.status = 'assigned')::integer as assigned,
      count(*) filter (where item.status = 'manual')::integer as manual,
      count(*) filter (where item.status = 'skipped')::integer as skipped
    from public.automatic_table_assignment_resume_job_items item
    where item.job_id = v_job.id
  ) summary
  where job.id = v_job.id
  returning job.* into v_job;

  if v_job.status = 'completed' then
    insert into public.audit_events (
      action, actor_auth_user_id, actor_name, actor_staff_profile_id,
      after_values, before_values, changed_fields, entity_id,
      entity_reference, entity_type, outcome, reason, source_area
    )
    select 'show.hybrid-assignment-resume-completed',
      v_job.requested_by_auth_user_id, staff.full_name,
      v_job.requested_by_staff_id,
      jsonb_build_object(
        'jobId', v_job.id,
        'totalBookings', v_job.total_bookings,
        'assignedBookings', v_job.assigned_bookings,
        'manualBookings', v_job.manual_bookings,
        'skippedBookings', v_job.skipped_bookings
      ),
      '{}'::jsonb,
      array['existing_assignment_queue'], v_job.show_id::text,
      v_job.show_id::text, 'show', 'success', v_job.reason, 'Table Plan'
    from public.staff_profiles staff
    where staff.id = v_job.requested_by_staff_id
      and not exists (
        select 1 from public.audit_events existing
        where existing.action = 'show.hybrid-assignment-resume-completed'
          and existing.after_values ->> 'jobId' = v_job.id::text
      );
  end if;

  return to_jsonb(v_job);
end;
$$;

revoke all on function public.get_box_office_assignment_approval_status(uuid)
  from public, anon, authenticated;
revoke all on function public.control_hybrid_table_assignment_phase_54_12(
  uuid, text, numeric, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.resume_hybrid_assignment_phase_54_12(
  uuid, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.process_hybrid_assignment_resume_job_phase_54_12(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.get_box_office_assignment_approval_status(uuid)
  to service_role;
grant execute on function public.control_hybrid_table_assignment_phase_54_12(
  uuid, text, numeric, text, uuid, uuid
) to service_role;
grant execute on function public.resume_hybrid_assignment_phase_54_12(
  uuid, text, uuid, uuid
) to service_role;
grant execute on function public.process_hybrid_assignment_resume_job_phase_54_12(
  uuid, integer
) to service_role;

comment on table public.automatic_table_assignment_resume_jobs is
  'Durable per-approval progress for bounded threshold-resume reconciliation.';
comment on function public.resume_hybrid_assignment_phase_54_12(
  uuid, text, uuid, uuid
) is
  'Records one authorised hybrid threshold resume and snapshots its waiting queue; it never executes without the staff action.';

commit;
