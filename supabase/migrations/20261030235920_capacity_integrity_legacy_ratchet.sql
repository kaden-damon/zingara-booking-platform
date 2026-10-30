-- Preserve proven historical seating commitments without allowing legacy
-- adjustment evidence to create reusable capacity. Only valid temporary tables
-- may add new operational seats above the permanent master.

begin;

create or replace function public.booking_capacity_zone_state(
  p_show_id uuid,
  p_zone text,
  p_excluded_table_id uuid default null
)
returns table (
  base_capacity integer,
  temporary_capacity integer,
  effective_operational_capacity integer,
  active_entitlement_pax integer,
  represented_physical_capacity integer,
  reserved_table_capacity integer,
  assignable_table_capacity integer,
  capacity_required_count integer,
  base_sellable_remaining integer,
  operational_remaining integer,
  representation_headroom integer
)
language sql
stable
security definer
set search_path = public
as $$
  with context as (
    select
      public.normalize_booking_capacity_zone(p_zone) as zone,
      public.booking_capacity_zone_limit(
        public.normalize_booking_capacity_zone(p_zone)
      ) as base_capacity
  ), exception_snapshot as (
    select
      capacity_exception.activation_timestamp,
      capacity_exception.excess_guests
    from context capacity_context
    left join lateral (
      select exception_row.activation_timestamp, exception_row.excess_guests
      from public.phase55_show_zone_capacity_exceptions exception_row
      where exception_row.show_id = p_show_id
        and exception_row.zone_id = capacity_context.zone
      order by exception_row.activation_timestamp desc
      limit 1
    ) capacity_exception on true
  ), table_rows as (
    select
      st.*,
      case
        when st.is_physical
          and st.merged_parent_id is null
          and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
          and st.status::text <> 'disabled'
          and st.capacity_configured
          and coalesce(st.capacity, 0) > 0
          then 'physical'
        when not st.is_physical
          and st.is_override
          and st.availability_scope::text = 'operational'
          and st.merged_parent_id is null
          and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
          and st.status::text <> 'disabled'
          and st.capacity_configured
          and coalesce(st.capacity, 0) > 0
          then 'temporary'
        when not st.is_physical
          and st.is_override
          and st.availability_scope::text = 'operational'
          and st.merged_parent_id is null
          and cardinality(coalesce(st.merged_from, '{}'::uuid[])) >= 2
          and st.status::text <> 'disabled'
          and st.capacity_configured
          and coalesce(st.capacity, 0) > 0
          and (
            select count(*)
            from public.show_tables child
            where child.id = any(st.merged_from)
              and child.show_id = st.show_id
              and child.is_physical
              and child.capacity_configured
              and child.status::text = 'disabled'
              and child.booking_id is null
              and child.merged_parent_id = st.id
              and public.normalize_booking_capacity_zone(child.section) =
                  public.normalize_booking_capacity_zone(st.section)
          ) = cardinality(st.merged_from)
          and (
            select coalesce(sum(child.capacity), 0)
            from public.show_tables child
            where child.id = any(st.merged_from)
          ) = st.capacity
          then 'merged'
        else 'excluded'
      end as representation_kind
    from public.show_tables st
    cross join context capacity_context
    where st.show_id = p_show_id
      and public.normalize_booking_capacity_zone(st.section) = capacity_context.zone
      and (p_excluded_table_id is null or st.id <> p_excluded_table_id)
  ), table_totals as (
    select
      coalesce(sum(capacity) filter (
        where representation_kind = 'temporary'
      ), 0)::integer as temporary_table_capacity,
      coalesce(sum(capacity) filter (
        where representation_kind in ('physical', 'merged')
      ), 0)::integer as represented_physical_capacity,
      coalesce(sum(capacity) filter (
        where representation_kind in ('physical', 'merged', 'temporary')
          and (booking_id is not null or status::text = 'booked')
      ), 0)::integer as reserved_table_capacity,
      coalesce(sum(capacity) filter (
        where representation_kind in ('physical', 'merged', 'temporary')
          and booking_id is null
          and status::text = 'available'
      ), 0)::integer as assignable_table_capacity,
      count(*) filter (
        where is_physical
          and not capacity_configured
          and merged_parent_id is null
      )::integer as capacity_required_count
    from table_rows
  ), pre_activation_temporary as (
    select coalesce(sum(st.capacity), 0)::integer as seats
    from public.show_tables st
    cross join context capacity_context
    cross join exception_snapshot exception_context
    where exception_context.activation_timestamp is not null
      and st.show_id = p_show_id
      and public.normalize_booking_capacity_zone(st.section) = capacity_context.zone
      and st.created_at <= exception_context.activation_timestamp
      and not st.is_physical
      and st.is_override
      and st.availability_scope::text = 'operational'
      and st.merged_parent_id is null
      and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
      and st.status::text <> 'disabled'
      and st.capacity_configured
      and coalesce(st.capacity, 0) > 0
  ), approved_adjustments as (
    select
      coalesce(sum(adjustment.seats), 0)::integer as seats,
      coalesce(sum(adjustment.seats) filter (
        where exception_context.activation_timestamp is not null
          and adjustment.created_at <= exception_context.activation_timestamp
      ), 0)::integer as pre_activation_seats
    from context capacity_context
    cross join exception_snapshot exception_context
    left join public.show_zone_operational_capacity_adjustments adjustment
      on adjustment.show_id = p_show_id
     and adjustment.zone_id = capacity_context.zone
  ), grandfathered_capacity as (
    select greatest(
      coalesce(exception_context.excess_guests, 0) -
        pre_activation_temporary.seats -
        approved_adjustments.pre_activation_seats,
      0
    )::integer as seats
    from exception_snapshot exception_context
    cross join pre_activation_temporary
    cross join approved_adjustments
  ), booking_totals as (
    select coalesce(sum(public.booking_zone_entitlement_pax(
      booking.zone_entitlements,
      booking.section,
      booking.guest_count,
      capacity_context.zone
    )), 0)::integer as active_entitlement_pax
    from public.bookings booking
    cross join context capacity_context
    where booking.show_id = p_show_id
      and booking.archived_at is null
      and booking.booking_status::text in (
        'new', 'confirmed', 'pending_payment', 'checked_in'
      )
  ), legacy_evidence as (
    select (
      approved_adjustments.seats + grandfathered_capacity.seats
    )::integer as seats
    from approved_adjustments
    cross join grandfathered_capacity
  ), totals as (
    select
      table_totals.*,
      least(
        legacy_evidence.seats,
        greatest(
          booking_totals.active_entitlement_pax -
            capacity_context.base_capacity -
            table_totals.temporary_table_capacity,
          0
        )
      )::integer as protected_legacy_capacity
    from table_totals
    cross join legacy_evidence
    cross join booking_totals
    cross join context capacity_context
  )
  select
    capacity_context.base_capacity,
    totals.temporary_table_capacity,
    capacity_context.base_capacity +
      totals.temporary_table_capacity +
      totals.protected_legacy_capacity,
    booking_totals.active_entitlement_pax,
    totals.represented_physical_capacity,
    totals.reserved_table_capacity,
    totals.assignable_table_capacity,
    totals.capacity_required_count,
    greatest(
      capacity_context.base_capacity - booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity +
        totals.temporary_table_capacity +
        totals.protected_legacy_capacity -
        booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity +
        totals.temporary_table_capacity +
        totals.protected_legacy_capacity -
        totals.represented_physical_capacity,
      0
    )
  from context capacity_context
  cross join totals
  cross join booking_totals
  where capacity_context.base_capacity is not null
$$;

revoke all on function public.booking_capacity_zone_state(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.booking_capacity_zone_state(uuid, text, uuid)
  to service_role;

comment on function public.booking_capacity_zone_state(uuid, text, uuid) is
  'Authoritative show/zone capacity snapshot. Only valid show-specific temporary tables add reusable operational capacity; legacy evidence protects current historical commitments with zero reusable headroom.';

create or replace function public.booking_capacity_zone_states(
  p_show_ids uuid[]
)
returns table (
  show_id uuid,
  zone_id text,
  base_capacity integer,
  temporary_capacity integer,
  effective_operational_capacity integer,
  active_entitlement_pax integer,
  represented_physical_capacity integer,
  reserved_table_capacity integer,
  assignable_table_capacity integer,
  capacity_required_count integer,
  base_sellable_remaining integer,
  operational_remaining integer,
  representation_headroom integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    requested.show_id,
    requested.zone_id,
    state.base_capacity,
    state.temporary_capacity,
    state.effective_operational_capacity,
    state.active_entitlement_pax,
    state.represented_physical_capacity,
    state.reserved_table_capacity,
    state.assignable_table_capacity,
    state.capacity_required_count,
    state.base_sellable_remaining,
    state.operational_remaining,
    state.representation_headroom
  from (
    select distinct show_id, zone_id
    from unnest(coalesce(p_show_ids, '{}'::uuid[])) show_id
    cross join unnest(array[
      'golden-circle'::text,
      'middle-ring',
      'royal-booths',
      'royal-balcony'
    ]) zone_id
  ) requested
  cross join lateral public.booking_capacity_zone_state(
    requested.show_id,
    requested.zone_id
  ) state
$$;

revoke all on function public.booking_capacity_zone_states(uuid[])
  from public, anon, authenticated;
grant execute on function public.booking_capacity_zone_states(uuid[])
  to service_role;

create or replace function public.enforce_full_show_buyout_combined_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_guests integer;
  v_total_capacity integer;
begin
  if new.archived_at is not null
     or new.booking_status::text not in (
       'new', 'confirmed', 'pending_payment', 'checked_in'
     )
     or lower(trim(coalesce(new.section, ''))) <> 'full show buyout'
     or new.zone_entitlements is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.show_id is not distinct from new.show_id
     and old.section is not distinct from new.section
     and old.zone_entitlements is not distinct from new.zone_entitlements
     and old.guest_count is not distinct from new.guest_count
     and old.booking_status is not distinct from new.booking_status
     and old.archived_at is not distinct from new.archived_at then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.show_id::text || ':full-show-capacity', 0)
  );

  select coalesce(sum(state.effective_operational_capacity), 0)::integer
    into v_total_capacity
  from unnest(array[
    'golden-circle'::text,
    'middle-ring',
    'royal-booths',
    'royal-balcony'
  ]) zone_id
  cross join lateral public.booking_capacity_zone_state(
    new.show_id,
    zone_id
  ) state;

  select coalesce(sum(booking.guest_count), 0)::integer
    into v_existing_guests
  from public.bookings booking
  where booking.show_id = new.show_id
    and booking.archived_at is null
    and booking.booking_status::text in (
      'new', 'confirmed', 'pending_payment', 'checked_in'
    )
    and (tg_op = 'INSERT' or booking.id <> new.id);

  if v_existing_guests + new.guest_count > v_total_capacity then
    raise exception using
      errcode = '23514',
      message = format(
        'BUYOUT_COMBINED_CAPACITY_EXCEEDED|%s|%s',
        v_total_capacity,
        v_existing_guests + new.guest_count
      );
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_full_show_buyout_capacity_guard
  on public.bookings;
create trigger bookings_full_show_buyout_capacity_guard
before insert or update of
  show_id, section, zone_entitlements, guest_count, booking_status, archived_at
on public.bookings
for each row execute function public.enforce_full_show_buyout_combined_capacity();

do $$
begin
  if exists (
    select 1
    from public.corporate_buyouts buyout
    join public.bookings booking on booking.id = buyout.booking_id
    where buyout.state::text in (
      'provisional', 'awaiting_payment', 'fully_paid', 'confirmed'
    )
      and booking.archived_at is null
      and booking.booking_status::text in (
        'new', 'confirmed', 'pending_payment', 'checked_in'
      )
      and (
        select coalesce(sum(other_booking.guest_count), 0)
        from public.bookings other_booking
        where other_booking.show_id = booking.show_id
          and other_booking.archived_at is null
          and other_booking.booking_status::text in (
            'new', 'confirmed', 'pending_payment', 'checked_in'
          )
      ) > (
        select coalesce(sum(state.effective_operational_capacity), 0)
        from unnest(array[
          'golden-circle'::text,
          'middle-ring',
          'royal-booths',
          'royal-balcony'
        ]) zone_id
        cross join lateral public.booking_capacity_zone_state(
          booking.show_id,
          zone_id
        ) state
      )
  ) then
    raise exception 'ACTIVE_BUYOUT_COMBINED_CAPACITY_REQUIRES_REVIEW';
  end if;
end;
$$;

commit;
