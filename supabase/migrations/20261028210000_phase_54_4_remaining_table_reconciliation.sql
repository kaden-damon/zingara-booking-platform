-- Phase 54.4: reconcile additional future shows only when they have no booking
-- records or operational table decisions. Show status is preserved exactly.

create or replace function public.run_automatic_table_assignment_after_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = new.show_id
      and show_row.status::text = 'active'
  ) then
    return null;
  end if;

  perform public.try_automatic_table_assignment(new.id);
  return null;
exception when others then
  return null;
end;
$$;

create temporary table phase_54_4_safe_shows on commit drop as
select
  show_row.id as show_id,
  show_row.venue,
  show_row.date,
  show_row.time,
  show_row.status::text as show_status,
  setting.approved_layout_version_id as layout_version_id,
  public.get_show_physical_reconciliation_evidence(show_row.id) as before_evidence
from public.shows show_row
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
where (show_row.date::date + coalesce(show_row.time, '00:00'::time)) >= timezone('Africa/Johannesburg', now())
  and not exists (
    select 1 from public.show_physical_seating_layouts adoption
    where adoption.show_id = show_row.id
      and adoption.adoption_status = 'adopted'
  )
  and not exists (select 1 from public.bookings booking where booking.show_id = show_row.id)
  and not exists (
    select 1 from public.show_tables table_row
    where table_row.show_id = show_row.id
      and (
        table_row.booking_id is not null
        or table_row.is_override
        or cardinality(coalesce(table_row.merged_from, '{}'::uuid[])) > 0
        or table_row.merged_parent_id is not null
      )
  )
  and not exists (
    select 1
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = show_row.id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
    left join public.venue_tables venue_table on venue_table.id = table_row.venue_table_id
    where approved.layout_version_id = setting.approved_layout_version_id
      and table_row.capacity_configured
      and table_row.capacity is distinct from approved.maximum_guests
      and (
        venue_table.id is null
        or table_row.capacity is distinct from venue_table.capacity
      )
  )
  and not exists (
    select 1
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = show_row.id
     and table_row.table_code = approved.table_code
     and public.normalize_booking_capacity_zone(table_row.section) is distinct from approved.zone_id
    where approved.layout_version_id = setting.approved_layout_version_id
      and not (
        table_row.is_physical
        and not table_row.is_override
        and table_row.booking_id is null
        and not table_row.capacity_configured
        and table_row.capacity is null
        and table_row.status::text = 'disabled'
        and coalesce(cardinality(table_row.merged_from), 0) = 0
        and table_row.merged_parent_id is null
        and table_row.venue_table_id is not null
      )
  );

insert into public.show_physical_seating_layouts (
  show_id, layout_version_id, adoption_status, automatic_assignment_enabled,
  adoption_source, pause_threshold_percent, assignment_state,
  threshold_override_active, state_changed_at, state_change_reason
)
select
  candidate.show_id, candidate.layout_version_id, 'pending_reconciliation',
  false, 'system_reconciliation', 70, 'disabled', false, now(),
  'Phase 54.4 controlled zero-booking reconciliation started.'
from phase_54_4_safe_shows candidate
on conflict (show_id) do nothing;

update public.show_tables table_row set
  section = approved.zone_id,
  venue_table_id = null,
  capacity = approved.maximum_guests,
  capacity_configured = true,
  status = 'available',
  override_notes = 'Approved Phase 54.1 master capacity populated by Phase 54.4.',
  updated_at = now()
from phase_54_4_safe_shows candidate
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = candidate.layout_version_id
where table_row.show_id = candidate.show_id
  and table_row.table_code = approved.table_code
  and public.normalize_booking_capacity_zone(table_row.section) is distinct from approved.zone_id
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
  status = case
    when table_row.status::text = 'disabled' then 'available'::public.table_status
    else table_row.status
  end,
  override_notes = case
    when table_row.override_notes in (
      'Capacity must be configured for this performance.',
      'Capacity must be configured for each performance.'
    ) then null
    else table_row.override_notes
  end,
  updated_at = now()
from phase_54_4_safe_shows candidate
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
    (not table_row.capacity_configured and table_row.capacity is null and table_row.status::text = 'disabled')
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
  candidate.show_id, null, approved.table_code, approved.zone_id,
  approved.maximum_guests, true, 'available'::public.table_status, null,
  '{}'::uuid[],
  'Approved Phase 54.1 master table introduced by Phase 54.4.',
  false, true, 'public'::public.table_availability_scope
from phase_54_4_safe_shows candidate
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
    from phase_54_4_safe_shows candidate
    join public.physical_seating_layout_tables approved
      on approved.layout_version_id = candidate.layout_version_id
    left join public.show_tables table_row
      on table_row.show_id = candidate.show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
     and table_row.capacity_configured
     and table_row.capacity = approved.maximum_guests
     and table_row.status::text = 'available'
    where table_row.id is null
  ) then
    raise exception 'PHASE_54_4_MASTER_RECONCILIATION_INCOMPLETE';
  end if;
end;
$$;

update public.show_physical_seating_layouts adoption set
  adoption_status = 'adopted',
  automatic_assignment_enabled = true,
  adoption_source = 'system_reconciliation',
  adopted_at = now(),
  adopted_by_staff_id = null,
  pause_threshold_percent = 70,
  assignment_state = 'enabled',
  threshold_override_active = false,
  assignment_revision = assignment_revision + 1,
  state_changed_at = now(),
  state_changed_by_staff_id = null,
  state_change_reason = 'Phase 54.4 approved status-preserving zero-booking reconciliation.',
  updated_at = now()
from phase_54_4_safe_shows candidate
where adoption.show_id = candidate.show_id;

update public.physical_seating_reconciliation_queue queue set
  status = 'resolved',
  resolved_at = now(),
  resolved_by_staff_id = null,
  resolution_notes = 'Resolved by Phase 54.4 status-preserving zero-booking reconciliation.'
from phase_54_4_safe_shows candidate
where queue.show_id = candidate.show_id
  and queue.status = 'pending';

insert into public.physical_seating_reconciliation_queue (
  show_id, layout_version_id, reason, evidence_snapshot, status,
  detected_at, resolved_at, resolution_notes
)
select
  candidate.show_id,
  candidate.layout_version_id,
  'PHASE_54_4_MASTER_RECONCILIATION',
  jsonb_build_object(
    'decision', 'ACTIVATED',
    'showStatusPreserved', candidate.show_status,
    'before', candidate.before_evidence,
    'after', public.get_show_physical_reconciliation_evidence(candidate.show_id)
  ),
  'resolved', now(), now(),
  'Reconciled without changing show status, bookings or assignments.'
from phase_54_4_safe_shows candidate
on conflict (show_id, layout_version_id, reason) do update set
  evidence_snapshot = excluded.evidence_snapshot,
  status = 'resolved',
  resolved_at = excluded.resolved_at,
  resolution_notes = excluded.resolution_notes;

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_location, entity_reference, entity_type,
  outcome, reason, source_area
)
select
  'show.physical-layout-reconciled-status-preserved',
  'SYSTEM',
  array[case
    when lower(trim(candidate.venue)) in ('cape-town', 'cape town') then 'cape-town'
    else 'johannesburg'
  end],
  public.get_show_physical_reconciliation_evidence(candidate.show_id)
    || jsonb_build_object('showStatusPreserved', candidate.show_status),
  candidate.before_evidence,
  array['physical_table_layout', 'permanent_table_capacities', 'automatic_assignment_enabled'],
  candidate.show_id::text,
  candidate.venue,
  candidate.show_id::text,
  'show',
  'success',
  'Zero-booking performance reconciled while preserving its existing booking restriction status.',
  'Phase 54.4 Table Reconciliation'
from phase_54_4_safe_shows candidate;

insert into public.physical_seating_reconciliation_queue (
  show_id, layout_version_id, reason, evidence_snapshot, status
)
select
  show_row.id,
  setting.approved_layout_version_id,
  'PHASE_54_4_MASTER_RECONCILIATION',
  public.get_show_physical_reconciliation_evidence(show_row.id)
    || jsonb_build_object(
      'decision', 'EXCLUDED',
      'blocker', case
        when exists (select 1 from public.bookings booking where booking.show_id = show_row.id)
          then 'EXISTING_BOOKINGS_REQUIRE_MANUAL_RECONCILIATION'
        else 'OPERATIONAL_TABLE_CONFLICT_REQUIRES_MANUAL_RECONCILIATION'
      end
    ),
  'pending'
from public.shows show_row
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
where (show_row.date::date + coalesce(show_row.time, '00:00'::time)) >= timezone('Africa/Johannesburg', now())
  and not exists (
    select 1 from public.show_physical_seating_layouts adoption
    where adoption.show_id = show_row.id
      and adoption.adoption_status = 'adopted'
  )
on conflict (show_id, layout_version_id, reason) do update set
  evidence_snapshot = excluded.evidence_snapshot,
  status = 'pending',
  resolved_at = null,
  resolved_by_staff_id = null,
  resolution_notes = null;

do $$
begin
  if exists (
    select 1
    from phase_54_4_safe_shows candidate
    join public.shows show_row on show_row.id = candidate.show_id
    where show_row.status::text is distinct from candidate.show_status
  ) then
    raise exception 'PHASE_54_4_SHOW_STATUS_CHANGED';
  end if;

  if exists (
    select 1
    from phase_54_4_safe_shows candidate
    join public.bookings booking on booking.show_id = candidate.show_id
  ) then
    raise exception 'PHASE_54_4_BOOKING_RECORD_CHANGED';
  end if;
end;
$$;

comment on function public.run_automatic_table_assignment_after_booking() is
  'Runs Phase 54 automatic assignment only for active performances; all restricted statuses remain fail-closed.';
