-- Phase 54.10: repair only unambiguous master-table configuration defects and
-- assign only below-threshold bookings that safely fit. Existing arrangements,
-- threshold approvals, show availability and financial data remain unchanged.

create temporary table phase_54_10_analysis on commit drop as
with queue as (
  select booking.*
  from public.bookings booking
  join public.shows show_row on show_row.id = booking.show_id
  where booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    )
    and booking.table_id is null
    and show_row.date >= current_date
    and not exists (
      select 1 from public.show_tables claimed
      where claimed.booking_id = booking.id
        and claimed.merged_parent_id is null
    )
), candidate as (
  select
    show_row.id as show_id,
    show_row.venue,
    case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else null
    end as venue_key,
    show_row.date,
    show_row.time,
    show_row.status::text as show_status,
    setting.approved_layout_version_id as layout_version_id,
    coalesce(adoption.pause_threshold_percent,
      setting.default_pause_threshold_percent, 70) as threshold_percent,
    coalesce(adoption.threshold_override_active, false) as threshold_override_active,
    adoption.assignment_state as prior_assignment_state,
    count(queue.id)::integer as queue_bookings,
    coalesce(sum(queue.guest_count), 0)::integer as queue_guests,
    count(queue.id) filter (where exists (
      select 1 from public.corporate_buyouts buyout
      where buyout.booking_id = queue.id
    ))::integer as queue_buyouts,
    count(queue.id) filter (where queue.zone_entitlements is not null
      and jsonb_array_length(queue.zone_entitlements) > 1)::integer as queue_multi_zone,
    count(queue.id) filter (where
      public.normalize_booking_capacity_zone(queue.section) is null
    )::integer as queue_invalid_zone,
    (
      select coalesce(sum(active_booking.guest_count), 0)::integer
      from public.bookings active_booking
      where active_booking.show_id = show_row.id
        and active_booking.archived_at is null
        and active_booking.booking_status::text in (
          'new', 'pending_payment', 'confirmed', 'checked_in'
        )
    ) as occupancy_guests
  from public.shows show_row
  join queue on queue.show_id = show_row.id
  join public.physical_seating_venue_settings setting
    on setting.venue = case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else ''
    end
  left join public.show_physical_seating_layouts adoption
    on adoption.show_id = show_row.id
  group by show_row.id, show_row.venue, show_row.date, show_row.time,
    show_row.status, setting.approved_layout_version_id,
    setting.default_pause_threshold_percent, adoption.pause_threshold_percent,
    adoption.threshold_override_active, adoption.assignment_state
), facts as (
  select
    candidate.*,
    round((candidate.occupancy_guests::numeric / 415::numeric) * 100, 2)
      as occupancy_percent,
    (
      select count(*)
      from public.physical_seating_layout_tables approved
      left join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
      where approved.layout_version_id = candidate.layout_version_id
        and table_row.id is null
    )::integer as missing_master_tables,
    (
      select count(*)
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
      where approved.layout_version_id = candidate.layout_version_id
        and public.normalize_booking_capacity_zone(table_row.section) is distinct
          from approved.zone_id
        and table_row.is_physical
        and not table_row.is_override
        and table_row.booking_id is null
        and not table_row.capacity_configured
        and table_row.capacity is null
        and table_row.status::text = 'disabled'
        and coalesce(cardinality(table_row.merged_from), 0) = 0
        and table_row.merged_parent_id is null
    )::integer as safe_zone_corrections,
    (
      select count(*)
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
      where approved.layout_version_id = candidate.layout_version_id
        and public.normalize_booking_capacity_zone(table_row.section) is distinct
          from approved.zone_id
        and not (
          table_row.is_physical
          and not table_row.is_override
          and table_row.booking_id is null
          and not table_row.capacity_configured
          and table_row.capacity is null
          and table_row.status::text = 'disabled'
          and coalesce(cardinality(table_row.merged_from), 0) = 0
          and table_row.merged_parent_id is null
        )
    )::integer as unsafe_zone_conflicts,
    (
      select count(*)
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
      left join public.venue_tables venue_table on venue_table.id = table_row.venue_table_id
      where approved.layout_version_id = candidate.layout_version_id
        and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
        and table_row.booking_id is null
        and not table_row.is_override
        and table_row.is_physical
        and coalesce(cardinality(table_row.merged_from), 0) = 0
        and table_row.merged_parent_id is null
        and not (table_row.capacity_configured
          and table_row.capacity = approved.maximum_guests)
        and (
          (not table_row.capacity_configured and table_row.capacity is null
            and table_row.status::text = 'disabled')
          or table_row.capacity = approved.maximum_guests
          or (venue_table.id is not null
            and table_row.capacity = venue_table.capacity)
        )
    )::integer as safe_capacity_corrections,
    (
      select count(*)
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
      left join public.venue_tables venue_table on venue_table.id = table_row.venue_table_id
      where approved.layout_version_id = candidate.layout_version_id
        and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
        and not (
          table_row.is_physical
          and coalesce(cardinality(table_row.merged_from), 0) = 0
          and table_row.merged_parent_id is null
          and (
            (table_row.capacity_configured
              and table_row.capacity = approved.maximum_guests)
            or (
              table_row.booking_id is null
              and not table_row.is_override
              and (
                (not table_row.capacity_configured
                  and table_row.capacity is null
                  and table_row.status::text = 'disabled')
                or table_row.capacity = approved.maximum_guests
                or (venue_table.id is not null
                  and table_row.capacity = venue_table.capacity)
              )
            )
          )
        )
    )::integer as unsafe_capacity_conflicts,
    (
      select count(*)
      from public.physical_seating_layout_zones zone
      where zone.layout_version_id = candidate.layout_version_id
        and (
          select coalesce(sum(public.booking_zone_entitlement_pax(
            active_booking.zone_entitlements,
            active_booking.section,
            active_booking.guest_count,
            zone.zone_id
          )), 0)
          from public.bookings active_booking
          where active_booking.show_id = candidate.show_id
            and active_booking.archived_at is null
            and active_booking.booking_status::text in (
              'new', 'pending_payment', 'confirmed', 'checked_in'
            )
        ) > zone.approved_physical_capacity
    )::integer as zone_capacity_conflicts,
    public.get_show_physical_reconciliation_evidence(candidate.show_id)
      as before_evidence
  from candidate
)
select * from facts;

create temporary table phase_54_10_repairable on commit drop as
select *
from phase_54_10_analysis analysis
where analysis.show_status in ('active', 'inactive', 'sold_out')
  and analysis.unsafe_zone_conflicts = 0
  and analysis.unsafe_capacity_conflicts = 0
  and analysis.zone_capacity_conflicts = 0
  and coalesce(analysis.prior_assignment_state, '') <> 'manual_paused';

create temporary table phase_54_10_preserved_bookings on commit drop as
select booking.id, booking.show_id, booking.table_id,
  to_jsonb(booking) - array['table_id', 'updated_at']::text[] as stable_values
from public.bookings booking
join phase_54_10_repairable candidate on candidate.show_id = booking.show_id;

create temporary table phase_54_10_protected_tables on commit drop as
select table_row.id, to_jsonb(table_row) as row_snapshot
from public.show_tables table_row
join phase_54_10_repairable candidate on candidate.show_id = table_row.show_id
where table_row.booking_id is not null
   or table_row.is_override
   or table_row.merged_parent_id is not null
   or coalesce(cardinality(table_row.merged_from), 0) > 0
   or not exists (
     select 1 from public.physical_seating_layout_tables approved
     where approved.layout_version_id = candidate.layout_version_id
       and approved.table_code = table_row.table_code
   );

create temporary table phase_54_10_preserved_shows on commit drop as
select show_row.id, to_jsonb(show_row) as row_snapshot
from public.shows show_row
join phase_54_10_repairable candidate on candidate.show_id = show_row.id;

create temporary table phase_54_10_preserved_settings on commit drop as
select venue, automatic_assignment_enabled, default_pause_threshold_percent,
  review_reminder_days
from public.physical_seating_venue_settings;

do $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'phase-54-10-final-seating-conflict-resolution', 0
  ));
  perform 1
  from public.shows show_row
  join phase_54_10_repairable candidate on candidate.show_id = show_row.id
  for update of show_row;
  perform 1
  from public.show_tables table_row
  join phase_54_10_repairable candidate on candidate.show_id = table_row.show_id
  for update of table_row;
end;
$$;

insert into public.show_physical_seating_layouts (
  show_id, layout_version_id, adoption_status, automatic_assignment_enabled,
  adoption_source, pause_threshold_percent, assignment_state,
  threshold_override_active, state_changed_at, state_change_reason
)
select candidate.show_id, candidate.layout_version_id,
  'pending_reconciliation', false, 'system_reconciliation',
  candidate.threshold_percent, 'disabled', candidate.threshold_override_active,
  now(), 'Phase 54.10 final seating conflict reconciliation started.'
from phase_54_10_repairable candidate
on conflict (show_id) do update set
  layout_version_id = excluded.layout_version_id,
  adoption_status = 'pending_reconciliation',
  automatic_assignment_enabled = false,
  adoption_source = 'system_reconciliation',
  pause_threshold_percent = excluded.pause_threshold_percent,
  assignment_state = 'disabled',
  threshold_override_active = show_physical_seating_layouts.threshold_override_active,
  state_changed_at = case
    when show_physical_seating_layouts.threshold_override_active
      then show_physical_seating_layouts.state_changed_at
    else excluded.state_changed_at
  end,
  state_change_reason = case
    when show_physical_seating_layouts.threshold_override_active
      then show_physical_seating_layouts.state_change_reason
    else excluded.state_change_reason
  end,
  updated_at = now();

update public.show_tables table_row set
  section = approved.zone_id,
  venue_table_id = null,
  capacity = approved.maximum_guests,
  capacity_configured = true,
  status = 'available',
  override_notes = 'Approved master configuration populated by Phase 54.10.',
  updated_at = now()
from phase_54_10_repairable candidate
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = candidate.layout_version_id
where table_row.show_id = candidate.show_id
  and table_row.table_code = approved.table_code
  and public.normalize_booking_capacity_zone(table_row.section) is distinct from
    approved.zone_id
  and table_row.is_physical
  and not table_row.is_override
  and table_row.booking_id is null
  and not table_row.capacity_configured
  and table_row.capacity is null
  and table_row.status::text = 'disabled'
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and table_row.merged_parent_id is null;

update public.show_tables table_row set
  capacity = approved.maximum_guests,
  capacity_configured = true,
  status = case when table_row.status::text = 'disabled'
    then 'available'::public.table_status else table_row.status end,
  override_notes = case
    when table_row.override_notes in (
      'Capacity must be configured for this performance.',
      'Capacity must be configured for each performance.'
    ) then null else table_row.override_notes end,
  updated_at = now()
from phase_54_10_repairable candidate
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = candidate.layout_version_id
left join public.venue_tables venue_table
  on venue_table.table_code = approved.table_code
 and public.normalize_booking_capacity_zone(venue_table.section) = approved.zone_id
 and venue_table.is_physical
where table_row.show_id = candidate.show_id
  and table_row.table_code = approved.table_code
  and table_row.is_physical
  and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
  and table_row.booking_id is null
  and not table_row.is_override
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and table_row.merged_parent_id is null
  and not (table_row.capacity_configured
    and table_row.capacity = approved.maximum_guests)
  and (
    (not table_row.capacity_configured and table_row.capacity is null
      and table_row.status::text = 'disabled')
    or table_row.capacity = approved.maximum_guests
    or (venue_table.id is not null and table_row.capacity = venue_table.capacity)
  );

insert into public.show_tables (
  show_id, venue_table_id, table_code, section, capacity,
  capacity_configured, status, booking_id, merged_from, override_notes,
  is_override, is_physical, availability_scope
)
select candidate.show_id, null, approved.table_code, approved.zone_id,
  approved.maximum_guests, true, 'available'::public.table_status, null,
  '{}'::uuid[], 'Approved master table introduced by Phase 54.10.', false,
  true, 'public'::public.table_availability_scope
from phase_54_10_repairable candidate
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = candidate.layout_version_id
where not exists (
  select 1 from public.show_tables table_row
  where table_row.show_id = candidate.show_id
    and table_row.table_code = approved.table_code
);

do $$
begin
  if exists (
    select 1
    from phase_54_10_repairable candidate
    where (
      select count(*)
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
       and table_row.is_physical
       and coalesce(cardinality(table_row.merged_from), 0) = 0
       and table_row.merged_parent_id is null
       and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
       and table_row.capacity_configured
       and table_row.capacity = approved.maximum_guests
      where approved.layout_version_id = candidate.layout_version_id
    ) <> 74
  ) then
    raise exception 'PHASE_54_10_MASTER_LAYOUT_INCOMPLETE';
  end if;
end;
$$;

update public.show_physical_seating_layouts adoption set
  adoption_status = 'adopted',
  automatic_assignment_enabled = true,
  adoption_source = 'system_reconciliation',
  adopted_at = coalesce(adoption.adopted_at, now()),
  assignment_state = case
    when candidate.occupancy_percent >= candidate.threshold_percent
      and not candidate.threshold_override_active then 'threshold_paused'
    else 'enabled'
  end,
  threshold_override_active = candidate.threshold_override_active,
  assignment_revision = adoption.assignment_revision + 1,
  state_changed_at = case when candidate.threshold_override_active
    then adoption.state_changed_at else now() end,
  state_changed_by_staff_id = case when candidate.threshold_override_active
    then adoption.state_changed_by_staff_id else null end,
  state_change_reason = case
    when candidate.threshold_override_active then adoption.state_change_reason
    when candidate.occupancy_percent >= candidate.threshold_percent
      and not candidate.threshold_override_active
      then format('Phase 54.10 reconciled the layout; the existing %s%% threshold remains paused.', candidate.threshold_percent)
    else 'Phase 54.10 reconciled unambiguous physical-table configuration defects.'
  end,
  updated_at = now()
from phase_54_10_repairable candidate
where adoption.show_id = candidate.show_id;

create temporary table phase_54_10_assignment_results (
  booking_id uuid primary key,
  show_id uuid not null,
  result jsonb not null
) on commit drop;

do $$
declare
  booking_row record;
  assignment_result jsonb;
begin
  for booking_row in
    select booking.id, booking.show_id
    from public.bookings booking
    join phase_54_10_repairable candidate
      on candidate.show_id = booking.show_id
    where (
        candidate.occupancy_percent < candidate.threshold_percent
        or candidate.threshold_override_active
      )
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
    order by candidate.date, candidate.time, booking.guest_count desc,
      booking.booking_reference
  loop
    assignment_result :=
      public.try_automatic_table_assignment_phase_54_5(booking_row.id);
    insert into phase_54_10_assignment_results
      (booking_id, show_id, result)
    values (booking_row.id, booking_row.show_id, assignment_result);
  end loop;
end;
$$;

insert into public.physical_seating_reconciliation_queue (
  show_id, layout_version_id, reason, evidence_snapshot, status,
  detected_at, resolved_at, resolution_notes
)
select candidate.show_id, candidate.layout_version_id,
  'PHASE_54_10_FINAL_SEATING_CONFLICT_RESOLUTION',
  candidate.before_evidence || jsonb_build_object(
    'phase', '54.10',
    'evaluatedAt', now(),
    'occupancyGuests', candidate.occupancy_guests,
    'occupancyPercent', candidate.occupancy_percent,
    'thresholdPercent', candidate.threshold_percent,
    'thresholdOverrideActive', candidate.threshold_override_active,
    'configurationCorrections', candidate.missing_master_tables
      + candidate.safe_zone_corrections + candidate.safe_capacity_corrections,
    'assignmentAttempts', (
      select count(*) from phase_54_10_assignment_results result
      where result.show_id = candidate.show_id
    ),
    'assignedBookings', (
      select count(*) from phase_54_10_assignment_results result
      where result.show_id = candidate.show_id
        and result.result ->> 'outcome' = 'assigned'
    ),
    'remainingBookings', (
      select count(*) from public.bookings booking
      where booking.show_id = candidate.show_id
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
    ),
    'decision', case
      when candidate.occupancy_percent >= candidate.threshold_percent
        and not candidate.threshold_override_active then 'THRESHOLD_APPROVAL_REQUIRED'
      else 'CONFIGURATION_RECONCILED'
    end
  ),
  case when not exists (
    select 1 from public.bookings booking
    where booking.show_id = candidate.show_id
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
  ) then 'resolved' else 'pending' end,
  now(),
  case when not exists (
    select 1 from public.bookings booking
    where booking.show_id = candidate.show_id
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
  ) then now() else null end,
  'Unambiguous master-table configuration reconciled without changing protected seating.'
from phase_54_10_repairable candidate
on conflict (show_id, layout_version_id, reason) do update set
  evidence_snapshot = excluded.evidence_snapshot,
  status = excluded.status,
  detected_at = excluded.detected_at,
  resolved_at = excluded.resolved_at,
  resolution_notes = excluded.resolution_notes;

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_location, entity_reference, entity_type,
  outcome, reason, source_area
)
select 'show.physical-seating-conflict-reconciled', 'SYSTEM',
  array[candidate.venue_key],
  public.get_show_physical_reconciliation_evidence(candidate.show_id)
    || jsonb_build_object(
      'assignedBookings', (
        select count(*) from phase_54_10_assignment_results result
        where result.show_id = candidate.show_id
          and result.result ->> 'outcome' = 'assigned'
      ),
      'thresholdPreserved', candidate.threshold_percent,
      'thresholdOverridePreserved', candidate.threshold_override_active
    ),
  candidate.before_evidence,
  array['physical_table_configuration', 'automatic_table_assignments'],
  candidate.show_id::text, candidate.venue_key, candidate.show_id::text,
  'show', 'success',
  'Phase 54.10 corrected only unambiguous unassigned-table configuration defects.',
  'Table Plan'
from phase_54_10_repairable candidate;

do $$
begin
  if exists (
    select 1 from phase_54_10_preserved_shows preserved
    join public.shows current_row on current_row.id = preserved.id
    where to_jsonb(current_row) is distinct from preserved.row_snapshot
  ) then raise exception 'PHASE_54_10_SHOW_MUTATED'; end if;

  if exists (
    select 1 from phase_54_10_protected_tables preserved
    join public.show_tables current_row on current_row.id = preserved.id
    where to_jsonb(current_row) is distinct from preserved.row_snapshot
  ) then raise exception 'PHASE_54_10_PROTECTED_TABLE_MUTATED'; end if;

  if exists (
    select 1 from phase_54_10_preserved_bookings preserved
    join public.bookings current_row on current_row.id = preserved.id
    where to_jsonb(current_row) - array['table_id', 'updated_at']::text[]
      is distinct from preserved.stable_values
  ) then raise exception 'PHASE_54_10_BOOKING_DATA_MUTATED'; end if;

  if exists (
    select 1 from phase_54_10_preserved_settings preserved
    join public.physical_seating_venue_settings current_row
      on current_row.venue = preserved.venue
    where current_row.automatic_assignment_enabled is distinct from
        preserved.automatic_assignment_enabled
       or current_row.default_pause_threshold_percent is distinct from
        preserved.default_pause_threshold_percent
       or current_row.review_reminder_days is distinct from
        preserved.review_reminder_days
  ) then raise exception 'PHASE_54_10_THRESHOLD_SETTING_MUTATED'; end if;

  if exists (
    select 1 from phase_54_10_assignment_results result
    join public.bookings booking on booking.id = result.booking_id
    where result.result ->> 'outcome' = 'assigned'
      and (
        booking.table_id is null
        or coalesce((
          select sum(table_row.capacity)
          from public.show_tables table_row
          where table_row.booking_id = booking.id
            and table_row.merged_parent_id is null
            and table_row.status::text = 'booked'
        ), 0) < booking.guest_count
        or exists (
          select 1 from public.show_tables table_row
          where table_row.booking_id = booking.id
            and table_row.merged_parent_id is null
            and public.normalize_booking_capacity_zone(table_row.section)
              is distinct from public.normalize_booking_capacity_zone(booking.section)
        )
      )
  ) then raise exception 'PHASE_54_10_ASSIGNMENT_INTEGRITY_FAILED'; end if;
end;
$$;
