-- Phase 41.2I: one authoritative show/zone capacity snapshot for transactional
-- guards and server presentation. Temporary tables expand operational capacity
-- without increasing the base capacity used by public booking entitlement.

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
      ), 0)::integer as temporary_capacity,
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
  )
  select
    capacity_context.base_capacity,
    table_totals.temporary_capacity,
    capacity_context.base_capacity + table_totals.temporary_capacity,
    booking_totals.active_entitlement_pax,
    table_totals.represented_physical_capacity,
    table_totals.reserved_table_capacity,
    table_totals.assignable_table_capacity,
    table_totals.capacity_required_count,
    greatest(
      capacity_context.base_capacity - booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity + table_totals.temporary_capacity -
        booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity + table_totals.temporary_capacity -
        table_totals.represented_physical_capacity,
      0
    )
  from context capacity_context
  cross join table_totals
  cross join booking_totals
  where capacity_context.base_capacity is not null
$$;

revoke all on function public.booking_capacity_zone_state(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.booking_capacity_zone_state(uuid, text, uuid)
  to service_role;

comment on function public.booking_capacity_zone_state(uuid, text, uuid) is
  'Authoritative base, temporary, entitlement, physical representation and assignment capacity snapshot for one show and zone.';

create or replace function public.booking_capacity_zone_temporary_capacity(
  p_show_id uuid,
  p_zone text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select state.temporary_capacity
    from public.booking_capacity_zone_state(p_show_id, p_zone) state
$$;

create or replace function public.booking_capacity_zone_effective_limit(
  p_show_id uuid,
  p_zone text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select state.effective_operational_capacity
    from public.booking_capacity_zone_state(p_show_id, p_zone) state
$$;

revoke all on function public.booking_capacity_zone_temporary_capacity(uuid, text)
  from public, anon, authenticated;
revoke all on function public.booking_capacity_zone_effective_limit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.booking_capacity_zone_temporary_capacity(uuid, text)
  to service_role;
grant execute on function public.booking_capacity_zone_effective_limit(uuid, text)
  to service_role;

comment on function public.booking_capacity_zone_effective_limit(uuid, text) is
  'Effective staff operational zone capacity resolved from the authoritative show/zone capacity snapshot; public sellable inventory remains base-capped.';

create or replace function public.enforce_show_table_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active_entitlement integer := 0;
  v_base_capacity integer := 0;
  v_current_effective_capacity integer := 0;
  v_current_temporary integer := 0;
  v_merge_source_capacity integer := 0;
  v_merge_source_count integer := 0;
  v_new_active boolean := false;
  v_new_physical_representation boolean := false;
  v_new_temporary boolean := false;
  v_new_temporary_capacity integer := 0;
  v_new_zone text;
  v_old_active boolean := false;
  v_old_temporary boolean := false;
  v_old_temporary_capacity integer := 0;
  v_old_zone text;
  v_projected_representation integer := 0;
  v_represented_physical integer := 0;
  v_required_operational_capacity integer := 0;
  v_resulting_effective_capacity integer := 0;
  v_show_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_zone := public.normalize_booking_capacity_zone(old.section);
    v_old_active := old.status::text <> 'disabled';
    v_old_temporary :=
      not old.is_physical
      and old.is_override
      and old.availability_scope::text = 'operational'
      and old.merged_parent_id is null
      and cardinality(coalesce(old.merged_from, '{}'::uuid[])) = 0;
    if v_old_temporary and v_old_active and old.capacity_configured and old.capacity > 0 then
      v_old_temporary_capacity := old.capacity;
    end if;
  end if;

  if tg_op <> 'DELETE' then
    v_new_zone := public.normalize_booking_capacity_zone(new.section);
    v_new_active := new.status::text <> 'disabled';
    v_new_temporary :=
      not new.is_physical
      and new.is_override
      and new.availability_scope::text = 'operational'
      and new.merged_parent_id is null
      and cardinality(coalesce(new.merged_from, '{}'::uuid[])) = 0;
    if v_new_temporary and v_new_active and new.capacity_configured and new.capacity > 0 then
      v_new_temporary_capacity := new.capacity;
    end if;
  end if;

  if v_old_temporary or v_new_temporary then
    if tg_op = 'UPDATE' and v_old_temporary <> v_new_temporary then
      raise exception 'TEMPORARY_TABLE_TYPE_CHANGE_NOT_ALLOWED';
    end if;
    if tg_op = 'UPDATE'
       and (old.show_id <> new.show_id or v_old_zone is distinct from v_new_zone) then
      raise exception 'TEMPORARY_TABLE_SCOPE_CHANGE_NOT_ALLOWED';
    end if;

    v_show_id := case when tg_op = 'DELETE' then old.show_id else new.show_id end;
    v_new_zone := coalesce(v_new_zone, v_old_zone);
    perform pg_advisory_xact_lock(
      hashtextextended(v_show_id::text || ':' || v_new_zone, 0)
    );

    select
      state.temporary_capacity,
      state.effective_operational_capacity,
      state.active_entitlement_pax,
      state.represented_physical_capacity
    into
      v_current_temporary,
      v_current_effective_capacity,
      v_active_entitlement,
      v_represented_physical
    from public.booking_capacity_zone_state(v_show_id, v_new_zone) state;

    if not found then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;

    v_resulting_effective_capacity :=
      v_current_effective_capacity
      - v_old_temporary_capacity
      + v_new_temporary_capacity;
    v_required_operational_capacity := greatest(
      v_active_entitlement,
      v_represented_physical
    );

    if v_required_operational_capacity > v_resulting_effective_capacity
       and v_resulting_effective_capacity <= v_current_effective_capacity then
      raise exception using errcode = '23514', message = format(
        'TEMPORARY_CAPACITY_BELOW_OPERATIONAL_REQUIREMENT|%s|%s|%s',
        v_new_zone,
        v_required_operational_capacity,
        v_resulting_effective_capacity
      );
    end if;

    if tg_op <> 'DELETE' and new.booking_id is not null and exists (
      select 1 from public.bookings booking
       where booking.id = new.booking_id and booking.guest_count > new.capacity
    ) then
      raise exception using errcode = '23514', message =
        'TEMPORARY_TABLE_BELOW_ASSIGNED_BOOKING';
    end if;

    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  if not v_new_active or v_new_zone is null then return new; end if;

  v_new_physical_representation :=
    new.is_physical
    and new.merged_parent_id is null
    and cardinality(coalesce(new.merged_from, '{}'::uuid[])) = 0
    and new.capacity_configured
    and coalesce(new.capacity, 0) > 0;

  if cardinality(coalesce(new.merged_from, '{}'::uuid[])) > 0 then
    select count(*)::integer,
           coalesce(sum(greatest(coalesce(source.capacity, 0), 0)), 0)::integer
      into v_merge_source_count, v_merge_source_capacity
      from public.show_tables source
     where source.id = any(new.merged_from)
       and source.show_id = new.show_id
       and source.status::text = 'disabled'
       and source.is_physical
       and source.capacity_configured
       and source.booking_id is null
       and public.normalize_booking_capacity_zone(source.section) = v_new_zone
       and (
         tg_op = 'INSERT'
         or source.merged_parent_id = new.id
       );

    if tg_op = 'INSERT'
       and not new.is_physical
       and new.is_override
       and new.availability_scope::text = 'operational'
       and cardinality(new.merged_from) >= 2
       and v_merge_source_count = cardinality(new.merged_from)
       and greatest(coalesce(new.capacity, 0), 0) <= v_merge_source_capacity then
      return new;
    end if;

    v_new_physical_representation :=
      not new.is_physical
      and new.is_override
      and new.availability_scope::text = 'operational'
      and new.merged_parent_id is null
      and cardinality(new.merged_from) >= 2
      and new.capacity_configured
      and coalesce(new.capacity, 0) > 0
      and v_merge_source_count = cardinality(new.merged_from)
      and new.capacity = v_merge_source_capacity;
  end if;

  if not v_new_physical_representation then return new; end if;

  if tg_op = 'UPDATE'
     and v_old_active
     and old.show_id = new.show_id
     and v_old_zone = v_new_zone
     and greatest(coalesce(new.capacity, 0), 0) <=
         greatest(coalesce(old.capacity, 0), 0) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.show_id::text || ':tables:' || v_new_zone, 0)
  );

  select
    state.base_capacity,
    state.effective_operational_capacity,
    state.represented_physical_capacity
  into
    v_base_capacity,
    v_current_effective_capacity,
    v_represented_physical
  from public.booking_capacity_zone_state(new.show_id, v_new_zone, new.id) state;

  if not found then return new; end if;

  v_projected_representation :=
    v_represented_physical + greatest(coalesce(new.capacity, 0), 0);

  if v_projected_representation > v_current_effective_capacity then
    raise exception using errcode = '23514', message = format(
      'TABLE_ZONE_CAPACITY_EXCEEDED|%s|%s|%s|%s|%s',
      v_new_zone,
      v_base_capacity,
      v_current_effective_capacity,
      v_represented_physical,
      v_projected_representation
    );
  end if;
  return new;
end;
$$;

drop trigger if exists show_tables_zone_capacity_guard on public.show_tables;
create trigger show_tables_zone_capacity_guard
before insert or update of
  show_id, section, capacity, capacity_configured, status,
  booking_id, is_physical, is_override, availability_scope,
  merged_from, merged_parent_id
or delete on public.show_tables
for each row execute function public.enforce_show_table_zone_capacity();
