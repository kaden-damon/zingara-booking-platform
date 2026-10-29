-- P0: temporary tables add performance-specific operational seats above the
-- permanent master. Preserve Phase 55 grandfathered commitments without
-- making temporary tables absorb those commitments a second time.

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
  ), totals as (
    select
      table_totals.*,
      table_totals.temporary_table_capacity +
        approved_adjustments.seats +
        grandfathered_capacity.seats as temporary_capacity
    from table_totals
    cross join approved_adjustments
    cross join grandfathered_capacity
  )
  select
    capacity_context.base_capacity,
    totals.temporary_capacity,
    capacity_context.base_capacity + totals.temporary_capacity,
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
      capacity_context.base_capacity + totals.temporary_capacity -
        booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity + totals.temporary_capacity -
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
  'Authoritative show/zone capacity snapshot. Public sellable capacity remains permanent-master capped; operational capacity adds audited temporary tables, approved adjustments and only the uncovered Phase 55 grandfathered baseline.';

commit;
