-- Phase 54.5: reconcile only conflict-free active performances below the
-- configured pause threshold, then assign existing single-zone Standard and
-- Corporate bookings to approved permanent tables in bounded atomic batches.

create or replace function public.resolve_approved_table_minimum_occupancy(
  p_table_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    venue_table.minimum_capacity,
    case when exists (
      select 1
      from public.shows show_row
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
       and approved.maximum_guests = table_row.capacity
      where show_row.id = table_row.show_id
    ) then least(2, table_row.capacity) else null end
  )
  from public.show_tables table_row
  left join public.venue_tables venue_table
    on venue_table.id = table_row.venue_table_id
   and venue_table.is_physical
  where table_row.id = p_table_id
    and table_row.is_physical
    and table_row.capacity_configured
    and table_row.capacity is not null
    and coalesce(cardinality(table_row.merged_from), 0) = 0;
$$;

-- Phase 54.1 introduced approved master rows that intentionally have no legacy
-- venue-table identity (including moved table 400 and new tables 406/506).
-- Keep assignment integrity fail-closed while recognising those rows only when
-- code, zone and maximum capacity exactly match the show's approved layout.
create or replace function public.resolve_booking_table_assignment_compatibility(
  p_booking_id uuid,
  p_guest_count integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_claim_count integer;
  v_entitlement integer;
  v_set record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;

  if v_booking.id is null then
    return jsonb_build_object('compatible', true, 'reason', 'booking-not-present');
  end if;

  select count(*)::integer into v_claim_count
  from public.show_tables
  where booking_id = v_booking.id
    and merged_parent_id is null;

  if v_claim_count = 0 then
    return jsonb_build_object(
      'compatible', v_booking.table_id is null,
      'reason', case when v_booking.table_id is null
        then 'unassigned' else 'stale-booking-pointer' end
    );
  end if;

  if v_booking.table_id is null or not exists (
    select 1 from public.show_tables
    where id = v_booking.table_id
      and booking_id = v_booking.id
      and merged_parent_id is null
  ) then
    return jsonb_build_object(
      'compatible', false,
      'reason', 'stale-booking-pointer'
    );
  end if;

  for v_set in
    select
      public.normalize_booking_capacity_zone(st.section) as zone_id,
      sum(st.capacity)::integer as maximum_occupancy,
      sum(
        case
          when st.is_physical then coalesce(
            vt.minimum_capacity,
            case when exists (
              select 1
              from public.shows show_row
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
               and approved.table_code = st.table_code
               and approved.zone_id =
                 public.normalize_booking_capacity_zone(st.section)
               and approved.maximum_guests = st.capacity
              where show_row.id = st.show_id
            ) then least(2, st.capacity) else st.capacity end
          )
          when cardinality(coalesce(st.merged_from, '{}'::uuid[])) >= 2
            then coalesce((
              select sum(coalesce(child_vt.minimum_capacity, child.capacity))
              from public.show_tables child
              left join public.venue_tables child_vt
                on child_vt.id = child.venue_table_id
              where child.id = any(st.merged_from)
            ), st.capacity)
          else 1
        end
      )::integer as minimum_occupancy,
      bool_and(st.show_id = v_booking.show_id) as correct_show,
      bool_and(
        st.capacity_configured and st.capacity is not null and st.capacity > 0
      ) as capacity_valid,
      bool_and(
        st.status::text = 'booked' and st.booking_id = v_booking.id
      ) as ownership_valid,
      bool_and(
        case
          when st.is_physical then
            cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
            and (
              (vt.id is not null and vt.is_physical)
              or exists (
                select 1
                from public.shows show_row
                join public.physical_seating_venue_settings setting
                  on setting.venue = case
                    when lower(trim(coalesce(show_row.venue, ''))) in
                      ('cape-town', 'cape town') then 'cape-town'
                    when lower(trim(coalesce(show_row.venue, ''))) in
                      ('johannesburg', 'joburg') then 'johannesburg'
                    else ''
                  end
                join public.physical_seating_layout_tables approved
                  on approved.layout_version_id =
                    setting.approved_layout_version_id
                 and approved.table_code = st.table_code
                 and approved.zone_id =
                   public.normalize_booking_capacity_zone(st.section)
                 and approved.maximum_guests = st.capacity
                where show_row.id = st.show_id
              )
            )
          when cardinality(coalesce(st.merged_from, '{}'::uuid[])) >= 2 then
            st.is_override
            and st.availability_scope::text = 'operational'
            and st.merged_parent_id is null
            and (
              select count(*)
              from public.show_tables child
              where child.id = any(st.merged_from)
                and child.show_id = st.show_id
                and public.normalize_booking_capacity_zone(child.section) =
                  public.normalize_booking_capacity_zone(st.section)
                and child.is_physical
                and child.capacity_configured
                and child.capacity is not null
                and child.status::text = 'disabled'
                and child.booking_id is null
                and child.merged_parent_id = st.id
                and cardinality(coalesce(child.merged_from, '{}'::uuid[])) = 0
            ) = cardinality(st.merged_from)
            and (
              select coalesce(sum(child.capacity), 0)
              from public.show_tables child
              where child.id = any(st.merged_from)
            ) = st.capacity
          else
            not st.is_physical
            and st.is_override
            and st.availability_scope::text = 'operational'
            and st.merged_parent_id is null
            and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
        end
      ) as unit_valid
    from public.show_tables st
    left join public.venue_tables vt on vt.id = st.venue_table_id
    where st.booking_id = v_booking.id
      and st.merged_parent_id is null
    group by public.normalize_booking_capacity_zone(st.section)
  loop
    if v_set.zone_id is null
       or not v_set.correct_show
       or not v_set.capacity_valid
       or not v_set.ownership_valid
       or not v_set.unit_valid then
      return jsonb_build_object(
        'compatible', false,
        'reason', 'assignment-integrity',
        'zone', v_set.zone_id
      );
    end if;

    v_entitlement := public.booking_zone_entitlement_pax(
      v_booking.zone_entitlements,
      v_booking.section,
      coalesce(p_guest_count, v_booking.guest_count),
      v_set.zone_id
    );

    if v_entitlement <= 0 then
      return jsonb_build_object(
        'compatible', false,
        'reason', 'wrong-zone',
        'zone', v_set.zone_id
      );
    end if;

    if v_entitlement < v_set.minimum_occupancy
       or v_entitlement > v_set.maximum_occupancy then
      return jsonb_build_object(
        'compatible', false,
        'entitlement', v_entitlement,
        'maximum', v_set.maximum_occupancy,
        'minimum', v_set.minimum_occupancy,
        'reason', 'occupancy-range',
        'zone', v_set.zone_id
      );
    end if;
  end loop;

  return jsonb_build_object('compatible', true, 'reason', 'compatible');
end;
$$;

create or replace function public.reconcile_phase_54_5_assignment_batch(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned integer := 0;
  v_booking public.bookings%rowtype;
  v_booking_kind text;
  v_candidate public.show_tables%rowtype;
  v_candidate_capacity integer;
  v_candidate_codes uuid[];
  v_candidate_labels text[];
  v_candidate_minimum integer;
  v_failed integer := 0;
  v_occupancy integer;
  v_occupancy_percent numeric(7,2);
  v_processed integer := 0;
  v_row_count integer;
  v_settings public.physical_seating_venue_settings%rowtype;
  v_show public.shows%rowtype;
  v_threshold numeric(5,2);
  v_venue text;
  v_zone text;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'PHASE_54_5_BATCH_LIMIT_INVALID';
  end if;

  for v_booking in
    select booking.*
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
    join public.show_physical_seating_layouts adoption
      on adoption.show_id = booking.show_id
     and adoption.adoption_status = 'pending_reconciliation'
     and adoption.adoption_source = 'system_reconciliation'
     and adoption.assignment_state = 'disabled'
     and adoption.state_change_reason =
       'Phase 54.5 controlled backlog reconciliation started.'
    where show_row.status::text = 'active'
      and booking.archived_at is null
      and booking.booking_status::text in (
        'new', 'pending_payment', 'confirmed', 'checked_in'
      )
      and booking.table_id is null
      and not exists (
        select 1 from public.show_tables claimed
        where claimed.show_id = booking.show_id
          and claimed.booking_id = booking.id
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
      and not exists (
        select 1 from public.automatic_table_assignment_attempts attempt
        where attempt.booking_id = booking.id
      )
    order by
      show_row.date,
      show_row.time,
      booking.show_id,
      booking.guest_count desc,
      booking.booking_reference
    limit p_limit
  loop
    v_processed := v_processed + 1;

    begin
      perform pg_advisory_xact_lock(
        hashtextextended(
          'phase-54-5-backlog-assignment:' || v_booking.show_id::text,
          0
        )
      );

      select * into v_booking
      from public.bookings booking
      where booking.id = v_booking.id
      for update;

      if v_booking.id is null
         or v_booking.archived_at is not null
         or v_booking.booking_status::text not in (
           'new', 'pending_payment', 'confirmed', 'checked_in'
         )
         or v_booking.table_id is not null
         or exists (
           select 1 from public.show_tables claimed
           where claimed.show_id = v_booking.show_id
             and claimed.booking_id = v_booking.id
         ) then
        raise exception 'BOOKING_ASSIGNMENT_STATE_CHANGED';
      end if;

      select * into v_show from public.shows where id = v_booking.show_id;
      if v_show.status::text <> 'active' then
        raise exception 'SHOW_NOT_ACTIVE';
      end if;

      v_venue := case
        when lower(trim(coalesce(v_show.venue, ''))) in
          ('cape-town', 'cape town') then 'cape-town'
        when lower(trim(coalesce(v_show.venue, ''))) in
          ('johannesburg', 'joburg') then 'johannesburg'
        else null
      end;
      select * into v_settings
      from public.physical_seating_venue_settings setting
      where setting.venue = v_venue;
      select coalesce(adoption.pause_threshold_percent,
             v_settings.default_pause_threshold_percent, 70)
        into v_threshold
      from public.show_physical_seating_layouts adoption
      where adoption.show_id = v_booking.show_id
        and adoption.adoption_status = 'pending_reconciliation'
        and adoption.assignment_state = 'disabled'
      for update;
      if v_threshold is null then
        raise exception 'SHOW_RECONCILIATION_STATE_CHANGED';
      end if;

      select coalesce(sum(booking.guest_count), 0)::integer
        into v_occupancy
      from public.bookings booking
      where booking.show_id = v_booking.show_id
        and booking.archived_at is null
        and booking.booking_status::text in (
          'new', 'pending_payment', 'confirmed', 'checked_in'
        );
      v_occupancy_percent := round(
        (v_occupancy::numeric / 415::numeric) * 100,
        2
      );
      if v_occupancy_percent >= v_threshold then
        raise exception 'AUTOMATIC_ASSIGNMENT_THRESHOLD_REACHED';
      end if;

      v_booking_kind := case
        when v_booking.booking_source = 'corporate-direct' then 'corporate'
        else 'standard'
      end;
      v_zone := public.normalize_booking_capacity_zone(v_booking.section);
      if v_zone is null then
        raise exception 'SEATING_ZONE_REVIEW_REQUIRED';
      end if;

      v_candidate_capacity := 0;
      v_candidate_codes := '{}'::uuid[];
      v_candidate_labels := '{}'::text[];
      v_candidate_minimum := 0;

      while v_candidate_capacity < v_booking.guest_count loop
        select table_row.* into v_candidate
        from public.show_physical_seating_layouts adoption
        join public.physical_seating_layout_tables approved
          on approved.layout_version_id = adoption.layout_version_id
        join public.show_tables table_row
          on table_row.show_id = adoption.show_id
         and table_row.table_code = approved.table_code
         and table_row.is_physical
         and not table_row.is_override
         and coalesce(cardinality(table_row.merged_from), 0) = 0
         and table_row.merged_parent_id is null
         and public.normalize_booking_capacity_zone(table_row.section) =
           approved.zone_id
         and table_row.capacity_configured
         and table_row.capacity = approved.maximum_guests
         and table_row.booking_id is null
         and table_row.status::text = 'available'
         and public.resolve_approved_table_minimum_occupancy(table_row.id)
           is not null
         and v_candidate_minimum
           + public.resolve_approved_table_minimum_occupancy(table_row.id)
           <= v_booking.guest_count
        where adoption.show_id = v_booking.show_id
          and adoption.adoption_status = 'pending_reconciliation'
          and approved.zone_id = v_zone
          and not (table_row.id = any(v_candidate_codes))
        order by
          case
            when approved.maximum_guests >=
              v_booking.guest_count - v_candidate_capacity then 0
            else 1
          end,
          case
            when approved.maximum_guests >=
              v_booking.guest_count - v_candidate_capacity
              then approved.maximum_guests
          end asc,
          case
            when approved.maximum_guests <
              v_booking.guest_count - v_candidate_capacity
              then approved.maximum_guests
          end desc,
          approved.sort_order asc
        limit 1
        for update of table_row skip locked;

        exit when v_candidate.id is null;
        v_candidate_codes := array_append(v_candidate_codes, v_candidate.id);
        v_candidate_labels := array_append(
          v_candidate_labels,
          v_candidate.table_code
        );
        v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;
        v_candidate_minimum := v_candidate_minimum
          + public.resolve_approved_table_minimum_occupancy(v_candidate.id);
      end loop;

      if v_candidate_capacity < v_booking.guest_count then
        insert into public.automatic_table_assignment_attempts (
          booking_id, show_id, booking_reference, booking_kind, outcome,
          reason_code, reason_detail, occupancy_guests, occupancy_percent,
          threshold_percent
        ) values (
          v_booking.id, v_booking.show_id, v_booking.booking_reference,
          v_booking_kind, 'manual_queue',
          'BACKLOG_NO_SUITABLE_PHYSICAL_TABLE',
          'Phase 54.5 found no conflict-free approved physical table set.',
          v_occupancy, v_occupancy_percent, v_threshold
        ) on conflict (booking_id) do nothing;
        v_failed := v_failed + 1;
        continue;
      end if;

      update public.show_tables table_row set
        booking_id = v_booking.id,
        status = 'booked',
        updated_at = now()
      where table_row.id = any(v_candidate_codes)
        and table_row.booking_id is null
        and table_row.status::text = 'available';
      get diagnostics v_row_count = row_count;
      if v_row_count <> cardinality(v_candidate_codes) then
        raise exception 'AUTOMATIC_TABLE_SET_CHANGED';
      end if;

      update public.bookings booking set
        table_id = v_candidate_codes[1],
        updated_at = now()
      where booking.id = v_booking.id
        and booking.table_id is null;
      if not found then
        raise exception 'BOOKING_ALREADY_ASSIGNED';
      end if;

      insert into public.automatic_table_assignment_attempts (
        booking_id, show_id, booking_reference, booking_kind, outcome,
        reason_code, reason_detail, target_table_id, target_table_code,
        target_table_ids, target_table_codes, occupancy_guests,
        occupancy_percent, threshold_percent
      ) values (
        v_booking.id, v_booking.show_id, v_booking.booking_reference,
        v_booking_kind, 'assigned', 'BACKLOG_BEST_FIT_ASSIGNED',
        'Phase 54.5 assigned the smallest suitable approved physical table set atomically.',
        v_candidate_codes[1], v_candidate_labels[1], v_candidate_codes,
        v_candidate_labels, v_occupancy, v_occupancy_percent, v_threshold
      );

      insert into public.audit_events (
        action, actor_name, actor_location_scope, after_values, before_values,
        changed_fields, entity_id, entity_location, entity_reference,
        entity_type, outcome, reason, source_area
      ) values (
        'booking.table-backlog-reconciled', 'SYSTEM', array[v_venue],
        jsonb_build_object(
          'table_id', v_candidate_codes[1],
          'table_ids', v_candidate_codes,
          'table_codes', v_candidate_labels,
          'combined_capacity', v_candidate_capacity,
          'zone', v_zone,
          'phase', '54.5'
        ),
        jsonb_build_object('table_id', null),
        array['table_id'], v_booking.id::text, v_venue,
        v_booking.booking_reference, 'booking', 'success',
        'Conflict-free backlog assignment from the approved physical layout.',
        'Phase 54.5 Seating Reconciliation'
      );
      v_assigned := v_assigned + 1;
    exception when others then
      insert into public.automatic_table_assignment_attempts (
        booking_id, show_id, booking_reference, booking_kind, outcome,
        reason_code, reason_detail
      ) values (
        v_booking.id, v_booking.show_id, v_booking.booking_reference,
        case when v_booking.booking_source = 'corporate-direct'
          then 'corporate' else 'standard' end,
        'manual_queue', 'BACKLOG_ASSIGNMENT_CONFLICT',
        'Phase 54.5 detected changed or ambiguous assignment evidence; manual review remains required.'
      ) on conflict (booking_id) do nothing;
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'assigned', v_assigned,
    'manualQueue', v_failed
  );
end;
$$;

revoke all on function public.reconcile_phase_54_5_assignment_batch(integer)
  from public, anon, authenticated;
grant execute on function public.reconcile_phase_54_5_assignment_batch(integer)
  to service_role;

create temporary table phase_54_5_analysis on commit drop as
with remaining as (
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
    and not exists (
      select 1 from public.show_physical_seating_layouts adoption
      where adoption.show_id = show_row.id
        and adoption.adoption_status = 'adopted'
    )
), occupancy as (
  select
    candidate.id as show_id,
    coalesce(sum(booking.guest_count) filter (
      where booking.archived_at is null
        and booking.booking_status::text in (
          'new', 'pending_payment', 'confirmed', 'checked_in'
        )
    ), 0)::integer as occupancy_guests
  from remaining candidate
  left join public.bookings booking on booking.show_id = candidate.id
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
  occupancy.occupancy_guests,
  round((occupancy.occupancy_guests::numeric / 415::numeric) * 100, 2)
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
    as before_evidence
from remaining candidate
join occupancy on occupancy.show_id = candidate.id;

create temporary table phase_54_5_preserved_claims on commit drop as
select
  table_row.id,
  table_row.booking_id,
  table_row.status,
  table_row.capacity,
  table_row.capacity_configured,
  table_row.section,
  table_row.merged_parent_id,
  table_row.merged_from,
  table_row.is_override
from public.show_tables table_row
join phase_54_5_analysis analysis on analysis.show_id = table_row.show_id
where table_row.booking_id is not null;

create temporary table phase_54_5_preserved_bookings on commit drop as
select
  booking.id,
  booking.table_id,
  booking.guest_count,
  booking.section,
  booking.booking_status,
  booking.total_amount,
  booking.amount_paid,
  booking.balance_outstanding
from public.bookings booking
join phase_54_5_analysis analysis on analysis.show_id = booking.show_id
where booking.table_id is not null
   or exists (
     select 1 from public.show_tables table_row
     where table_row.show_id = booking.show_id
       and table_row.booking_id = booking.id
   );

create temporary table phase_54_5_safe_shows on commit drop as
select *
from phase_54_5_analysis analysis
where analysis.show_status = 'active'
  and analysis.occupancy_percent < analysis.threshold_percent
  and analysis.structural_blockers = 0
  and analysis.capacity_blockers = 0
  and analysis.zone_capacity_blockers = 0;

insert into public.show_physical_seating_layouts (
  show_id, layout_version_id, adoption_status, automatic_assignment_enabled,
  adoption_source, pause_threshold_percent, assignment_state,
  threshold_override_active, state_changed_at, state_change_reason
)
select
  candidate.show_id, candidate.layout_version_id, 'pending_reconciliation',
  false, 'system_reconciliation', candidate.threshold_percent, 'disabled',
  false, now(), 'Phase 54.5 controlled backlog reconciliation started.'
from phase_54_5_safe_shows candidate
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
  override_notes = 'Approved master capacity populated by Phase 54.5.',
  updated_at = now()
from phase_54_5_safe_shows candidate
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
  status = case
    when table_row.status::text = 'disabled'
      then 'available'::public.table_status
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
from phase_54_5_safe_shows candidate
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
  candidate.show_id, null, approved.table_code, approved.zone_id,
  approved.maximum_guests, true, 'available'::public.table_status, null,
  '{}'::uuid[], 'Approved master table introduced by Phase 54.5.',
  false, true, 'public'::public.table_availability_scope
from phase_54_5_safe_shows candidate
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = candidate.layout_version_id
where not exists (
  select 1 from public.show_tables table_row
  where table_row.show_id = candidate.show_id
    and table_row.table_code = approved.table_code
);

do $$
declare
  v_batch jsonb;
  v_iteration integer := 0;
begin
  loop
    v_iteration := v_iteration + 1;
    v_batch := public.reconcile_phase_54_5_assignment_batch(100);
    exit when coalesce((v_batch ->> 'processed')::integer, 0) = 0;
    if v_iteration >= 20 then
      raise exception 'PHASE_54_5_BATCH_LIMIT_REACHED';
    end if;
  end loop;
end;
$$;

create temporary table phase_54_5_activation on commit drop as
select candidate.*
from phase_54_5_safe_shows candidate
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
        and table_row.capacity_configured
        and table_row.capacity is not null
        and table_row.status::text = 'booked'
    ), 0) < booking.guest_count
)
and (
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
) = 74;

insert into public.physical_seating_reconciliation_queue (
  show_id, layout_version_id, reason, evidence_snapshot, status,
  detected_at, resolved_at, resolution_notes
)
select
  analysis.show_id,
  analysis.layout_version_id,
  'PHASE_54_5_BACKLOG_RECONCILIATION',
  analysis.before_evidence || jsonb_build_object(
    'decision', case when activation.show_id is not null
      then 'ACTIVATED' else 'MANUAL_REVIEW_RETAINED' end,
    'showStatus', analysis.show_status,
    'occupancyGuests', analysis.occupancy_guests,
    'occupancyPercent', analysis.occupancy_percent,
    'thresholdPercent', analysis.threshold_percent,
    'structuralBlockers', analysis.structural_blockers,
    'capacityBlockers', analysis.capacity_blockers,
    'zoneCapacityBlockers', analysis.zone_capacity_blockers,
    'blocker', case
      when activation.show_id is not null then null
      when analysis.show_status <> 'active' then 'SHOW_NOT_ACTIVE'
      when analysis.occupancy_percent >= analysis.threshold_percent
        then 'AUTOMATIC_ASSIGNMENT_THRESHOLD_REACHED'
      when analysis.structural_blockers > 0
        then 'STRUCTURAL_TABLE_CONFLICT'
      when analysis.capacity_blockers > 0
        then 'ASSIGNED_OR_CUSTOM_CAPACITY_CONFLICT'
      when analysis.zone_capacity_blockers > 0
        then 'APPROVED_ZONE_CAPACITY_EXCEEDED'
      else 'UNRESOLVED_BOOKINGS_REQUIRE_MANUAL_REVIEW'
    end,
    'evaluatedAt', now()
  ),
  case when activation.show_id is not null then 'resolved' else 'pending' end,
  now(),
  case when activation.show_id is not null then now() else null end,
  case when activation.show_id is not null
    then 'Phase 54.5 reconciled all active booking table coverage and enabled automatic assignment.'
    else null
  end
from phase_54_5_analysis analysis
left join phase_54_5_activation activation
  on activation.show_id = analysis.show_id
on conflict (show_id, layout_version_id, reason) do update set
  evidence_snapshot = excluded.evidence_snapshot,
  status = excluded.status,
  resolved_at = excluded.resolved_at,
  resolved_by_staff_id = null,
  resolution_notes = excluded.resolution_notes;

update public.physical_seating_reconciliation_queue queue set
  status = 'resolved',
  resolved_at = now(),
  resolved_by_staff_id = null,
  resolution_notes =
    'Resolved by Phase 54.5 after authoritative booking coverage reconciliation.'
from phase_54_5_activation activation
where queue.show_id = activation.show_id
  and queue.layout_version_id = activation.layout_version_id
  and queue.status = 'pending';

do $$
begin
  if exists (
    select 1
    from phase_54_5_activation activation
    where not coalesce((
      public.validate_show_physical_layout_eligibility(activation.show_id)
        ->> 'eligible'
    )::boolean, false)
  ) then
    raise exception 'PHASE_54_5_ACTIVATION_ELIGIBILITY_FAILED';
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
    'Phase 54.5 existing seating reconciled below the approved threshold.',
  updated_at = now()
from phase_54_5_activation activation
where adoption.show_id = activation.show_id;

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_location, entity_reference, entity_type,
  outcome, reason, source_area
)
select
  'show.physical-layout-backlog-reconciled',
  'SYSTEM',
  array[candidate.venue_key],
  public.get_show_physical_reconciliation_evidence(candidate.show_id)
    || jsonb_build_object(
      'automaticAssignmentActivated', activation.show_id is not null,
      'occupancyGuests', candidate.occupancy_guests,
      'occupancyPercent', candidate.occupancy_percent,
      'thresholdPercent', candidate.threshold_percent,
      'phase', '54.5'
    ),
  candidate.before_evidence,
  array['physical_table_layout', 'permanent_table_capacities',
    'existing_booking_assignments', 'automatic_assignment_enabled'],
  candidate.show_id::text, candidate.venue, candidate.show_id::text, 'show',
  'success',
  case when activation.show_id is not null
    then 'Existing seating fully reconciled; future automatic assignment enabled.'
    else 'Safe backlog assignments applied; unresolved evidence remains manual.'
  end,
  'Phase 54.5 Seating Reconciliation'
from phase_54_5_safe_shows candidate
left join phase_54_5_activation activation
  on activation.show_id = candidate.show_id;

do $$
begin
  if exists (
    select 1
    from phase_54_5_analysis analysis
    join public.shows show_row on show_row.id = analysis.show_id
    where show_row.status::text is distinct from analysis.show_status
  ) then
    raise exception 'PHASE_54_5_SHOW_STATUS_CHANGED';
  end if;

  if exists (
    select 1
    from public.show_tables table_row
    join public.automatic_table_assignment_attempts attempt
      on attempt.target_table_ids @> array[table_row.id]
     and attempt.reason_code = 'BACKLOG_BEST_FIT_ASSIGNED'
    where table_row.booking_id is distinct from attempt.booking_id
      or table_row.status::text <> 'booked'
  ) then
    raise exception 'PHASE_54_5_TABLE_ASSIGNMENT_INTEGRITY_FAILED';
  end if;

  if exists (
    select 1
    from phase_54_5_preserved_claims preserved
    join public.show_tables current_row on current_row.id = preserved.id
    where row(
      current_row.booking_id,
      current_row.status,
      current_row.capacity,
      current_row.capacity_configured,
      current_row.section,
      current_row.merged_parent_id,
      current_row.merged_from,
      current_row.is_override
    ) is distinct from row(
      preserved.booking_id,
      preserved.status,
      preserved.capacity,
      preserved.capacity_configured,
      preserved.section,
      preserved.merged_parent_id,
      preserved.merged_from,
      preserved.is_override
    )
  ) then
    raise exception 'PHASE_54_5_EXISTING_TABLE_CLAIM_CHANGED';
  end if;

  if exists (
    select 1
    from phase_54_5_preserved_bookings preserved
    join public.bookings current_row on current_row.id = preserved.id
    where row(
      current_row.table_id,
      current_row.guest_count,
      current_row.section,
      current_row.booking_status,
      current_row.total_amount,
      current_row.amount_paid,
      current_row.balance_outstanding
    ) is distinct from row(
      preserved.table_id,
      preserved.guest_count,
      preserved.section,
      preserved.booking_status,
      preserved.total_amount,
      preserved.amount_paid,
      preserved.balance_outstanding
    )
  ) then
    raise exception 'PHASE_54_5_EXISTING_BOOKING_ASSIGNMENT_CHANGED';
  end if;
end;
$$;

comment on function public.reconcile_phase_54_5_assignment_batch(integer) is
  'Service-only bounded Phase 54.5 reconciliation for conflict-free existing Standard and Corporate bookings below the approved pause threshold.';

create or replace function public.try_automatic_table_assignment_phase_54_5(
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
  v_candidate public.show_tables%rowtype;
  v_candidate_capacity integer := 0;
  v_candidate_ids uuid[] := '{}';
  v_candidate_minimum integer := 0;
  v_kind text := 'standard';
  v_zone text;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null
     or v_booking.table_id is not null
     or v_booking.archived_at is not null
     or v_booking.booking_status::text not in (
       'new', 'pending_payment', 'confirmed', 'checked_in'
     ) then
    return public.try_automatic_table_assignment(p_booking_id);
  end if;

  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = v_booking.show_id;
  if v_adoption.show_id is null
     or v_adoption.adoption_status <> 'adopted'
     or not v_adoption.automatic_assignment_enabled
     or v_adoption.assignment_state <> 'enabled' then
    return public.try_automatic_table_assignment(p_booking_id);
  end if;

  if exists (
    select 1 from public.corporate_buyouts buyout
    where buyout.booking_id = v_booking.id
  ) or (
    v_booking.zone_entitlements is not null
    and jsonb_array_length(v_booking.zone_entitlements) > 1
  ) then
    return public.try_automatic_table_assignment(p_booking_id);
  end if;

  v_kind := case when v_booking.booking_source = 'corporate-direct'
    then 'corporate' else 'standard' end;
  v_zone := public.normalize_booking_capacity_zone(v_booking.section);
  if v_zone is null then
    return public.try_automatic_table_assignment(p_booking_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'automatic-table-assignment:' || v_booking.show_id::text,
    0
  ));

  while v_candidate_capacity < v_booking.guest_count loop
    select table_row.* into v_candidate
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = v_booking.show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and coalesce(cardinality(table_row.merged_from), 0) = 0
     and public.normalize_booking_capacity_zone(table_row.section) =
       approved.zone_id
     and table_row.capacity_configured
     and table_row.capacity = approved.maximum_guests
     and table_row.merged_parent_id is null
     and table_row.booking_id is null
     and table_row.status::text = 'available'
    where approved.layout_version_id = v_adoption.layout_version_id
      and approved.zone_id = v_zone
      and not (table_row.id = any(v_candidate_ids))
    order by
      case when approved.maximum_guests >=
        v_booking.guest_count - v_candidate_capacity then 0 else 1 end,
      case when approved.maximum_guests >=
        v_booking.guest_count - v_candidate_capacity
        then approved.maximum_guests end asc,
      case when approved.maximum_guests <
        v_booking.guest_count - v_candidate_capacity
        then approved.maximum_guests end desc,
      approved.sort_order asc
    limit 1
    for update of table_row skip locked;

    exit when v_candidate.id is null;
    v_candidate_ids := array_append(v_candidate_ids, v_candidate.id);
    v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;
    v_candidate_minimum := v_candidate_minimum
      + coalesce(
        public.resolve_approved_table_minimum_occupancy(v_candidate.id),
        v_candidate.capacity
      );
  end loop;

  if v_candidate_capacity >= v_booking.guest_count
     and v_candidate_minimum > v_booking.guest_count then
    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome,
      reason_code, reason_detail
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference, v_kind,
      'manual_queue', 'MINIMUM_OCCUPANCY_REVIEW_REQUIRED',
      'The best-fit approved table set exceeds its minimum occupancy range; manual assignment is required.'
    ) on conflict (booking_id) do nothing;
    return jsonb_build_object(
      'outcome', 'manual_queue',
      'reason', 'MINIMUM_OCCUPANCY_REVIEW_REQUIRED'
    );
  end if;

  return public.try_automatic_table_assignment(p_booking_id);
end;
$$;

revoke all on function public.try_automatic_table_assignment_phase_54_5(uuid)
  from public, anon, authenticated;
grant execute on function public.try_automatic_table_assignment_phase_54_5(uuid)
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
      and show_row.status::text = 'active'
  ) then
    return null;
  end if;

  perform public.try_automatic_table_assignment_phase_54_5(new.id);
  return null;
exception when others then
  return null;
end;
$$;

comment on function public.resolve_booking_table_assignment_compatibility(uuid, integer) is
  'Validates table claims against the legacy physical catalogue or an exact approved Phase 54 master-table identity; all other rows remain fail-closed.';

comment on function public.try_automatic_table_assignment_phase_54_5(uuid) is
  'Guards Phase 54 automatic assignment against physical-table minimum occupancy before invoking the existing atomic best-fit assignment engine.';
