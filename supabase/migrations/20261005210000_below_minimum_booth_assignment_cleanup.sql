-- P0 Floor integrity: release the eight proven below-minimum Private Booth
-- assignments to Floor Assignment. Booking entitlement and all financial,
-- ticket, show, zone, capacity, and physical-table configuration stay intact.

create temporary table p0_below_minimum_booth_expected (
  booking_reference text primary key,
  venue text not null,
  show_date date not null,
  show_time time not null,
  guest_count integer not null,
  table_code text not null,
  minimum_occupancy integer not null,
  maximum_occupancy integer not null
) on commit drop;

insert into p0_below_minimum_booth_expected
  (booking_reference, venue, show_date, show_time, guest_count, table_code,
   minimum_occupancy, maximum_occupancy)
values
  ('ZNG-9QZGU4', 'johannesburg', date '2026-10-09', time '17:00', 2, '1', 4, 6),
  ('ZNG-FF3JNU', 'johannesburg', date '2026-10-10', time '17:00', 2, '4', 4, 6),
  ('ZNG-FJGCWB', 'johannesburg', date '2026-10-10', time '17:00', 2, '5', 4, 6),
  ('ZNG-WNRGQV', 'johannesburg', date '2026-10-17', time '17:00', 2, '12', 4, 6),
  ('DP-JHB-025B0F833094', 'johannesburg', date '2026-11-21', time '17:00', 2, '15', 4, 6),
  ('ZNG-2M2WJD', 'cape-town', date '2026-11-27', time '18:00', 2, '1', 4, 6),
  ('ZNG-5NFBNJ', 'johannesburg', date '2026-12-12', time '17:00', 7, '23+24', 8, 12),
  ('ZNG-U4RPUA', 'johannesburg', date '2026-12-12', time '17:00', 7, '21+22', 8, 12);

create temporary table p0_below_minimum_booth_targets on commit drop as
select
  booking.id as booking_id,
  booking.booking_reference,
  booking.table_id as before_table_id,
  table_row.id as claim_id,
  table_row.table_code,
  table_row.capacity as combined_capacity,
  expected.minimum_occupancy,
  expected.maximum_occupancy,
  booking.guest_count,
  booking.show_id
from p0_below_minimum_booth_expected expected
join public.bookings booking
  on booking.booking_reference = expected.booking_reference
join public.shows show_row
  on show_row.id = booking.show_id
left join public.show_tables table_row
  on table_row.booking_id = booking.id
 and table_row.merged_parent_id is null
where show_row.venue = expected.venue
  and show_row.date = expected.show_date
  and show_row.time = expected.show_time
  and booking.guest_count = expected.guest_count
  and public.normalize_booking_capacity_zone(booking.section) = 'royal-booths'
  and booking.archived_at is null
  and booking.booking_status::text not in ('cancelled', 'refunded');

do $validation$
declare
  v_expected integer := 8;
begin
  if (select count(*) from p0_below_minimum_booth_expected) <> v_expected then
    raise exception 'Expected eight approved below-minimum Booth corrections';
  end if;

  if (
    select count(*)
    from p0_below_minimum_booth_expected expected
    join public.bookings booking
      on booking.booking_reference = expected.booking_reference
    join public.shows show_row
      on show_row.id = booking.show_id
     and show_row.venue = expected.venue
     and show_row.date = expected.show_date
     and show_row.time = expected.show_time
    where booking.guest_count = expected.guest_count
      and public.normalize_booking_capacity_zone(booking.section) = 'royal-booths'
      and booking.archived_at is null
      and booking.booking_status::text not in ('cancelled', 'refunded')
  ) <> v_expected then
    raise exception 'An approved booking identity, show, zone, pax, or active state changed';
  end if;

  -- Permit a clean replay only when every target is already unassigned and has
  -- exactly one immutable success event from this correction.
  if not exists (select 1 from p0_below_minimum_booth_targets where claim_id is not null) then
    if exists (
      select 1
      from p0_below_minimum_booth_expected expected
      join public.bookings booking
        on booking.booking_reference = expected.booking_reference
      where booking.table_id is not null
         or exists (
           select 1 from public.show_tables table_row
           where table_row.booking_id = booking.id
             and table_row.merged_parent_id is null
         )
         or (
           select count(*) from public.audit_events audit
           where audit.action = 'booking.table-assignment-integrity-corrected'
             and audit.entity_id = booking.id::text
             and audit.reason = 'Below minimum Booth occupancy'
             and audit.outcome = 'success'
         ) <> 1
    ) then
      raise exception 'Existing Booth cleanup state is incomplete or ambiguous';
    end if;
    return;
  end if;

  if (select count(*) from p0_below_minimum_booth_targets where claim_id is not null) <> v_expected then
    raise exception 'Expected all eight audited Booth claims to be present';
  end if;

  if exists (
    select 1
    from p0_below_minimum_booth_targets target
    join p0_below_minimum_booth_expected expected
      on expected.booking_reference = target.booking_reference
    where target.before_table_id is distinct from target.claim_id
       or target.table_code <> expected.table_code
       or target.combined_capacity <> expected.maximum_occupancy
       or (select count(*) from public.show_tables claim
           where claim.booking_id = target.booking_id
             and claim.merged_parent_id is null) <> 1
       or coalesce(
         (public.resolve_booking_table_assignment_compatibility(target.booking_id, null)
           ->> 'reason'),
         ''
       ) <> 'occupancy-range'
       or (public.resolve_booking_table_assignment_compatibility(target.booking_id, null)
           ->> 'minimum')::integer <> expected.minimum_occupancy
       or (public.resolve_booking_table_assignment_compatibility(target.booking_id, null)
           ->> 'maximum')::integer <> expected.maximum_occupancy
       or (public.resolve_booking_table_assignment_compatibility(target.booking_id, null)
           ->> 'entitlement')::integer <> expected.guest_count
  ) then
    raise exception 'An audited Booth assignment no longer matches the approved correction';
  end if;

  -- Stop instead of releasing when a currently available, authoritative,
  -- same-zone unit can safely seat the booking. Legacy non-operational rows are
  -- deliberately not treated as assignable tables.
  if exists (
    select 1
    from p0_below_minimum_booth_targets target
    join public.show_tables candidate
      on candidate.show_id = target.show_id
     and candidate.booking_id is null
     and candidate.merged_parent_id is null
     and candidate.status::text = 'available'
     and candidate.capacity_configured
     and candidate.capacity is not null
     and public.normalize_booking_capacity_zone(candidate.section) = 'royal-booths'
    left join public.venue_tables venue_table
      on venue_table.id = candidate.venue_table_id
    where candidate.id <> target.claim_id
      and candidate.capacity >= target.guest_count
      and case
        when candidate.is_physical then
          venue_table.id is not null
          and venue_table.is_physical
          and cardinality(coalesce(candidate.merged_from, '{}'::uuid[])) = 0
          and target.guest_count >= coalesce(venue_table.minimum_capacity, candidate.capacity)
        when cardinality(coalesce(candidate.merged_from, '{}'::uuid[])) >= 2 then
          candidate.is_override
          and candidate.availability_scope::text = 'operational'
          and target.guest_count >= coalesce((
            select sum(coalesce(child_venue.minimum_capacity, child.capacity))
            from public.show_tables child
            left join public.venue_tables child_venue on child_venue.id = child.venue_table_id
            where child.id = any(candidate.merged_from)
          ), candidate.capacity)
        else
          not candidate.is_physical
          and candidate.is_override
          and candidate.availability_scope::text = 'operational'
          and cardinality(coalesce(candidate.merged_from, '{}'::uuid[])) = 0
      end
  ) then
    raise exception 'A compatible Booth became available; use the authoritative reassignment workflow';
  end if;
end
$validation$;

-- On a replay the targets table has no claims, so both updates and the audit
-- insert are no-ops. Only top-level claims are released; merged children and
-- permanent/temporary table configuration are untouched.
update public.show_tables table_row
set
  booking_id = null,
  status = case
    when table_row.capacity_configured then 'available'::public.table_status
    else 'disabled'::public.table_status
  end,
  updated_at = clock_timestamp()
from p0_below_minimum_booth_targets target
where table_row.id = target.claim_id
  and table_row.booking_id = target.booking_id;

update public.bookings booking
set
  table_id = null,
  updated_at = clock_timestamp()
from p0_below_minimum_booth_targets target
where booking.id = target.booking_id
  and target.claim_id is not null
  and booking.table_id = target.claim_id;

insert into public.audit_events (
  actor_name,
  action,
  entity_type,
  entity_reference,
  entity_id,
  outcome,
  source_area,
  reason,
  before_values,
  after_values,
  changed_fields
)
select
  'SYSTEM',
  'booking.table-assignment-integrity-corrected',
  'booking',
  target.booking_reference,
  target.booking_id::text,
  'success',
  'Operations Floor',
  'Below minimum Booth occupancy',
  jsonb_build_object(
    'table_id', target.before_table_id,
    'table_code', target.table_code,
    'guest_count', target.guest_count,
    'minimum_occupancy', target.minimum_occupancy,
    'maximum_occupancy', target.maximum_occupancy,
    'combined_capacity', target.combined_capacity,
    'floor_assignment_required', false
  ),
  jsonb_build_object(
    'table_id', null,
    'table_codes', '[]'::jsonb,
    'guest_count', target.guest_count,
    'floor_assignment_required', true
  ),
  array['table_id', 'show_tables']
from p0_below_minimum_booth_targets target
where target.claim_id is not null
  and not exists (
    select 1
    from public.audit_events audit
    where audit.action = 'booking.table-assignment-integrity-corrected'
      and audit.entity_id = target.booking_id::text
      and audit.reason = 'Below minimum Booth occupancy'
      and audit.outcome = 'success'
  );

do $postcondition$
begin
  if exists (
    select 1
    from p0_below_minimum_booth_expected expected
    join public.bookings booking
      on booking.booking_reference = expected.booking_reference
    where booking.table_id is not null
       or exists (
         select 1 from public.show_tables table_row
         where table_row.booking_id = booking.id
           and table_row.merged_parent_id is null
       )
       or (
         select count(*) from public.audit_events audit
         where audit.action = 'booking.table-assignment-integrity-corrected'
           and audit.entity_id = booking.id::text
           and audit.reason = 'Below minimum Booth occupancy'
           and audit.outcome = 'success'
       ) <> 1
  ) then
    raise exception 'Below-minimum Booth cleanup postcondition failed';
  end if;
end
$postcondition$;
