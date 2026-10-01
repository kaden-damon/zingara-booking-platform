-- Enforce operational table occupancy ranges at the final database boundary.
-- Booking entitlement remains independent: incompatible claims are rejected or,
-- during an authorised pax reduction, released back to Floor Assignment.

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
      'reason', case when v_booking.table_id is null then 'unassigned' else 'stale-booking-pointer' end
    );
  end if;

  if v_booking.table_id is null or not exists (
    select 1 from public.show_tables
     where id = v_booking.table_id
       and booking_id = v_booking.id
       and merged_parent_id is null
  ) then
    return jsonb_build_object('compatible', false, 'reason', 'stale-booking-pointer');
  end if;

  for v_set in
    select
      public.normalize_booking_capacity_zone(st.section) as zone_id,
      sum(st.capacity)::integer as maximum_occupancy,
      sum(
        case
          when st.is_physical then coalesce(vt.minimum_capacity, st.capacity)
          when cardinality(coalesce(st.merged_from, '{}'::uuid[])) >= 2 then coalesce((
            select sum(coalesce(child_vt.minimum_capacity, child.capacity))
              from public.show_tables child
              left join public.venue_tables child_vt on child_vt.id = child.venue_table_id
             where child.id = any(st.merged_from)
          ), st.capacity)
          else 1
        end
      )::integer as minimum_occupancy,
      bool_and(st.show_id = v_booking.show_id) as correct_show,
      bool_and(st.capacity_configured and st.capacity is not null and st.capacity > 0) as capacity_valid,
      bool_and(st.status::text = 'booked' and st.booking_id = v_booking.id) as ownership_valid,
      bool_and(
        case
          when st.is_physical then
            cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
            and vt.id is not null
            and vt.is_physical
          when cardinality(coalesce(st.merged_from, '{}'::uuid[])) >= 2 then
            st.is_override
            and st.availability_scope::text = 'operational'
            and st.merged_parent_id is null
            and (
              select count(*)
                from public.show_tables child
               where child.id = any(st.merged_from)
                 and child.show_id = st.show_id
                 and public.normalize_booking_capacity_zone(child.section)
                     = public.normalize_booking_capacity_zone(st.section)
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

create or replace function public.booking_table_claims_fit_guest_count(
  p_booking_id uuid,
  p_guest_count integer
)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select coalesce(
    (public.resolve_booking_table_assignment_compatibility(p_booking_id, p_guest_count) ->> 'compatible')::boolean,
    false
  );
$$;

create or replace function public.assert_booking_table_assignment_compatible(
  p_booking_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.resolve_booking_table_assignment_compatibility(p_booking_id, null);

  if coalesce((v_result ->> 'compatible')::boolean, false) then
    return;
  end if;

  if v_result ->> 'reason' = 'occupancy-range' then
    raise exception 'TABLE_OCCUPANCY_OUT_OF_RANGE|%|%|%',
      v_result ->> 'minimum',
      v_result ->> 'maximum',
      coalesce(v_result ->> 'zone', 'unknown');
  end if;

  raise exception 'TABLE_ASSIGNMENT_INTEGRITY_VIOLATION|%|%',
    coalesce(v_result ->> 'reason', 'unknown'),
    coalesce(v_result ->> 'zone', 'unknown');
end;
$$;

create or replace function public.enforce_booking_table_assignment_compatibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'bookings' then
    if tg_op = 'UPDATE'
       and new.guest_count is not distinct from old.guest_count
       and new.show_id is not distinct from old.show_id
       and new.section is not distinct from old.section
       and new.zone_entitlements is not distinct from old.zone_entitlements
       and new.table_id is not distinct from old.table_id then
      return new;
    end if;

    perform public.assert_booking_table_assignment_compatible(new.id);
    return new;
  end if;

  if tg_op <> 'INSERT' and old.booking_id is not null then
    perform public.assert_booking_table_assignment_compatible(old.booking_id);
  end if;
  if tg_op <> 'DELETE' and new.booking_id is not null
     and (tg_op = 'INSERT' or new.booking_id is distinct from old.booking_id) then
    perform public.assert_booking_table_assignment_compatible(new.booking_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_table_assignment_compatibility_guard on public.bookings;
create constraint trigger bookings_table_assignment_compatibility_guard
after insert or update of guest_count, show_id, section, zone_entitlements, table_id
on public.bookings
deferrable initially deferred
for each row execute function public.enforce_booking_table_assignment_compatibility();

drop trigger if exists show_tables_assignment_compatibility_guard on public.show_tables;
create constraint trigger show_tables_assignment_compatibility_guard
after insert or update or delete
on public.show_tables
deferrable initially deferred
for each row execute function public.enforce_booking_table_assignment_compatibility();

-- Existing guest-count workflows already release tables that become too small.
-- Extend that exact atomic fallback to a newly below-minimum assignment without
-- changing any pricing, payment, ticket, or entitlement calculation.
do $migration$
declare
  v_definition text;
  v_name text;
  v_updated integer := 0;
begin
  for v_name in
    select unnest(array[
      'reconcile_booking_guest_count_atomic',
      'reconcile_booking_guest_count_financials_atomic',
      'reconcile_legacy_booking_guest_count_financials_atomic',
      'reconcile_paid_booking_guest_reduction_atomic'
    ])
  loop
    select pg_get_functiondef(p.oid)
      into v_definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = v_name
     limit 1;

    if v_definition is null
       or position('if v_table.capacity < p_guest_count then' in v_definition) = 0 then
      raise exception 'Expected guest-count table-fit guard was not found in %', v_name;
    end if;

    v_definition := replace(
      v_definition,
      'if v_table.capacity < p_guest_count then',
      'if not public.booking_table_claims_fit_guest_count(v_booking.id, p_guest_count) then'
    );
    execute v_definition;
    v_updated := v_updated + 1;
  end loop;

  if v_updated <> 4 then
    raise exception 'Expected four guest-count workflows, updated %', v_updated;
  end if;
end;
$migration$;

revoke all on function public.resolve_booking_table_assignment_compatibility(uuid, integer) from public, anon, authenticated;
revoke all on function public.booking_table_claims_fit_guest_count(uuid, integer) from public, anon, authenticated;
revoke all on function public.assert_booking_table_assignment_compatible(uuid) from public, anon, authenticated;
revoke all on function public.enforce_booking_table_assignment_compatibility() from public, anon, authenticated;

grant execute on function public.resolve_booking_table_assignment_compatibility(uuid, integer) to service_role;
grant execute on function public.booking_table_claims_fit_guest_count(uuid, integer) to service_role;
grant execute on function public.assert_booking_table_assignment_compatible(uuid) to service_role;

comment on function public.resolve_booking_table_assignment_compatibility(uuid, integer) is
  'Resolves authoritative operational-table minimum/maximum, show, zone, ownership, and merge compatibility without changing booking entitlement.';
