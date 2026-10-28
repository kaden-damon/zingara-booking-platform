-- Phase 54.8: separate show-sale availability from physical table assignment.
-- Existing valid guests on inactive/closed or sold-out performances may be
-- seated only when the approved layout, threshold and physical fit all pass.

create temporary table phase_54_8_analysis on commit drop as
with latest_restriction as (
  select distinct on (queue.show_id)
    queue.show_id,
    queue.evidence_snapshot ->> 'blocker' as blocker
  from public.physical_seating_reconciliation_queue queue
  where queue.reason = 'PHASE_54_5_BACKLOG_RECONCILIATION'
  order by queue.show_id, queue.detected_at desc
), candidate as (
  select
    show_row.*,
    setting.approved_layout_version_id as layout_version_id,
    setting.default_pause_threshold_percent as threshold_percent,
    case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else null
    end as venue_key
  from public.shows show_row
  join latest_restriction restriction
    on restriction.show_id = show_row.id
   and restriction.blocker = 'SHOW_NOT_ACTIVE'
  join public.physical_seating_venue_settings setting
    on setting.venue = case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else ''
    end
  where (show_row.date::date + coalesce(show_row.time, '00:00'::time)) >=
    timezone('Africa/Johannesburg', now())
), booking_facts as (
  select
    candidate.id as show_id,
    coalesce(sum(booking.guest_count) filter (
      where booking.id is not null
    ), 0)::integer as occupancy_guests,
    count(*) filter (
      where booking.id is not null
        and booking.table_id is null
        and not exists (
          select 1 from public.show_tables claimed
          where claimed.booking_id = booking.id
            and claimed.merged_parent_id is null
        )
    )::integer as queue_bookings,
    count(*) filter (
      where booking.id is not null
        and booking.table_id is null
        and not exists (
          select 1 from public.show_tables claimed
          where claimed.booking_id = booking.id
            and claimed.merged_parent_id is null
        )
        and exists (
          select 1 from public.corporate_buyouts buyout
          where buyout.booking_id = booking.id
        )
    )::integer as queue_buyouts,
    count(*) filter (
      where booking.id is not null
        and booking.table_id is null
        and not exists (
          select 1 from public.show_tables claimed
          where claimed.booking_id = booking.id
            and claimed.merged_parent_id is null
        )
        and booking.zone_entitlements is not null
        and jsonb_array_length(booking.zone_entitlements) > 1
    )::integer as queue_multi_zone,
    count(*) filter (
      where booking.id is not null
        and booking.table_id is null
        and not exists (
          select 1 from public.show_tables claimed
          where claimed.booking_id = booking.id
            and claimed.merged_parent_id is null
        )
        and public.normalize_booking_capacity_zone(booking.section) is null
    )::integer as queue_invalid_zone
  from candidate
  left join public.bookings booking
    on booking.show_id = candidate.id
   and booking.archived_at is null
   and booking.booking_status::text in (
     'new', 'pending_payment', 'confirmed', 'checked_in'
   )
  group by candidate.id
)
select
  candidate.id as show_id,
  candidate.venue,
  candidate.venue_key,
  candidate.date,
  candidate.time,
  candidate.status::text as show_status,
  candidate.layout_version_id,
  candidate.threshold_percent,
  facts.occupancy_guests,
  facts.queue_bookings,
  facts.queue_buyouts,
  facts.queue_multi_zone,
  facts.queue_invalid_zone,
  round((facts.occupancy_guests::numeric / 415::numeric) * 100, 2)
    as occupancy_percent,
  (
    select count(*)
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = candidate.id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) <>
       approved.zone_id
    where approved.layout_version_id = candidate.layout_version_id
      and not (
        not table_row.is_override
        and table_row.booking_id is null
        and not table_row.capacity_configured
        and table_row.capacity is null
        and table_row.status::text = 'disabled'
        and coalesce(cardinality(table_row.merged_from), 0) = 0
        and table_row.merged_parent_id is null
      )
  )::integer as structural_blockers,
  (
    select count(*)
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = candidate.id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) =
       approved.zone_id
    left join public.venue_tables venue_table
      on venue_table.id = table_row.venue_table_id
    where approved.layout_version_id = candidate.layout_version_id
      and (
        (table_row.booking_id is not null and (
          not table_row.capacity_configured
          or table_row.capacity is distinct from approved.maximum_guests
        ))
        or (
          table_row.capacity_configured
          and table_row.capacity is distinct from approved.maximum_guests
          and (
            venue_table.id is null
            or table_row.capacity is distinct from venue_table.capacity
          )
        )
      )
  )::integer as capacity_blockers,
  (
    select count(*)
    from public.physical_seating_layout_zones zone
    where zone.layout_version_id = candidate.layout_version_id
      and (
        select coalesce(sum(public.booking_zone_entitlement_pax(
          booking.zone_entitlements,
          booking.section,
          booking.guest_count,
          zone.zone_id
        )), 0)
        from public.bookings booking
        where booking.show_id = candidate.id
          and booking.archived_at is null
          and booking.booking_status::text in (
            'new', 'pending_payment', 'confirmed', 'checked_in'
          )
      ) > zone.approved_physical_capacity
  )::integer as zone_capacity_blockers,
  public.get_show_physical_reconciliation_evidence(candidate.id)
    as before_evidence,
  to_jsonb(candidate) as show_snapshot
from candidate
join booking_facts facts on facts.show_id = candidate.id;

create temporary table phase_54_8_safe_shows on commit drop as
select *
from phase_54_8_analysis analysis
where analysis.show_status in ('inactive', 'sold_out')
  and analysis.queue_bookings > 0
  and analysis.occupancy_percent < analysis.threshold_percent
  and analysis.structural_blockers = 0
  and analysis.capacity_blockers = 0
  and analysis.zone_capacity_blockers = 0
  and analysis.queue_buyouts = 0
  and analysis.queue_multi_zone = 0
  and analysis.queue_invalid_zone = 0;

create temporary table phase_54_8_preserved_bookings on commit drop as
select
  booking.id,
  booking.show_id,
  booking.table_id,
  to_jsonb(booking) - array['table_id', 'updated_at']::text[] as stable_values
from public.bookings booking
join phase_54_8_safe_shows candidate on candidate.show_id = booking.show_id;

create temporary table phase_54_8_preserved_claims on commit drop as
select table_row.id, to_jsonb(table_row) as row_snapshot
from public.show_tables table_row
join phase_54_8_safe_shows candidate on candidate.show_id = table_row.show_id
where table_row.booking_id is not null;

do $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('phase-54-8-restriction-resolution', 0)
  );

  perform 1
  from public.shows show_row
  join phase_54_8_safe_shows candidate on candidate.show_id = show_row.id
  for update of show_row;

  if exists (
    select 1
    from public.shows show_row
    join phase_54_8_safe_shows candidate on candidate.show_id = show_row.id
    where show_row.status::text is distinct from candidate.show_status
  ) then
    raise exception 'PHASE_54_8_SHOW_STATUS_CHANGED';
  end if;
end;
$$;

insert into public.show_physical_seating_layouts (
  show_id, layout_version_id, adoption_status, automatic_assignment_enabled,
  adoption_source, pause_threshold_percent, assignment_state,
  threshold_override_active, state_changed_at, state_change_reason
)
select
  candidate.show_id,
  candidate.layout_version_id,
  'pending_reconciliation',
  false,
  'system_reconciliation',
  candidate.threshold_percent,
  'disabled',
  false,
  now(),
  'Phase 54.8 status-independent seating reconciliation started.'
from phase_54_8_safe_shows candidate
on conflict (show_id) do update set
  layout_version_id = excluded.layout_version_id,
  adoption_status = 'pending_reconciliation',
  automatic_assignment_enabled = false,
  adoption_source = 'system_reconciliation',
  pause_threshold_percent = excluded.pause_threshold_percent,
  assignment_state = 'disabled',
  threshold_override_active = false,
  state_changed_at = excluded.state_changed_at,
  state_change_reason = excluded.state_change_reason,
  updated_at = now()
where show_physical_seating_layouts.adoption_status = 'pending_reconciliation';

update public.show_tables table_row set
  section = approved.zone_id,
  venue_table_id = null,
  capacity = approved.maximum_guests,
  capacity_configured = true,
  status = 'available',
  override_notes = 'Approved master capacity populated by Phase 54.8.',
  updated_at = now()
from phase_54_8_safe_shows candidate
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
from phase_54_8_safe_shows candidate
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
  and (
    (not table_row.capacity_configured and table_row.capacity is null
      and table_row.status::text = 'disabled')
    or table_row.capacity = approved.maximum_guests
    or (venue_table.id is not null and table_row.capacity = venue_table.capacity)
  )
  and (
    table_row.capacity is distinct from approved.maximum_guests
    or not table_row.capacity_configured
    or table_row.status::text = 'disabled'
  );

insert into public.show_tables (
  show_id, venue_table_id, table_code, section, capacity,
  capacity_configured, status, booking_id, merged_from, override_notes,
  is_override, is_physical, availability_scope
)
select
  candidate.show_id,
  null,
  approved.table_code,
  approved.zone_id,
  approved.maximum_guests,
  true,
  'available'::public.table_status,
  null,
  '{}'::uuid[],
  'Approved master table introduced by Phase 54.8.',
  false,
  true,
  'public'::public.table_availability_scope
from phase_54_8_safe_shows candidate
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
    from phase_54_8_safe_shows candidate
    where (
      select count(*)
      from public.physical_seating_layout_tables approved
      join public.show_tables table_row
        on table_row.show_id = candidate.show_id
       and table_row.table_code = approved.table_code
       and table_row.is_physical
       and coalesce(cardinality(table_row.merged_from), 0) = 0
       and public.normalize_booking_capacity_zone(table_row.section) =
         approved.zone_id
       and table_row.capacity_configured
       and table_row.capacity = approved.maximum_guests
      where approved.layout_version_id = candidate.layout_version_id
    ) <> 74
  ) then
    raise exception 'PHASE_54_8_MASTER_LAYOUT_INCOMPLETE';
  end if;
end;
$$;

update public.show_physical_seating_layouts adoption set
  adoption_status = 'adopted',
  automatic_assignment_enabled = true,
  adoption_source = 'system_reconciliation',
  adopted_at = now(),
  adopted_by_staff_id = null,
  assignment_state = 'enabled',
  threshold_override_active = false,
  assignment_revision = adoption.assignment_revision + 1,
  state_changed_at = now(),
  state_changed_by_staff_id = null,
  state_change_reason =
    'Phase 54.8 physical seating enabled independently of show availability.',
  updated_at = now()
from phase_54_8_safe_shows candidate
where adoption.show_id = candidate.show_id;

create temporary table phase_54_8_assignment_results (
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
    join phase_54_8_safe_shows candidate
      on candidate.show_id = booking.show_id
    where booking.archived_at is null
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
    insert into phase_54_8_assignment_results
      (booking_id, show_id, result)
    values (booking_row.id, booking_row.show_id, assignment_result);
  end loop;
end;
$$;

create temporary table phase_54_8_activated_shows on commit drop as
select candidate.*
from phase_54_8_safe_shows candidate
where not exists (
  select 1
  from public.bookings booking
  where booking.show_id = candidate.show_id
    and booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    )
    and coalesce((
      select sum(table_row.capacity)
      from public.show_tables table_row
      where table_row.show_id = booking.show_id
        and table_row.booking_id = booking.id
        and table_row.merged_parent_id is null
        and table_row.capacity_configured
        and table_row.capacity is not null
        and table_row.status::text = 'booked'
    ), 0) < booking.guest_count
);

update public.show_physical_seating_layouts adoption set
  adoption_status = 'pending_reconciliation',
  automatic_assignment_enabled = false,
  adopted_at = null,
  adopted_by_staff_id = null,
  assignment_state = 'disabled',
  threshold_override_active = false,
  assignment_revision = adoption.assignment_revision + 1,
  state_changed_at = now(),
  state_changed_by_staff_id = null,
  state_change_reason =
    'Phase 54.8 retained unresolved physical-fit evidence for manual review.',
  updated_at = now()
from phase_54_8_safe_shows candidate
where adoption.show_id = candidate.show_id
  and not exists (
    select 1 from phase_54_8_activated_shows activated
    where activated.show_id = candidate.show_id
  );

insert into public.physical_seating_reconciliation_queue (
  show_id, layout_version_id, reason, evidence_snapshot, status,
  detected_at, resolved_at, resolution_notes
)
select
  analysis.show_id,
  analysis.layout_version_id,
  'PHASE_54_8_ASSIGNMENT_RESTRICTION_RESOLUTION',
  analysis.before_evidence || jsonb_build_object(
    'decision', case
      when activated.show_id is not null then 'ACTIVATED'
      when safe.show_id is not null then 'MANUAL_REVIEW_RETAINED'
      else 'RESTRICTION_RECLASSIFIED'
    end,
    'showStatusPreserved', analysis.show_status,
    'occupancyGuests', analysis.occupancy_guests,
    'occupancyPercent', analysis.occupancy_percent,
    'thresholdPercent', analysis.threshold_percent,
    'queueBookings', analysis.queue_bookings,
    'blocker', case
      when activated.show_id is not null then null
      when analysis.occupancy_percent >= analysis.threshold_percent
        then 'AUTOMATIC_ASSIGNMENT_THRESHOLD_REACHED'
      when analysis.structural_blockers > 0 then 'STRUCTURAL_TABLE_CONFLICT'
      when analysis.capacity_blockers > 0
        then 'ASSIGNED_OR_CUSTOM_CAPACITY_CONFLICT'
      when analysis.zone_capacity_blockers > 0
        then 'APPROVED_ZONE_CAPACITY_EXCEEDED'
      when analysis.show_status not in ('inactive', 'sold_out')
        then 'UNSUPPORTED_SHOW_STATUS'
      else 'UNRESOLVED_BOOKINGS_REQUIRE_MANUAL_REVIEW'
    end,
    'phase', '54.8',
    'evaluatedAt', now()
  ),
  case when activated.show_id is not null then 'resolved' else 'pending' end,
  now(),
  case when activated.show_id is not null then now() else null end,
  case when activated.show_id is not null
    then 'Show availability was preserved while physical seating was reconciled and enabled.'
    else null end
from phase_54_8_analysis analysis
left join phase_54_8_safe_shows safe on safe.show_id = analysis.show_id
left join phase_54_8_activated_shows activated
  on activated.show_id = analysis.show_id
on conflict (show_id, layout_version_id, reason) do update set
  evidence_snapshot = excluded.evidence_snapshot,
  status = excluded.status,
  resolved_at = excluded.resolved_at,
  resolved_by_staff_id = null,
  resolution_notes = excluded.resolution_notes;

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_location, entity_reference, entity_type,
  outcome, reason, source_area
)
select
  'show.physical-assignment-restriction-resolved',
  'SYSTEM',
  array[candidate.venue_key],
  public.get_show_physical_reconciliation_evidence(candidate.show_id)
    || jsonb_build_object(
      'showStatusPreserved', candidate.show_status,
      'automaticAssignmentActivated', activated.show_id is not null,
      'assignedBookings', (
        select count(*) from phase_54_8_assignment_results result
        where result.show_id = candidate.show_id
          and result.result ->> 'outcome' = 'assigned'
      ),
      'phase', '54.8'
    ),
  candidate.before_evidence,
  array['physical_table_layout', 'permanent_table_capacities',
    'existing_booking_assignments', 'automatic_assignment_enabled'],
  candidate.show_id::text,
  candidate.venue,
  candidate.show_id::text,
  'show',
  'success',
  case when activated.show_id is not null
    then 'Physical seating reconciled independently of ticket-sale availability.'
    else 'Safe assignments applied; unresolved seating evidence remains manual.'
  end,
  'Phase 54.8 Assignment Restriction Resolution'
from phase_54_8_safe_shows candidate
left join phase_54_8_activated_shows activated
  on activated.show_id = candidate.show_id;

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

  perform public.try_automatic_table_assignment_phase_54_5(new.id);
  return null;
exception when others then
  return null;
end;
$$;

comment on function public.run_automatic_table_assignment_after_booking() is
  'Runs physical table assignment independently of ticket-sale availability for active, inactive/closed and sold-out shows with an adopted enabled layout; unsupported statuses remain fail-closed.';

do $$
begin
  if exists (
    select 1
    from public.shows show_row
    join phase_54_8_analysis analysis on analysis.show_id = show_row.id
    where show_row.status::text is distinct from analysis.show_status
  ) then
    raise exception 'PHASE_54_8_SHOW_STATUS_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_8_preserved_bookings preserved
    join public.bookings booking on booking.id = preserved.id
    where (to_jsonb(booking) - array['table_id', 'updated_at']::text[])
      is distinct from preserved.stable_values
  ) then
    raise exception 'PHASE_54_8_BOOKING_DATA_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_8_preserved_claims preserved
    join public.show_tables table_row on table_row.id = preserved.id
    where to_jsonb(table_row) is distinct from preserved.row_snapshot
  ) then
    raise exception 'PHASE_54_8_EXISTING_ASSIGNMENT_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_8_assignment_results result
    join public.bookings booking on booking.id = result.booking_id
    where result.result ->> 'outcome' = 'assigned'
      and not coalesce((
        public.resolve_booking_table_assignment_compatibility(
          booking.id, booking.guest_count
        ) ->> 'compatible'
      )::boolean, false)
  ) then
    raise exception 'PHASE_54_8_ASSIGNMENT_INTEGRITY_FAILED';
  end if;

  if exists (
    select 1
    from public.show_tables first_claim
    join public.show_tables duplicate_claim
      on duplicate_claim.id = first_claim.id
     and duplicate_claim.booking_id <> first_claim.booking_id
  ) then
    raise exception 'PHASE_54_8_DUPLICATE_TABLE_CLAIM';
  end if;
end;
$$;
