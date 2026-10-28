-- Phase 54.9: reconcile an existing assignment queue only after an authorised,
-- audited Box Office threshold-resume action. The 70% default remains intact.

create or replace function public.reconcile_authorized_threshold_assignment_batch(
  p_show_id uuid,
  p_limit integer,
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
  v_assigned integer := 0;
  v_booking record;
  v_manual integer := 0;
  v_processed integer := 0;
  v_remaining integer := 0;
  v_result jsonb;
  v_show public.shows%rowtype;
  v_skipped integer := 0;
  v_venue text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'THRESHOLD_RECONCILIATION_LIMIT_INVALID';
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
  from public.roles role
  where role.id = v_actor.role_id;

  select * into v_show
  from public.shows
  where id = p_show_id
  for share;
  if v_show.id is null then
    raise exception 'SHOW_NOT_FOUND';
  end if;

  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town')
      then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg')
      then 'johannesburg'
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
     or v_adoption.adoption_status <> 'adopted'
     or not v_adoption.automatic_assignment_enabled
     or v_adoption.assignment_state <> 'enabled'
     or not v_adoption.threshold_override_active
     or v_adoption.state_changed_by_staff_id <> v_actor.id
     or nullif(trim(coalesce(v_adoption.state_change_reason, '')), '') is null then
    raise exception 'AUTHORISED_THRESHOLD_OVERRIDE_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.audit_events audit
    where audit.action = 'show.automatic-table-assignment-resume'
      and audit.outcome = 'success'
      and audit.entity_type = 'show'
      and audit.entity_id = p_show_id::text
      and audit.actor_staff_profile_id = v_actor.id
      and audit.actor_auth_user_id = p_actor_auth_user_id
      and audit.created_at between
        v_adoption.state_changed_at - interval '5 seconds'
        and v_adoption.state_changed_at + interval '5 seconds'
      and coalesce((audit.after_values ->> 'threshold_override_active')::boolean, false)
      and audit.after_values ->> 'assignment_state' = 'enabled'
  ) then
    raise exception 'THRESHOLD_OVERRIDE_AUDIT_REQUIRED';
  end if;

  for v_booking in
    select booking.id
    from public.bookings booking
    where booking.show_id = p_show_id
      and booking.archived_at is null
      and booking.booking_status::text in (
        'new', 'pending_payment', 'confirmed', 'checked_in'
      )
      and booking.table_id is null
      and not exists (
        select 1
        from public.show_tables claimed
        where claimed.booking_id = booking.id
          and claimed.merged_parent_id is null
      )
    order by booking.guest_count desc, booking.created_at, booking.id
    limit p_limit
    for update of booking skip locked
  loop
    v_result := public.try_automatic_table_assignment_phase_54_5(v_booking.id);
    v_processed := v_processed + 1;
    if v_result ->> 'outcome' = 'assigned' then
      v_assigned := v_assigned + 1;
    elsif v_result ->> 'outcome' = 'manual_queue' then
      v_manual := v_manual + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  select count(*)::integer into v_remaining
  from public.bookings booking
  where booking.show_id = p_show_id
    and booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    )
    and booking.table_id is null
    and not exists (
      select 1
      from public.show_tables claimed
      where claimed.booking_id = booking.id
        and claimed.merged_parent_id is null
    );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, reason,
    source_area
  ) values (
    'show.threshold-override-queue-reconciled', p_actor_auth_user_id,
    coalesce(v_actor.venue_scope, '{}'::text[]), v_actor.full_name, v_actor_role,
    v_actor.id,
    jsonb_build_object(
      'processedBookings', v_processed,
      'assignedBookings', v_assigned,
      'manualReviewBookings', v_manual,
      'skippedBookings', v_skipped,
      'remainingBookings', v_remaining,
      'assignmentRevision', v_adoption.assignment_revision,
      'thresholdPercent', v_adoption.pause_threshold_percent
    ),
    jsonb_build_object(
      'assignmentState', v_adoption.assignment_state,
      'thresholdOverrideActive', v_adoption.threshold_override_active
    ),
    array['existing_assignment_queue'], p_show_id::text, v_venue,
    p_show_id::text, 'show', 'success', v_adoption.state_change_reason,
    'Table Plan'
  );

  return jsonb_build_object(
    'processedBookings', v_processed,
    'assignedBookings', v_assigned,
    'manualReviewBookings', v_manual,
    'skippedBookings', v_skipped,
    'remainingBookings', v_remaining
  );
end;
$$;

revoke all on function public.reconcile_authorized_threshold_assignment_batch(
  uuid, integer, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.reconcile_authorized_threshold_assignment_batch(
  uuid, integer, uuid, uuid
) to service_role;

comment on function public.reconcile_authorized_threshold_assignment_batch(
  uuid, integer, uuid, uuid
) is
  'Processes one bounded existing-booking batch only after a matching authorised and audited threshold-resume action; it never creates or changes an override.';

create or replace function public.resume_and_reconcile_threshold_assignment(
  p_show_id uuid,
  p_reason text,
  p_limit integer,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reconciliation jsonb;
  v_status jsonb;
begin
  v_status := public.control_automatic_table_assignment(
    p_show_id,
    'resume',
    null,
    p_reason,
    p_actor_staff_profile_id,
    p_actor_auth_user_id
  );
  v_reconciliation := public.reconcile_authorized_threshold_assignment_batch(
    p_show_id,
    p_limit,
    p_actor_staff_profile_id,
    p_actor_auth_user_id
  );
  return v_status || jsonb_build_object(
    'queueReconciliation', v_reconciliation
  );
end;
$$;

revoke all on function public.resume_and_reconcile_threshold_assignment(
  uuid, text, integer, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.resume_and_reconcile_threshold_assignment(
  uuid, text, integer, uuid, uuid
) to service_role;

comment on function public.resume_and_reconcile_threshold_assignment(
  uuid, text, integer, uuid, uuid
) is
  'Atomically records an authorised threshold resume and reconciles one bounded existing-booking batch; any failure rolls back both operations.';
