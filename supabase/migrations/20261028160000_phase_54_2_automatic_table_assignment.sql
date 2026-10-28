begin;

alter table public.physical_seating_venue_settings
  add column if not exists default_pause_threshold_percent numeric(5,2) not null default 70
    check (default_pause_threshold_percent >= 50 and default_pause_threshold_percent <= 100),
  add column if not exists review_reminder_days integer not null default 10
    check (review_reminder_days between 1 and 60);

alter table public.show_physical_seating_layouts
  add column if not exists pause_threshold_percent numeric(5,2)
    check (pause_threshold_percent is null or pause_threshold_percent between 50 and 100),
  add column if not exists assignment_state text not null default 'disabled'
    check (assignment_state in ('disabled', 'enabled', 'threshold_paused', 'manual_paused')),
  add column if not exists threshold_override_active boolean not null default false,
  add column if not exists assignment_revision integer not null default 1 check (assignment_revision > 0),
  add column if not exists state_changed_at timestamptz,
  add column if not exists state_changed_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  add column if not exists state_change_reason text;

create table public.automatic_table_assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  booking_reference text not null,
  booking_kind text not null check (booking_kind in ('standard', 'corporate', 'buyout')),
  outcome text not null check (outcome in ('assigned', 'manual_queue', 'skipped')),
  reason_code text not null,
  reason_detail text not null,
  target_table_id uuid references public.show_tables(id) on delete restrict,
  target_table_code text,
  target_table_ids uuid[] not null default '{}',
  target_table_codes text[] not null default '{}',
  occupancy_guests integer,
  occupancy_percent numeric(7,2),
  threshold_percent numeric(5,2),
  created_at timestamptz not null default now()
);

create index automatic_table_assignment_attempts_show_idx
  on public.automatic_table_assignment_attempts(show_id, created_at desc);
create index automatic_table_assignment_manual_queue_idx
  on public.automatic_table_assignment_attempts(show_id, created_at desc)
  where outcome = 'manual_queue';

create table public.automatic_table_assignment_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  show_id uuid not null references public.shows(id) on delete restrict,
  event_type text not null check (event_type in ('threshold_reached', 'review_reminder')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claim_token uuid,
  delivered_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now()
);

create index automatic_table_assignment_notifications_pending_idx
  on public.automatic_table_assignment_notification_events(available_at, created_at)
  where delivered_at is null;

alter table public.automatic_table_assignment_attempts enable row level security;
alter table public.automatic_table_assignment_notification_events enable row level security;
revoke all on public.automatic_table_assignment_attempts from public, anon, authenticated;
revoke all on public.automatic_table_assignment_notification_events from public, anon, authenticated;
grant select, insert on public.automatic_table_assignment_attempts to service_role;
grant select, insert, update on public.automatic_table_assignment_notification_events to service_role;

create or replace function public.validate_show_physical_layout_eligibility(p_show_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved_count integer := 0;
  v_capacity_match_count integer := 0;
  v_configured_mismatch_count integer := 0;
  v_conflicting_occupancy jsonb := '[]'::jsonb;
  v_layout_version_id uuid;
  v_match_count integer := 0;
  v_mismatch_count integer := 0;
  v_pending_reconciliation integer := 0;
  v_show public.shows%rowtype;
  v_unset_capacity_count integer := 0;
  v_unsafe_assigned_count integer := 0;
  v_venue text;
begin
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then
    return jsonb_build_object('eligible', false, 'reason', 'SHOW_NOT_FOUND');
  end if;

  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
    else null
  end;
  if v_venue is null then
    return jsonb_build_object('eligible', false, 'reason', 'SUPPORTED_VENUE_REQUIRED');
  end if;

  select setting.approved_layout_version_id
    into v_layout_version_id
    from public.physical_seating_venue_settings setting
   where setting.venue = v_venue;
  if v_layout_version_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'APPROVED_LAYOUT_REQUIRED');
  end if;

  select count(*)::integer
    into v_approved_count
    from public.physical_seating_layout_tables
   where layout_version_id = v_layout_version_id;

  select count(*)::integer
    into v_match_count
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and coalesce(cardinality(table_row.merged_from), 0) = 0
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
   where approved.layout_version_id = v_layout_version_id;

  v_mismatch_count := greatest(v_approved_count - v_match_count, 0);

  select
      count(*) filter (
        where table_row.capacity_configured and table_row.capacity = approved.maximum_guests
      )::integer,
      count(*) filter (
        where not table_row.capacity_configured or table_row.capacity is null
      )::integer,
      count(*) filter (
        where table_row.capacity_configured and table_row.capacity is distinct from approved.maximum_guests
      )::integer,
      count(*) filter (
        where (not table_row.capacity_configured or table_row.capacity is null)
          and table_row.booking_id is not null
      )::integer
    into v_capacity_match_count, v_unset_capacity_count,
      v_configured_mismatch_count, v_unsafe_assigned_count
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and coalesce(cardinality(table_row.merged_from), 0) = 0
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
   where approved.layout_version_id = v_layout_version_id;

  select count(*)::integer
    into v_pending_reconciliation
    from public.physical_seating_reconciliation_queue queue
   where queue.show_id = p_show_id
     and queue.layout_version_id = v_layout_version_id
     and queue.status = 'pending';

  with occupancy as (
    select zone.zone_id,
           zone.approved_physical_capacity,
           coalesce(sum(public.booking_zone_entitlement_pax(
             booking.zone_entitlements,
             booking.section,
             booking.guest_count,
             zone.zone_id
           )) filter (
             where booking.archived_at is null
               and booking.booking_status::text in ('new', 'pending_payment', 'confirmed', 'checked_in')
           ), 0)::integer as guests
      from public.physical_seating_layout_zones zone
      left join public.bookings booking on booking.show_id = p_show_id
     where zone.layout_version_id = v_layout_version_id
     group by zone.zone_id, zone.approved_physical_capacity
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'zoneId', zone_id,
           'guests', guests,
           'approvedCapacity', approved_physical_capacity
         ) order by zone_id), '[]'::jsonb)
    into v_conflicting_occupancy
    from occupancy
   where guests > approved_physical_capacity;

  return jsonb_build_object(
    'eligible', v_approved_count = 74
      and v_match_count = v_approved_count
      and v_configured_mismatch_count = 0
      and v_unsafe_assigned_count = 0
      and v_pending_reconciliation = 0
      and jsonb_array_length(v_conflicting_occupancy) = 0,
    'reason', case
      when v_approved_count <> 74 then 'APPROVED_LAYOUT_INCOMPLETE'
      when v_mismatch_count > 0 then 'OPERATIONAL_TABLES_DO_NOT_MATCH_APPROVED_LAYOUT'
      when v_configured_mismatch_count > 0 then 'CONFIGURED_CAPACITY_CONFLICT'
      when v_unsafe_assigned_count > 0 then 'ASSIGNED_TABLE_CAPACITY_REVIEW_REQUIRED'
      when v_pending_reconciliation > 0 then 'RECONCILIATION_REQUIRED'
      when jsonb_array_length(v_conflicting_occupancy) > 0 then 'APPROVED_CAPACITY_CONFLICT'
      else 'ELIGIBLE'
    end,
    'venue', v_venue,
    'layoutVersionId', v_layout_version_id,
    'approvedTableCount', v_approved_count,
    'matchingTableCount', v_match_count,
    'mismatchCount', v_mismatch_count,
    'configuredCapacityMatchCount', v_capacity_match_count,
    'unsetPermanentCapacityCount', v_unset_capacity_count,
    'configuredCapacityConflictCount', v_configured_mismatch_count,
    'assignedUnsetCapacityCount', v_unsafe_assigned_count,
    'pendingReconciliationCount', v_pending_reconciliation,
    'occupancyConflicts', v_conflicting_occupancy
  );
end;
$$;

create or replace function public.get_automatic_table_assignment_status(p_show_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adoption public.show_physical_seating_layouts%rowtype;
  v_eligibility jsonb;
  v_occupancy integer := 0;
  v_show public.shows%rowtype;
  v_threshold numeric(5,2) := 70;
  v_venue_settings public.physical_seating_venue_settings%rowtype;
begin
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;

  select * into v_venue_settings
    from public.physical_seating_venue_settings setting
   where setting.venue = case
     when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
     when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
     else ''
   end;
  select * into v_adoption from public.show_physical_seating_layouts where show_id = p_show_id;
  v_eligibility := public.validate_show_physical_layout_eligibility(p_show_id);
  v_threshold := coalesce(v_adoption.pause_threshold_percent, v_venue_settings.default_pause_threshold_percent, 70);

  select coalesce(sum(booking.guest_count), 0)::integer
    into v_occupancy
    from public.bookings booking
   where booking.show_id = p_show_id
     and booking.archived_at is null
     and booking.booking_status::text in ('new', 'pending_payment', 'confirmed', 'checked_in');

  return jsonb_build_object(
    'showId', v_show.id,
    'venue', v_venue_settings.venue,
    'showDate', v_show.date,
    'showTime', v_show.time,
    'globalEnabled', coalesce(v_venue_settings.automatic_assignment_enabled, false),
    'globalThresholdPercent', coalesce(v_venue_settings.default_pause_threshold_percent, 70),
    'reviewReminderDays', coalesce(v_venue_settings.review_reminder_days, 10),
    'adoptionStatus', coalesce(v_adoption.adoption_status, 'pending_reconciliation'),
    'showEnabled', coalesce(v_adoption.automatic_assignment_enabled, false),
    'assignmentState', coalesce(v_adoption.assignment_state, 'disabled'),
    'thresholdOverrideActive', coalesce(v_adoption.threshold_override_active, false),
    'pauseThresholdPercent', v_threshold,
    'occupancyGuests', v_occupancy,
    'occupancyPercent', round((v_occupancy::numeric / 415::numeric) * 100, 2),
    'eligibility', v_eligibility,
    'stateChangedAt', v_adoption.state_changed_at,
    'stateChangeReason', v_adoption.state_change_reason
  );
end;
$$;

create or replace function public.control_automatic_table_assignment(
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
  v_eligibility jsonb;
  v_layout_version_id uuid;
  v_populated_capacity_count integer := 0;
  v_show public.shows%rowtype;
  v_venue text;
begin
  select staff.* into v_actor
    from public.staff_profiles staff
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (
       select 1 from public.role_permissions role_permission
       join public.permissions permission on permission.id = role_permission.permission_id
       where role_permission.role_id = staff.role_id
         and permission.key = 'bookings:manage'
     )
     and exists (
       select 1 from public.role_permissions role_permission
       join public.permissions permission on permission.id = role_permission.permission_id
       where role_permission.role_id = staff.role_id
         and permission.key = 'tables:manage'
     );
  if v_actor.id is null then raise exception 'AUTOMATIC_ASSIGNMENT_PERMISSION_REQUIRED'; end if;
  select role.name into v_actor_role from public.roles role where role.id = v_actor.role_id;

  select * into v_show from public.shows where id = p_show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
    else null
  end;
  if v_venue is null or not ('all' = any(coalesce(v_actor.venue_scope, '{}'::text[])) or v_venue = any(coalesce(v_actor.venue_scope, '{}'::text[]))) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;
  if p_action in ('pause', 'resume') and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'OVERRIDE_REASON_REQUIRED';
  end if;
  if p_threshold_percent is not null and (p_threshold_percent < 50 or p_threshold_percent > 100) then
    raise exception 'PAUSE_THRESHOLD_INVALID';
  end if;

  select setting.approved_layout_version_id into v_layout_version_id
    from public.physical_seating_venue_settings setting where setting.venue = v_venue;
  select * into v_adoption from public.show_physical_seating_layouts where show_id = p_show_id for update;
  v_before := case when v_adoption.show_id is null then '{}'::jsonb else to_jsonb(v_adoption) end;

  if p_action = 'enable' then
    v_eligibility := public.validate_show_physical_layout_eligibility(p_show_id);
    if not coalesce((v_eligibility ->> 'eligible')::boolean, false) then
      raise exception 'SHOW_LAYOUT_NOT_ELIGIBLE|%', coalesce(v_eligibility ->> 'reason', 'UNKNOWN');
    end if;
    update public.show_tables table_row set
      capacity = approved.maximum_guests,
      capacity_configured = true,
      updated_at = now()
    from public.physical_seating_layout_tables approved
    where approved.layout_version_id = v_layout_version_id
      and table_row.show_id = p_show_id
      and table_row.table_code = approved.table_code
      and table_row.is_physical
      and coalesce(cardinality(table_row.merged_from), 0) = 0
      and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
      and (not table_row.capacity_configured or table_row.capacity is null)
      and table_row.booking_id is null;
    get diagnostics v_populated_capacity_count = row_count;
    insert into public.show_physical_seating_layouts (
      show_id, layout_version_id, adoption_status, automatic_assignment_enabled,
      adopted_at, adopted_by_staff_id, pause_threshold_percent, assignment_state,
      threshold_override_active, state_changed_at, state_changed_by_staff_id,
      state_change_reason
    ) values (
      p_show_id, v_layout_version_id, 'adopted', true,
      now(), v_actor.id, p_threshold_percent, 'enabled', false, now(), v_actor.id,
      nullif(trim(coalesce(p_reason, '')), '')
    ) on conflict (show_id) do update set
      layout_version_id = excluded.layout_version_id,
      adoption_status = 'adopted',
      automatic_assignment_enabled = true,
      adopted_at = coalesce(show_physical_seating_layouts.adopted_at, excluded.adopted_at),
      adopted_by_staff_id = coalesce(show_physical_seating_layouts.adopted_by_staff_id, excluded.adopted_by_staff_id),
      pause_threshold_percent = coalesce(excluded.pause_threshold_percent, show_physical_seating_layouts.pause_threshold_percent),
      assignment_state = 'enabled',
      threshold_override_active = false,
      assignment_revision = show_physical_seating_layouts.assignment_revision + 1,
      state_changed_at = now(),
      state_changed_by_staff_id = v_actor.id,
      state_change_reason = excluded.state_change_reason,
      updated_at = now();
  elsif p_action = 'disable' then
    if v_adoption.show_id is null then raise exception 'SHOW_LAYOUT_NOT_ADOPTED'; end if;
    update public.show_physical_seating_layouts set
      automatic_assignment_enabled = false,
      assignment_state = 'disabled',
      threshold_override_active = false,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(), state_changed_by_staff_id = v_actor.id,
      state_change_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
    where show_id = p_show_id;
  elsif p_action = 'pause' then
    if v_adoption.show_id is null or v_adoption.adoption_status <> 'adopted' then raise exception 'SHOW_LAYOUT_NOT_ADOPTED'; end if;
    update public.show_physical_seating_layouts set
      automatic_assignment_enabled = true,
      assignment_state = 'manual_paused', threshold_override_active = false,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(), state_changed_by_staff_id = v_actor.id,
      state_change_reason = trim(p_reason), updated_at = now()
    where show_id = p_show_id;
  elsif p_action = 'resume' then
    if v_adoption.show_id is null or v_adoption.adoption_status <> 'adopted' then raise exception 'SHOW_LAYOUT_NOT_ADOPTED'; end if;
    update public.show_physical_seating_layouts set
      automatic_assignment_enabled = true,
      assignment_state = 'enabled', threshold_override_active = true,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(), state_changed_by_staff_id = v_actor.id,
      state_change_reason = trim(p_reason), updated_at = now()
    where show_id = p_show_id;
  elsif p_action = 'threshold' then
    if v_adoption.show_id is null then raise exception 'SHOW_LAYOUT_NOT_ADOPTED'; end if;
    update public.show_physical_seating_layouts set
      pause_threshold_percent = p_threshold_percent,
      threshold_override_active = false,
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(), state_changed_by_staff_id = v_actor.id,
      state_change_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
    where show_id = p_show_id;
  else
    raise exception 'AUTOMATIC_ASSIGNMENT_ACTION_INVALID';
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, reason, source_area
  )
  select 'show.automatic-table-assignment-' || p_action, p_actor_auth_user_id,
    coalesce(v_actor.venue_scope, '{}'::text[]), v_actor.full_name, v_actor_role,
    v_actor.id, to_jsonb(current_state) || jsonb_build_object('populatedPermanentTableCapacities', v_populated_capacity_count), v_before,
    case when p_action = 'enable'
      then array['automatic_assignment_enabled', 'assignment_state', 'pause_threshold_percent', 'threshold_override_active', 'permanent_table_capacities']
      else array['automatic_assignment_enabled', 'assignment_state', 'pause_threshold_percent', 'threshold_override_active']
    end,
    p_show_id::text, v_venue, p_show_id::text, 'show', 'success',
    coalesce(nullif(trim(coalesce(p_reason, '')), ''), format('%s approved permanent table capacities populated.', v_populated_capacity_count)), 'Table Plan'
  from public.show_physical_seating_layouts current_state where current_state.show_id = p_show_id;

  return public.get_automatic_table_assignment_status(p_show_id);
end;
$$;

create or replace function public.configure_automatic_table_assignment_defaults(
  p_venue text,
  p_enabled boolean,
  p_threshold_percent numeric,
  p_review_reminder_days integer,
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
  v_before jsonb;
  v_row public.physical_seating_venue_settings%rowtype;
begin
  if p_venue not in ('cape-town', 'johannesburg') then raise exception 'SUPPORTED_VENUE_REQUIRED'; end if;
  if p_threshold_percent < 50 or p_threshold_percent > 100 then raise exception 'PAUSE_THRESHOLD_INVALID'; end if;
  if p_review_reminder_days < 1 or p_review_reminder_days > 60 then raise exception 'REVIEW_REMINDER_DAYS_INVALID'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'CONFIGURATION_REASON_REQUIRED'; end if;

  select staff.* into v_actor
    from public.staff_profiles staff
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id and staff.active
     and exists (
       select 1 from public.role_permissions rp join public.permissions permission on permission.id = rp.permission_id
       where rp.role_id = staff.role_id and permission.key = 'settings:manage'
     );
  if v_actor.id is null then raise exception 'SETTINGS_PERMISSION_REQUIRED'; end if;
  select role.name into v_actor_role from public.roles role where role.id = v_actor.role_id;
  if not ('all' = any(coalesce(v_actor.venue_scope, '{}'::text[])) or p_venue = any(coalesce(v_actor.venue_scope, '{}'::text[]))) then
    raise exception 'VENUE_OUTSIDE_STAFF_SCOPE';
  end if;

  select to_jsonb(setting) into v_before from public.physical_seating_venue_settings setting where venue = p_venue for update;
  update public.physical_seating_venue_settings set
    automatic_assignment_enabled = p_enabled,
    default_pause_threshold_percent = p_threshold_percent,
    review_reminder_days = p_review_reminder_days,
    updated_at = now()
  where venue = p_venue returning * into v_row;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'venue.automatic-table-assignment-defaults-updated', p_actor_auth_user_id,
    coalesce(v_actor.venue_scope, '{}'::text[]), v_actor.full_name, v_actor_role,
    v_actor.id, to_jsonb(v_row), coalesce(v_before, '{}'::jsonb),
    array['automatic_assignment_enabled', 'default_pause_threshold_percent', 'review_reminder_days'],
    p_venue, p_venue, p_venue, 'venue', 'success', trim(p_reason), 'Table Plan'
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.try_automatic_table_assignment(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adoption public.show_physical_seating_layouts%rowtype;
  v_booking public.bookings%rowtype;
  v_booking_kind text := 'standard';
  v_candidate public.show_tables%rowtype;
  v_candidate_ids uuid[] := '{}';
  v_candidate_codes text[] := '{}';
  v_candidate_capacity integer := 0;
  v_candidate_count integer := 0;
  v_occupancy integer := 0;
  v_occupancy_percent numeric(7,2) := 0;
  v_remaining_ticket_capacity integer := 0;
  v_result jsonb;
  v_settings public.physical_seating_venue_settings%rowtype;
  v_show public.shows%rowtype;
  v_threshold numeric(5,2) := 70;
  v_venue text;
  v_zone text;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null or v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'pending_payment', 'confirmed', 'checked_in')
     or v_booking.table_id is not null then
    return jsonb_build_object('outcome', 'skipped', 'reason', 'BOOKING_NOT_ASSIGNABLE');
  end if;
  select * into v_show from public.shows where id = v_booking.show_id;
  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
    else null
  end;
  select * into v_settings from public.physical_seating_venue_settings where venue = v_venue;
  if not coalesce(v_settings.automatic_assignment_enabled, false) then
    return jsonb_build_object('outcome', 'skipped', 'reason', 'GLOBAL_FEATURE_DISABLED');
  end if;
  select * into v_adoption from public.show_physical_seating_layouts where show_id = v_booking.show_id;
  if v_adoption.show_id is null or v_adoption.adoption_status <> 'adopted'
     or not v_adoption.automatic_assignment_enabled or v_adoption.assignment_state <> 'enabled' then
    return jsonb_build_object('outcome', 'skipped', 'reason', 'SHOW_NOT_ENABLED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('automatic-table-assignment:' || v_booking.show_id::text, 0));
  select * into v_adoption from public.show_physical_seating_layouts where show_id = v_booking.show_id for update;
  if v_adoption.assignment_state <> 'enabled' then
    return jsonb_build_object('outcome', 'skipped', 'reason', 'SHOW_PAUSED');
  end if;

  if exists (select 1 from public.corporate_buyouts buyout where buyout.booking_id = v_booking.id) then
    v_booking_kind := 'buyout';
  elsif v_booking.booking_source = 'corporate-direct' then
    v_booking_kind := 'corporate';
  end if;

  if v_booking_kind = 'buyout' then
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code, reason_detail
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'manual_queue', 'BUYOUT_MANUAL_PLANNING', 'Buyouts remain manually planned.'
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object('outcome', 'manual_queue', 'reason', 'BUYOUT_MANUAL_PLANNING');
  end if;

  if v_booking.zone_entitlements is not null and jsonb_array_length(v_booking.zone_entitlements) > 1 then
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code, reason_detail
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'manual_queue', 'MULTI_ZONE_MANUAL_PLANNING', 'Multi-zone Corporate bookings require reviewed table planning.'
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object('outcome', 'manual_queue', 'reason', 'MULTI_ZONE_MANUAL_PLANNING');
  end if;

  v_zone := public.normalize_booking_capacity_zone(v_booking.section);
  if v_zone is null then
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code, reason_detail
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'manual_queue', 'SEATING_ZONE_REVIEW_REQUIRED', 'The booking seating zone could not be matched safely.'
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object('outcome', 'manual_queue', 'reason', 'SEATING_ZONE_REVIEW_REQUIRED');
  end if;

  select coalesce(sum(booking.guest_count), 0)::integer into v_occupancy
    from public.bookings booking
   where booking.show_id = v_booking.show_id
     and booking.archived_at is null
     and booking.booking_status::text in ('new', 'pending_payment', 'confirmed', 'checked_in');
  v_occupancy_percent := round((v_occupancy::numeric / 415::numeric) * 100, 2);
  v_threshold := coalesce(v_adoption.pause_threshold_percent, v_settings.default_pause_threshold_percent, 70);

  if v_occupancy_percent >= v_threshold and not v_adoption.threshold_override_active then
    v_remaining_ticket_capacity := greatest(0,
      public.booking_capacity_zone_limit('golden-circle')
      + public.booking_capacity_zone_limit('middle-ring')
      + public.booking_capacity_zone_limit('royal-booths')
      + public.booking_capacity_zone_limit('royal-balcony')
      - v_occupancy
    );
    update public.show_physical_seating_layouts set
      assignment_state = 'threshold_paused',
      assignment_revision = assignment_revision + 1,
      state_changed_at = now(), state_changed_by_staff_id = null,
      state_change_reason = format('Automatic pause at %s%% approved occupancy threshold.', v_threshold),
      updated_at = now()
    where show_id = v_booking.show_id returning * into v_adoption;

    insert into public.automatic_table_assignment_notification_events (
      event_key, show_id, event_type, payload
    ) values (
      format('threshold:%s:%s', v_booking.show_id, v_adoption.assignment_revision),
      v_booking.show_id,
      'threshold_reached',
      jsonb_build_object(
        'venue', v_venue, 'showDate', v_show.date, 'showTime', v_show.time,
        'occupancyGuests', v_occupancy, 'occupancyPercent', v_occupancy_percent,
        'remainingTicketCapacity', v_remaining_ticket_capacity,
        'thresholdPercent', v_threshold
      )
    ) on conflict (event_key) do nothing;

    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code,
      reason_detail, occupancy_guests, occupancy_percent, threshold_percent
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'manual_queue', 'THRESHOLD_PAUSED', 'The approved occupancy threshold was reached before assignment.',
      v_occupancy, v_occupancy_percent, v_threshold
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object('outcome', 'manual_queue', 'reason', 'THRESHOLD_PAUSED');
  end if;

  while v_candidate_capacity < v_booking.guest_count loop
    select table_row.* into v_candidate
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = v_booking.show_id
       and table_row.table_code = approved.table_code
       and table_row.is_physical
       and coalesce(cardinality(table_row.merged_from), 0) = 0
       and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
       and table_row.capacity_configured
       and table_row.capacity = approved.maximum_guests
       and table_row.merged_parent_id is null
       and table_row.booking_id is null
       and table_row.status::text = 'available'
     where approved.layout_version_id = v_adoption.layout_version_id
       and approved.zone_id = v_zone
       and not (table_row.id = any(v_candidate_ids))
     order by
       case when approved.maximum_guests >= v_booking.guest_count - v_candidate_capacity then 0 else 1 end,
       case when approved.maximum_guests >= v_booking.guest_count - v_candidate_capacity then approved.maximum_guests end asc,
       case when approved.maximum_guests < v_booking.guest_count - v_candidate_capacity then approved.maximum_guests end desc,
       approved.sort_order asc
     limit 1
     for update of table_row skip locked;
    exit when v_candidate.id is null;
    v_candidate_ids := array_append(v_candidate_ids, v_candidate.id);
    v_candidate_codes := array_append(v_candidate_codes, v_candidate.table_code);
    v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;
  end loop;

  if v_candidate_capacity < v_booking.guest_count then
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code,
      reason_detail, occupancy_guests, occupancy_percent, threshold_percent
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'manual_queue', 'NO_SUITABLE_PHYSICAL_TABLE', 'No available approved physical table safely fits this booking.',
      v_occupancy, v_occupancy_percent, v_threshold
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object('outcome', 'manual_queue', 'reason', 'NO_SUITABLE_PHYSICAL_TABLE');
  end if;

  begin
    update public.show_tables set
      booking_id = v_booking.id,
      status = 'booked',
      updated_at = now()
    where id = any(v_candidate_ids)
      and booking_id is null
      and status::text = 'available';
    get diagnostics v_candidate_count = row_count;
    if v_candidate_count <> cardinality(v_candidate_ids) then
      raise exception 'AUTOMATIC_TABLE_SET_CHANGED';
    end if;
    update public.bookings set table_id = v_candidate_ids[1], updated_at = now()
    where id = v_booking.id and table_id is null;
    if not found then raise exception 'BOOKING_ALREADY_ASSIGNED'; end if;
    v_result := jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'show_id', v_booking.show_id,
      'table_ids', v_candidate_ids,
      'table_codes', v_candidate_codes,
      'combined_capacity', v_candidate_capacity
    );
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code,
      reason_detail, target_table_id, target_table_code, target_table_ids,
      target_table_codes, occupancy_guests, occupancy_percent, threshold_percent
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'assigned', 'BEST_FIT_ASSIGNED', 'Smallest suitable approved physical table set assigned atomically.',
      v_candidate_ids[1], v_candidate_codes[1], v_candidate_ids, v_candidate_codes,
      v_occupancy, v_occupancy_percent, v_threshold
    ) on conflict (booking_id) do nothing;
    insert into public.audit_events (
      action, actor_name, actor_location_scope, after_values, before_values,
      changed_fields, entity_id, entity_location, entity_reference, entity_type,
      outcome, reason, source_area
    ) values (
      'booking.table-auto-assigned', 'SYSTEM', array[v_venue],
      jsonb_build_object('table_id', v_candidate_ids[1], 'table_ids', v_candidate_ids, 'table_codes', v_candidate_codes, 'combined_capacity', v_candidate_capacity, 'zone', v_zone),
      jsonb_build_object('table_id', null), array['table_id'], v_booking.id::text,
      v_venue, v_booking.booking_reference, 'booking', 'success',
      'Best-fit assignment from the adopted approved physical layout.', 'Table Plan'
    );
    return v_result || jsonb_build_object('outcome', 'assigned');
  exception when others then
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome, reason_code,
      reason_detail, occupancy_guests, occupancy_percent, threshold_percent
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_booking_kind,
      'manual_queue', 'ATOMIC_ASSIGNMENT_CONFLICT', 'The selected table changed concurrently; manual assignment is required.',
      v_occupancy, v_occupancy_percent, v_threshold
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object('outcome', 'manual_queue', 'reason', 'ATOMIC_ASSIGNMENT_CONFLICT');
  end;
exception when others then
  return jsonb_build_object('outcome', 'skipped', 'reason', 'FAIL_SAFE', 'detail', sqlstate);
end;
$$;

create or replace function public.run_automatic_table_assignment_after_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.try_automatic_table_assignment(new.id);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists bookings_automatic_table_assignment on public.bookings;
create constraint trigger bookings_automatic_table_assignment
after insert on public.bookings
deferrable initially deferred
for each row execute function public.run_automatic_table_assignment_after_booking();

create or replace function public.enqueue_automatic_assignment_review_reminders(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  with due as (
    select adoption.show_id, adoption.assignment_revision, show_row.date, show_row.time,
           show_row.venue, setting.review_reminder_days
      from public.show_physical_seating_layouts adoption
      join public.shows show_row on show_row.id = adoption.show_id
      join public.physical_seating_layout_versions version on version.id = adoption.layout_version_id
      join public.physical_seating_venue_settings setting on setting.venue = version.venue
     where adoption.assignment_state = 'threshold_paused'
       and (show_row.date::date + coalesce(show_row.time::time, '00:00'::time))
           between (now() at time zone 'Africa/Johannesburg')
               and (now() at time zone 'Africa/Johannesburg') + make_interval(days => setting.review_reminder_days)
     order by show_row.date, show_row.time
     limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), inserted as (
    insert into public.automatic_table_assignment_notification_events (
      event_key, show_id, event_type, payload
    )
    select format('review:%s:%s', due.show_id, due.assignment_revision), due.show_id,
      'review_reminder', jsonb_build_object(
        'venue', due.venue, 'showDate', due.date, 'showTime', due.time,
        'reviewReminderDays', due.review_reminder_days
      )
    from due
    on conflict (event_key) do nothing
    returning 1
  ) select count(*)::integer into v_inserted from inserted;
  return v_inserted;
end;
$$;

create or replace function public.claim_automatic_assignment_notifications(
  p_claim_token uuid,
  p_limit integer default 10
)
returns setof public.automatic_table_assignment_notification_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select event.id
      from public.automatic_table_assignment_notification_events event
     where event.delivered_at is null
       and event.available_at <= now()
       and (event.claimed_at is null or event.claimed_at < now() - interval '15 minutes')
     order by event.available_at, event.created_at
     limit greatest(1, least(coalesce(p_limit, 10), 25))
     for update skip locked
  )
  update public.automatic_table_assignment_notification_events event set
    claimed_at = now(), claim_token = p_claim_token,
    delivery_attempts = event.delivery_attempts + 1, last_error = null
  from candidate
  where event.id = candidate.id
  returning event.*;
end;
$$;

create or replace function public.complete_automatic_assignment_notification(
  p_event_id uuid,
  p_claim_token uuid,
  p_delivered boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.automatic_table_assignment_notification_events set
    delivered_at = case when p_delivered then now() else delivered_at end,
    claimed_at = case when p_delivered then claimed_at else null end,
    claim_token = case when p_delivered then claim_token else null end,
    last_error = case when p_delivered then null else left(coalesce(p_error, 'Delivery failed.'), 500) end
  where id = p_event_id and claim_token = p_claim_token and delivered_at is null;
  return found;
end;
$$;

revoke all on function public.validate_show_physical_layout_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.get_automatic_table_assignment_status(uuid) from public, anon, authenticated;
revoke all on function public.control_automatic_table_assignment(uuid,text,numeric,text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.configure_automatic_table_assignment_defaults(text,boolean,numeric,integer,text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.try_automatic_table_assignment(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_automatic_assignment_review_reminders(integer) from public, anon, authenticated;
revoke all on function public.claim_automatic_assignment_notifications(uuid,integer) from public, anon, authenticated;
revoke all on function public.complete_automatic_assignment_notification(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.validate_show_physical_layout_eligibility(uuid) to service_role;
grant execute on function public.get_automatic_table_assignment_status(uuid) to service_role;
grant execute on function public.control_automatic_table_assignment(uuid,text,numeric,text,uuid,uuid) to service_role;
grant execute on function public.configure_automatic_table_assignment_defaults(text,boolean,numeric,integer,text,uuid,uuid) to service_role;
grant execute on function public.try_automatic_table_assignment(uuid) to service_role;
grant execute on function public.enqueue_automatic_assignment_review_reminders(integer) to service_role;
grant execute on function public.claim_automatic_assignment_notifications(uuid,integer) to service_role;
grant execute on function public.complete_automatic_assignment_notification(uuid,uuid,boolean,text) to service_role;

comment on table public.automatic_table_assignment_attempts is
  'Immutable per-booking Phase 54.2 assignment outcome. No historical backlog processing.';
comment on table public.automatic_table_assignment_notification_events is
  'Deduplicated threshold and review notifications for controlled automatic assignment.';

commit;
