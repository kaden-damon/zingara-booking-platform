-- Phase 54.13: inherit missing permanent-table capacities from Richard's
-- approved master without touching configured, assigned or exceptional tables.

begin;

create temporary table phase_54_13_protected_tables on commit drop as
select table_row.id, to_jsonb(table_row) as snapshot
from public.show_tables table_row
where table_row.booking_id is not null
   or table_row.is_override
   or table_row.merged_parent_id is not null
   or coalesce(cardinality(table_row.merged_from), 0) > 0;

create temporary table phase_54_13_capacity_candidates on commit drop as
select
  table_row.id as table_id,
  table_row.show_id,
  table_row.table_code,
  approved.maximum_guests,
  public.normalize_booking_capacity_zone(table_row.section) as zone_id,
  case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
  end as venue
from public.show_tables table_row
join public.shows show_row on show_row.id = table_row.show_id
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = setting.approved_layout_version_id
 and approved.table_code = table_row.table_code
 and approved.zone_id =
   public.normalize_booking_capacity_zone(table_row.section)
where show_row.date >= current_date
  and show_row.status::text in ('active', 'inactive', 'sold_out')
  and table_row.is_physical
  and not table_row.is_override
  and table_row.booking_id is null
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and table_row.merged_parent_id is null
  and not table_row.capacity_configured
  and table_row.capacity is null
  and table_row.status::text = 'disabled'
  and coalesce(table_row.override_notes, '') in (
    'Capacity must be configured for this performance.',
    'Capacity must be configured for each performance.'
  );

do $$
begin
  if exists (
    select 1
    from phase_54_13_capacity_candidates candidate
    group by candidate.show_id, candidate.table_code
    having count(*) > 1
  ) then
    raise exception 'PHASE_54_13_DUPLICATE_MASTER_TABLE_CANDIDATE';
  end if;
end;
$$;

update public.show_tables table_row set
  capacity = candidate.maximum_guests,
  capacity_configured = true,
  status = 'available'::public.table_status,
  override_notes = null,
  updated_at = now()
from phase_54_13_capacity_candidates candidate
where table_row.id = candidate.table_id
  and table_row.show_id = candidate.show_id
  and table_row.table_code = candidate.table_code
  and table_row.is_physical
  and not table_row.is_override
  and table_row.booking_id is null
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and table_row.merged_parent_id is null
  and not table_row.capacity_configured
  and table_row.capacity is null
  and table_row.status::text = 'disabled'
  and coalesce(table_row.override_notes, '') in (
    'Capacity must be configured for this performance.',
    'Capacity must be configured for each performance.'
  );

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_location, entity_reference,
  entity_type, outcome, reason, source_area
)
select
  'show.permanent-table-capacities-inherited',
  'SYSTEM',
  array[candidate.venue],
  jsonb_build_object(
    'tableCount', count(*),
    'tableCodes', jsonb_agg(candidate.table_code order by candidate.table_code),
    'capacitySource', 'Richard approved 74-table master'
  ),
  jsonb_build_object('missingPermanentTableCapacities', count(*)),
  array['permanent_table_capacities'],
  candidate.show_id::text,
  candidate.venue,
  candidate.show_id::text,
  'show',
  'success',
  'Missing permanent-table capacities inherited from the approved master; existing arrangements preserved.',
  'Table Plan'
from phase_54_13_capacity_candidates candidate
join public.show_tables table_row on table_row.id = candidate.table_id
where table_row.capacity_configured
  and table_row.capacity = candidate.maximum_guests
  and table_row.status::text = 'available'
group by candidate.show_id, candidate.venue;

create temporary table phase_54_13_target_assignment_results (
  booking_id uuid primary key,
  booking_reference text not null,
  guest_count integer not null,
  result jsonb not null
) on commit drop;

insert into phase_54_13_target_assignment_results (
  booking_id, booking_reference, guest_count, result
)
select booking.id, booking.booking_reference, booking.guest_count,
  public.try_hybrid_table_assignment_phase_54_11(booking.id)
from public.bookings booking
where booking.id = any(array[
  'ebf47c76-f08d-47f0-b169-9baf4789b122'::uuid,
  '63012e47-f33b-4152-bc42-e129718d14b7'::uuid,
  '158d874a-9be9-4d1b-ac3e-10a119142fb2'::uuid,
  '92a1bf28-b3a6-4409-a087-6301054b138e'::uuid,
  'd681ab87-6cdf-4518-9138-c6d7caaa20b7'::uuid,
  '700b6032-0ac1-4d2e-a126-45f3228c585a'::uuid,
  '7be913d1-8d87-4232-ad12-3040ed73f8ca'::uuid,
  '8701d8bc-bb86-41b5-bb98-c1f00bf3f4cd'::uuid,
  'c5626693-ef83-4215-9443-47ef0ff0047d'::uuid,
  'dc476995-65e6-4c5c-ad1c-b4d7529b2761'::uuid
])
order by booking.guest_count desc, booking.booking_reference;

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_location, entity_reference,
  entity_type, outcome, reason, source_area
)
select
  'show.phase-54-13-capacity-and-assignment-review',
  'SYSTEM',
  array['johannesburg'],
  jsonb_build_object(
    'reviewedBookings', count(*),
    'assignedBookings', count(*) filter (
      where result ->> 'outcome' = 'assigned'
    ),
    'manualBookings', count(*) filter (
      where result ->> 'outcome' = 'manual_queue'
    ),
    'skippedBookings', count(*) filter (
      where result ->> 'outcome' = 'skipped'
    ),
    'assignedGuests', coalesce(sum(guest_count) filter (
      where result ->> 'outcome' = 'assigned'
    ), 0),
    'results', jsonb_agg(jsonb_build_object(
      'bookingReference', booking_reference,
      'guestCount', guest_count,
      'outcome', result ->> 'outcome',
      'reason', result ->> 'reason',
      'tableCodes', result -> 'table_codes'
    ) order by booking_reference)
  ),
  '{}'::jsonb,
  array['existing_assignment_queue'],
  '09432b41-c285-4732-8a22-f6888eac9033',
  'johannesburg',
  '09432b41-c285-4732-8a22-f6888eac9033',
  'show',
  'success',
  'Existing waiting bookings re-evaluated after authoritative permanent-table capacities were restored.',
  'Table Plan'
from phase_54_13_target_assignment_results;

do $$
begin
  if exists (
    select 1
    from phase_54_13_capacity_candidates candidate
    join public.show_tables table_row on table_row.id = candidate.table_id
    where not table_row.capacity_configured
       or table_row.capacity is distinct from candidate.maximum_guests
       or table_row.status::text not in ('available', 'booked')
       or (table_row.status::text = 'booked' and table_row.booking_id is null)
       or table_row.is_override
       or table_row.merged_parent_id is not null
       or coalesce(cardinality(table_row.merged_from), 0) > 0
  ) then
    raise exception 'PHASE_54_13_CAPACITY_INHERITANCE_FAILED';
  end if;

  if exists (
    select 1
    from phase_54_13_protected_tables protected
    join public.show_tables current_row on current_row.id = protected.id
    where to_jsonb(current_row) - 'updated_at'
      is distinct from protected.snapshot - 'updated_at'
  ) then
    raise exception 'PHASE_54_13_PROTECTED_TABLE_MUTATED';
  end if;

  if exists (
    select 1
    from phase_54_13_target_assignment_results result
    where result.result ->> 'outcome' not in (
      'assigned', 'manual_queue', 'skipped'
    )
  ) then
    raise exception 'PHASE_54_13_ASSIGNMENT_RESULT_INVALID';
  end if;
end;
$$;

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
  v_waiting_guests integer := 0;
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

  select count(*)::integer, coalesce(sum(booking.guest_count), 0)::integer
    into v_waiting, v_waiting_guests
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
    'awaitingAssignmentGuests', v_waiting_guests,
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

revoke all on function public.get_box_office_assignment_approval_status(uuid)
  from public, anon, authenticated;
grant execute on function public.get_box_office_assignment_approval_status(uuid)
  to service_role;

comment on function public.get_box_office_assignment_approval_status(uuid) is
  'Returns plain Box Office assignment facts without polling or changing operational state.';

commit;
