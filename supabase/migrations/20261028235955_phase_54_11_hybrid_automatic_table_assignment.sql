-- Phase 54.11: assign against independently safe table units without requiring
-- a conflicted performance layout to be replaced or fully adopted.

begin;

create or replace function public.resolve_hybrid_table_minimum_occupancy(
  p_table_id uuid,
  p_layout_version_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_minimum integer;
  v_table public.show_tables%rowtype;
begin
  select * into v_table
  from public.show_tables
  where id = p_table_id;

  if v_table.id is null
     or not v_table.capacity_configured
     or v_table.capacity is null
     or v_table.capacity < 1
     or v_table.merged_parent_id is not null then
    return null;
  end if;

  if v_table.is_physical
     and not v_table.is_override
     and coalesce(cardinality(v_table.merged_from), 0) = 0
     and exists (
       select 1
       from public.physical_seating_layout_tables approved
       where approved.layout_version_id = p_layout_version_id
         and approved.table_code = v_table.table_code
         and approved.zone_id =
           public.normalize_booking_capacity_zone(v_table.section)
         and approved.maximum_guests = v_table.capacity
     ) then
    return public.resolve_approved_table_minimum_occupancy(v_table.id);
  end if;

  if not v_table.is_physical
     and v_table.is_override
     and v_table.availability_scope::text = 'operational'
     and coalesce(cardinality(v_table.merged_from), 0) = 0 then
    return 1;
  end if;

  if not v_table.is_physical
     and v_table.is_override
     and v_table.availability_scope::text = 'operational'
     and cardinality(coalesce(v_table.merged_from, '{}'::uuid[])) >= 2
     and (
       select count(*)
       from public.show_tables child
       join public.physical_seating_layout_tables approved
         on approved.layout_version_id = p_layout_version_id
        and approved.table_code = child.table_code
        and approved.zone_id =
          public.normalize_booking_capacity_zone(child.section)
        and approved.maximum_guests = child.capacity
       where child.id = any(v_table.merged_from)
         and child.show_id = v_table.show_id
         and child.is_physical
         and not child.is_override
         and child.capacity_configured
         and child.booking_id is null
         and child.status::text = 'disabled'
         and child.merged_parent_id = v_table.id
         and coalesce(cardinality(child.merged_from), 0) = 0
         and public.normalize_booking_capacity_zone(child.section) =
           public.normalize_booking_capacity_zone(v_table.section)
     ) = cardinality(v_table.merged_from)
     and (
       select coalesce(sum(child.capacity), 0)
       from public.show_tables child
       where child.id = any(v_table.merged_from)
     ) = v_table.capacity then
    select sum(public.resolve_approved_table_minimum_occupancy(child.id))::integer
      into v_minimum
    from public.show_tables child
    where child.id = any(v_table.merged_from);

    if v_minimum is not null then
      return v_minimum;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_hybrid_table_minimum_occupancy(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_hybrid_table_minimum_occupancy(uuid, uuid)
  to service_role;

create or replace function public.try_hybrid_table_assignment_phase_54_11(
  p_booking_id uuid
)
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
  v_candidate_capacity integer := 0;
  v_candidate_count integer := 0;
  v_candidate_id uuid;
  v_candidate_ids uuid[] := '{}';
  v_candidate_codes text[] := '{}';
  v_candidate_minimum integer := 0;
  v_compatibility jsonb;
  v_layout_version_id uuid;
  v_occupancy integer := 0;
  v_occupancy_percent numeric(7,2) := 0;
  v_override_authorized boolean := false;
  v_result jsonb;
  v_settings public.physical_seating_venue_settings%rowtype;
  v_show public.shows%rowtype;
  v_threshold numeric(5,2) := 70;
  v_unit_minimum integer;
  v_venue text;
  v_zone text;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if v_booking.id is null
     or v_booking.archived_at is not null
     or v_booking.booking_status::text not in (
       'new', 'pending_payment', 'confirmed', 'checked_in'
     )
     or v_booking.table_id is not null
     or exists (
       select 1 from public.show_tables claimed
       where claimed.booking_id = v_booking.id
         and claimed.merged_parent_id is null
     ) then
    return jsonb_build_object(
      'outcome', 'skipped', 'reason', 'BOOKING_NOT_ASSIGNABLE'
    );
  end if;

  select * into v_show
  from public.shows
  where id = v_booking.show_id;
  if v_show.id is null then
    return jsonb_build_object('outcome', 'skipped', 'reason', 'SHOW_NOT_FOUND');
  end if;

  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town')
      then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg')
      then 'johannesburg'
    else null
  end;

  select * into v_settings
  from public.physical_seating_venue_settings
  where venue = v_venue;
  if v_venue is null
     or not coalesce(v_settings.automatic_assignment_enabled, false)
     or v_settings.approved_layout_version_id is null then
    return jsonb_build_object(
      'outcome', 'skipped', 'reason', 'GLOBAL_FEATURE_DISABLED'
    );
  end if;
  v_layout_version_id := v_settings.approved_layout_version_id;

  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = v_booking.show_id;
  if v_adoption.adoption_status = 'adopted' then
    return public.try_automatic_table_assignment_phase_54_5(v_booking.id);
  end if;

  if v_adoption.assignment_state = 'manual_paused' then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'SHOW_MANUALLY_PAUSED'
    );
  end if;

  if exists (
    select 1 from public.corporate_buyouts buyout
    where buyout.booking_id = v_booking.id
  ) then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'BUYOUT_MANUAL_PLANNING'
    );
  end if;

  if v_booking.zone_entitlements is not null
     and jsonb_array_length(v_booking.zone_entitlements) > 1 then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'MULTI_ZONE_MANUAL_PLANNING'
    );
  end if;

  v_booking_kind := case
    when v_booking.booking_source = 'corporate-direct' then 'corporate'
    else 'standard'
  end;
  v_zone := public.normalize_booking_capacity_zone(v_booking.section);
  if v_zone is null then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'SEATING_ZONE_REVIEW_REQUIRED'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'automatic-table-assignment:' || v_booking.show_id::text,
    0
  ));

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if v_booking.table_id is not null
     or exists (
       select 1 from public.show_tables claimed
       where claimed.booking_id = v_booking.id
         and claimed.merged_parent_id is null
     ) then
    return jsonb_build_object(
      'outcome', 'skipped', 'reason', 'BOOKING_ALREADY_ASSIGNED'
    );
  end if;

  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = v_booking.show_id
  for update;

  v_override_authorized := coalesce(
    v_adoption.threshold_override_active
    and v_adoption.assignment_state = 'enabled'
    and v_adoption.state_changed_by_staff_id is not null
    and nullif(trim(coalesce(v_adoption.state_change_reason, '')), '') is not null
    and exists (
      select 1
      from public.audit_events audit
      where audit.action = 'show.automatic-table-assignment-resume'
        and audit.outcome = 'success'
        and audit.entity_type = 'show'
        and audit.entity_id = v_booking.show_id::text
        and audit.actor_staff_profile_id = v_adoption.state_changed_by_staff_id
        and audit.created_at between
          v_adoption.state_changed_at - interval '5 seconds'
          and v_adoption.state_changed_at + interval '5 seconds'
        and coalesce(
          (audit.after_values ->> 'threshold_override_active')::boolean,
          false
        )
        and audit.after_values ->> 'assignment_state' = 'enabled'
    ),
    false
  );

  select coalesce(sum(active_booking.guest_count), 0)::integer
    into v_occupancy
  from public.bookings active_booking
  where active_booking.show_id = v_booking.show_id
    and active_booking.archived_at is null
    and active_booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    );
  v_occupancy_percent := round(
    (v_occupancy::numeric / 415::numeric) * 100,
    2
  );
  v_threshold := coalesce(
    v_adoption.pause_threshold_percent,
    v_settings.default_pause_threshold_percent,
    70
  );

  if v_occupancy_percent >= v_threshold and not v_override_authorized then
    insert into public.automatic_table_assignment_notification_events (
      event_key, show_id, event_type, payload
    ) values (
      format(
        'hybrid-threshold:%s:%s',
        v_booking.show_id,
        coalesce(v_adoption.assignment_revision, 1)
      ),
      v_booking.show_id,
      'threshold_reached',
      jsonb_build_object(
        'venue', v_venue,
        'showDate', v_show.date,
        'showTime', v_show.time,
        'occupancyGuests', v_occupancy,
        'occupancyPercent', v_occupancy_percent,
        'thresholdPercent', v_threshold,
        'hybridAssignment', true
      )
    ) on conflict (event_key) do nothing;

    return jsonb_build_object(
      'outcome', 'manual_queue',
      'reason', 'THRESHOLD_APPROVAL_REQUIRED',
      'occupancyPercent', v_occupancy_percent,
      'thresholdPercent', v_threshold
    );
  end if;

  while v_candidate_capacity < v_booking.guest_count loop
    select table_row.id,
      public.resolve_hybrid_table_minimum_occupancy(
        table_row.id,
        v_layout_version_id
      )
      into v_candidate_id, v_unit_minimum
    from public.show_tables table_row
    where table_row.show_id = v_booking.show_id
      and table_row.merged_parent_id is null
      and table_row.booking_id is null
      and table_row.status::text = 'available'
      and table_row.capacity_configured
      and table_row.capacity is not null
      and table_row.capacity > 0
      and public.normalize_booking_capacity_zone(table_row.section) = v_zone
      and public.resolve_hybrid_table_minimum_occupancy(
        table_row.id,
        v_layout_version_id
      ) is not null
      and v_candidate_minimum
        + public.resolve_hybrid_table_minimum_occupancy(
          table_row.id,
          v_layout_version_id
        ) <= v_booking.guest_count
      and not (table_row.id = any(v_candidate_ids))
    order by
      case when table_row.capacity >=
        v_booking.guest_count - v_candidate_capacity then 0 else 1 end,
      case when table_row.capacity >=
        v_booking.guest_count - v_candidate_capacity
        then table_row.capacity end asc,
      case when table_row.capacity <
        v_booking.guest_count - v_candidate_capacity
        then table_row.capacity end desc,
      table_row.table_code asc
    limit 1
    for update of table_row skip locked;

    exit when v_candidate_id is null;
    select * into v_candidate
    from public.show_tables
    where id = v_candidate_id;
    v_candidate_ids := array_append(v_candidate_ids, v_candidate.id);
    v_candidate_codes := array_append(v_candidate_codes, v_candidate.table_code);
    v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;
    v_candidate_minimum := v_candidate_minimum + v_unit_minimum;
  end loop;

  if v_candidate_capacity < v_booking.guest_count then
    return jsonb_build_object(
      'outcome', 'manual_queue',
      'reason', 'HYBRID_NO_SUITABLE_TABLE_UNIT'
    );
  end if;

  begin
    update public.show_tables table_row set
      booking_id = v_booking.id,
      status = 'booked',
      updated_at = now()
    where table_row.id = any(v_candidate_ids)
      and table_row.booking_id is null
      and table_row.status::text = 'available';
    get diagnostics v_candidate_count = row_count;
    if v_candidate_count <> cardinality(v_candidate_ids) then
      raise exception 'HYBRID_TABLE_SET_CHANGED';
    end if;

    update public.bookings booking set
      table_id = v_candidate_ids[1],
      updated_at = now()
    where booking.id = v_booking.id
      and booking.table_id is null;
    if not found then
      raise exception 'BOOKING_ALREADY_ASSIGNED';
    end if;

    v_compatibility := public.resolve_booking_table_assignment_compatibility(
      v_booking.id,
      v_booking.guest_count
    );
    if not coalesce((v_compatibility ->> 'compatible')::boolean, false) then
      raise exception 'HYBRID_ASSIGNMENT_INTEGRITY_FAILED|%',
        coalesce(v_compatibility ->> 'reason', 'UNKNOWN');
    end if;

    v_result := jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'show_id', v_booking.show_id,
      'table_ids', v_candidate_ids,
      'table_codes', v_candidate_codes,
      'combined_capacity', v_candidate_capacity,
      'combined_minimum', v_candidate_minimum
    );

    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome,
      reason_code, reason_detail, target_table_id, target_table_code,
      target_table_ids, target_table_codes, occupancy_guests,
      occupancy_percent, threshold_percent
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference,
      v_booking_kind, 'assigned', 'HYBRID_SAFE_FIT_ASSIGNED',
      'Independently validated table units assigned atomically without replacing the performance layout.',
      v_candidate_ids[1], v_candidate_codes[1], v_candidate_ids,
      v_candidate_codes, v_occupancy, v_occupancy_percent, v_threshold
    ) on conflict (booking_id) do nothing;

    insert into public.audit_events (
      action, actor_name, actor_location_scope, after_values, before_values,
      changed_fields, entity_id, entity_location, entity_reference,
      entity_type, outcome, reason, source_area
    ) values (
      'booking.table-hybrid-auto-assigned', 'SYSTEM', array[v_venue],
      v_result || jsonb_build_object(
        'zone', v_zone,
        'minimumOccupancy', v_candidate_minimum,
        'thresholdOverrideUsed', v_override_authorized
      ),
      jsonb_build_object('table_id', null),
      array['table_id'], v_booking.id::text, v_venue,
      v_booking.booking_reference, 'booking', 'success',
      'Phase 54.11 independently validated each claimed table unit.',
      'Table Plan'
    );

    return v_result || jsonb_build_object('outcome', 'assigned');
  exception when others then
    return jsonb_build_object(
      'outcome', 'manual_queue',
      'reason', 'HYBRID_ATOMIC_ASSIGNMENT_CONFLICT',
      'detail', sqlstate
    );
  end;
exception when others then
  return jsonb_build_object(
    'outcome', 'skipped', 'reason', 'FAIL_SAFE', 'detail', sqlstate
  );
end;
$$;

revoke all on function public.try_hybrid_table_assignment_phase_54_11(uuid)
  from public, anon, authenticated;
grant execute on function public.try_hybrid_table_assignment_phase_54_11(uuid)
  to service_role;

create or replace function public.run_automatic_table_assignment_after_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.shows show_row
    where show_row.id = new.show_id
      and show_row.status::text in ('active', 'inactive', 'sold_out')
  ) then
    return null;
  end if;

  perform public.try_hybrid_table_assignment_phase_54_11(new.id);
  return null;
exception when others then
  return null;
end;
$$;

create temporary table phase_54_11_existing_claims on commit drop as
select table_row.id, to_jsonb(table_row) as snapshot
from public.show_tables table_row
where table_row.booking_id is not null
   or table_row.status::text <> 'available'
   or table_row.is_override
   or table_row.merged_parent_id is not null
   or coalesce(cardinality(table_row.merged_from), 0) > 0;

create temporary table phase_54_11_show_controls on commit drop as
select adoption.show_id, adoption.pause_threshold_percent,
  adoption.threshold_override_active, adoption.assignment_state,
  adoption.assignment_revision, adoption.state_changed_at,
  adoption.state_changed_by_staff_id, adoption.state_change_reason
from public.show_physical_seating_layouts adoption;

create temporary table phase_54_11_results (
  booking_id uuid primary key,
  show_id uuid not null,
  result jsonb not null
) on commit drop;

do $$
declare
  v_booking record;
begin
  for v_booking in
    select booking.id, booking.show_id
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
    left join public.show_physical_seating_layouts adoption
      on adoption.show_id = booking.show_id
    where show_row.date >= current_date
      and show_row.status::text in ('active', 'inactive', 'sold_out')
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
      and not exists (
        select 1 from public.corporate_buyouts buyout
        where buyout.booking_id = booking.id
      )
      and (
        booking.zone_entitlements is null
        or jsonb_array_length(booking.zone_entitlements) <= 1
      )
      and public.normalize_booking_capacity_zone(booking.section) is not null
      and coalesce(adoption.adoption_status, 'pending_reconciliation') =
        'pending_reconciliation'
      and coalesce(adoption.assignment_state, 'disabled') <> 'manual_paused'
    order by show_row.date, show_row.time, booking.show_id,
      booking.guest_count desc, booking.booking_reference
  loop
    insert into phase_54_11_results (booking_id, show_id, result)
    values (
      v_booking.id,
      v_booking.show_id,
      public.try_hybrid_table_assignment_phase_54_11(v_booking.id)
    );
  end loop;
end;
$$;

insert into public.physical_seating_reconciliation_queue (
  show_id, layout_version_id, reason, evidence_snapshot, status,
  detected_at, resolved_at, resolution_notes
)
select result.show_id, setting.approved_layout_version_id,
  'PHASE_54_11_HYBRID_TABLE_ASSIGNMENT',
  jsonb_build_object(
    'phase', '54.11',
    'evaluatedAt', now(),
    'attemptedBookings', count(result.booking_id),
    'assignedBookings', count(result.booking_id) filter (
      where result.result ->> 'outcome' = 'assigned'
    ),
    'thresholdApprovalRequired', count(result.booking_id) filter (
      where result.result ->> 'reason' = 'THRESHOLD_APPROVAL_REQUIRED'
    ),
    'noSafeFit', count(result.booking_id) filter (
      where result.result ->> 'reason' = 'HYBRID_NO_SUITABLE_TABLE_UNIT'
    )
  ),
  'resolved', now(), now(),
  'Hybrid table-level validation completed without replacing the existing performance layout.'
from phase_54_11_results result
join public.shows show_row on show_row.id = result.show_id
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
group by result.show_id, setting.approved_layout_version_id
on conflict (show_id, layout_version_id, reason) do update set
  evidence_snapshot = excluded.evidence_snapshot,
  status = excluded.status,
  detected_at = excluded.detected_at,
  resolved_at = excluded.resolved_at,
  resolution_notes = excluded.resolution_notes;

do $$
begin
  if exists (
    select 1
    from phase_54_11_existing_claims before_state
    join public.show_tables current_row on current_row.id = before_state.id
    where to_jsonb(current_row) - 'updated_at' - 'booking_id' - 'status'
      is distinct from
      before_state.snapshot - 'updated_at' - 'booking_id' - 'status'
  ) then
    raise exception 'PHASE_54_11_PROTECTED_TABLE_STRUCTURE_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_11_existing_claims before_state
    join public.show_tables current_row on current_row.id = before_state.id
    where (before_state.snapshot ->> 'booking_id') is not null
      and (
        current_row.booking_id::text is distinct from
          before_state.snapshot ->> 'booking_id'
        or current_row.status::text is distinct from
          before_state.snapshot ->> 'status'
      )
  ) then
    raise exception 'PHASE_54_11_EXISTING_ASSIGNMENT_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_11_show_controls before_state
    join public.show_physical_seating_layouts current_state
      on current_state.show_id = before_state.show_id
    where current_state.pause_threshold_percent is distinct from
        before_state.pause_threshold_percent
       or current_state.threshold_override_active is distinct from
        before_state.threshold_override_active
       or current_state.assignment_state is distinct from
        before_state.assignment_state
       or current_state.assignment_revision is distinct from
        before_state.assignment_revision
       or current_state.state_changed_at is distinct from
        before_state.state_changed_at
       or current_state.state_changed_by_staff_id is distinct from
        before_state.state_changed_by_staff_id
       or current_state.state_change_reason is distinct from
        before_state.state_change_reason
  ) then
    raise exception 'PHASE_54_11_ASSIGNMENT_CONTROL_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_11_results result
    where result.result ->> 'outcome' = 'assigned'
      and not coalesce((
        public.resolve_booking_table_assignment_compatibility(
          result.booking_id,
          (select booking.guest_count from public.bookings booking
           where booking.id = result.booking_id)
        ) ->> 'compatible'
      )::boolean, false)
  ) then
    raise exception 'PHASE_54_11_ASSIGNMENT_INTEGRITY_FAILED';
  end if;
end;
$$;

comment on function public.try_hybrid_table_assignment_phase_54_11(uuid) is
  'Atomically assigns independently validated approved permanent, authorised temporary or valid merged table units without replacing a pending performance layout.';

comment on function public.run_automatic_table_assignment_after_booking() is
  'Runs adopted-layout or Phase 54.11 hybrid table assignment independently of ticket-sale availability while preserving thresholds and fail-closed table validation.';

commit;
