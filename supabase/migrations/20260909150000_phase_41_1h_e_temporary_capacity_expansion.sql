-- Phase 41.1H-E: active flat temporary operational tables add show/zone
-- capacity for staff operations. Public online inserts remain capped at the
-- configured base capacity. Physical and merged representations add nothing.

create or replace function public.booking_capacity_zone_temporary_capacity(
  p_show_id uuid,
  p_zone text
)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(st.capacity), 0)::integer
    from public.show_tables st
   where st.show_id = p_show_id
     and public.normalize_booking_capacity_zone(st.section) =
       public.normalize_booking_capacity_zone(p_zone)
     and not st.is_physical
     and st.is_override
     and st.availability_scope::text = 'operational'
     and st.merged_parent_id is null
     and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
     and st.status::text <> 'disabled'
     and st.capacity_configured
     and st.capacity > 0
$$;

create or replace function public.booking_capacity_zone_effective_limit(
  p_show_id uuid,
  p_zone text
)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when public.booking_capacity_zone_limit(
      public.normalize_booking_capacity_zone(p_zone)
    ) is null then null
    else public.booking_capacity_zone_limit(
      public.normalize_booking_capacity_zone(p_zone)
    ) + public.booking_capacity_zone_temporary_capacity(p_show_id, p_zone)
  end
$$;

create or replace function public.enforce_booking_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_entitlement integer;
  v_import_exception boolean := false;
  v_import_update_exception boolean := false;
  v_limit integer;
  v_new_contribution integer;
  v_zone text;
begin
  if new.archived_at is not null
     or new.booking_status::text not in ('new', 'confirmed', 'pending_payment', 'checked_in') then
    return new;
  end if;

  v_import_exception :=
    tg_op = 'INSERT'
    and current_setting('zingara.historical_dineplan_import', true) = 'active'
    and new.booking_origin = 'data_import'
    and new.booking_source = 'admin'
    and new.table_id is null
    and new.notes like '__zingara_booking_meta__:%';
  v_import_update_exception :=
    tg_op = 'UPDATE'
    and current_setting('zingara.historical_dineplan_update', true) = 'active'
    and current_setting('zingara.historical_dineplan_update_booking_id', true) = new.id::text
    and old.id = new.id
    and old.booking_reference = new.booking_reference
    and old.booking_origin = 'data_import'
    and new.booking_origin = old.booking_origin
    and old.booking_source in ('admin', 'corporate-direct')
    and new.booking_source = old.booking_source
    and old.created_by_staff_id is not distinct from new.created_by_staff_id
    and old.provenance_recorded_at is not distinct from new.provenance_recorded_at
    and old.booking_status = new.booking_status
    and old.archived_at is not distinct from new.archived_at
    and new.notes like '__zingara_booking_meta__:%';
  if v_import_exception or v_import_update_exception then return new; end if;

  if not public.corporate_zone_entitlements_valid(new.zone_entitlements, new.guest_count) then
    raise exception using errcode = '23514', message = 'CORPORATE_ZONE_ENTITLEMENTS_INVALID';
  end if;

  for v_zone in
    select distinct public.normalize_booking_capacity_zone(zone_name)
    from (
      select item ->> 'zoneId' as zone_name
      from jsonb_array_elements(coalesce(new.zone_entitlements, '[]'::jsonb)) item
      union all
      select new.section where new.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_name) is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(new.show_id::text || ':' || v_zone, 0)
    );

    -- New public-online inventory remains limited to the configured sellable
    -- base. Existing bookings moved by authorised staff use operational scope.
    if tg_op = 'INSERT'
       and new.booking_origin = 'customer_public'
       and new.booking_source = 'online' then
      v_limit := public.booking_capacity_zone_limit(v_zone);
    else
      v_limit := public.booking_capacity_zone_effective_limit(new.show_id, v_zone);
    end if;
    if v_limit is null then continue; end if;

    v_new_contribution := public.booking_zone_entitlement_pax(
      new.zone_entitlements, new.section, new.guest_count, v_zone
    );
    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_zone
    )), 0)::integer
      into v_existing_entitlement
      from public.bookings b
     where b.show_id = new.show_id
       and b.archived_at is null
       and b.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
       and (tg_op = 'INSERT' or b.id <> new.id);
    if v_existing_entitlement + v_new_contribution > v_limit then
      raise exception using errcode = '23514', message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_zone, v_limit, v_existing_entitlement + v_new_contribution
      );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.enforce_show_table_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active_capacity integer := 0;
  v_active_entitlement integer := 0;
  v_base_limit integer;
  v_current_temporary integer := 0;
  v_merge_source_capacity integer := 0;
  v_merge_source_count integer := 0;
  v_new_active boolean := false;
  v_new_temporary boolean := false;
  v_new_temporary_capacity integer := 0;
  v_new_zone text;
  v_old_active boolean := false;
  v_old_temporary boolean := false;
  v_old_temporary_capacity integer := 0;
  v_old_zone text;
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
    if tg_op = 'UPDATE'
       and (old.show_id <> new.show_id or v_old_zone is distinct from v_new_zone) then
      raise exception 'TEMPORARY_TABLE_SCOPE_CHANGE_NOT_ALLOWED';
    end if;

    v_show_id := case when tg_op = 'DELETE' then old.show_id else new.show_id end;
    v_new_zone := coalesce(v_new_zone, v_old_zone);
    perform pg_advisory_xact_lock(
      hashtextextended(v_show_id::text || ':' || v_new_zone, 0)
    );

    v_base_limit := public.booking_capacity_zone_limit(v_new_zone);
    if v_base_limit is null then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;

    v_current_temporary := public.booking_capacity_zone_temporary_capacity(
      v_show_id, v_new_zone
    );
    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_new_zone
    )), 0)::integer
      into v_active_entitlement
      from public.bookings b
     where b.show_id = v_show_id
       and b.archived_at is null
       and b.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

    if v_active_entitlement >
       v_base_limit + v_current_temporary - v_old_temporary_capacity + v_new_temporary_capacity then
      raise exception using errcode = '23514', message =
        'TEMPORARY_CAPACITY_BELOW_ACTIVE_ENTITLEMENT';
    end if;

    if tg_op <> 'DELETE' and new.booking_id is not null and exists (
      select 1 from public.bookings b
       where b.id = new.booking_id and b.guest_count > new.capacity
    ) then
      raise exception using errcode = '23514', message =
        'TEMPORARY_TABLE_BELOW_ASSIGNED_BOOKING';
    end if;

    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then return old; end if;

  -- Preserve the existing fixed-base safeguard for normal physical inventory.
  v_base_limit := public.booking_capacity_zone_limit(v_new_zone);
  if not v_new_active or v_base_limit is null then return new; end if;

  if tg_op = 'UPDATE'
     and v_old_active
     and old.show_id = new.show_id
     and v_old_zone = v_new_zone
     and greatest(coalesce(new.capacity, 0), 0) <= greatest(coalesce(old.capacity, 0), 0) then
    return new;
  elsif tg_op = 'INSERT' and cardinality(coalesce(new.merged_from, '{}'::uuid[])) > 0 then
    select count(*)::integer,
           coalesce(sum(greatest(coalesce(st.capacity, 0), 0)), 0)::integer
      into v_merge_source_count, v_merge_source_capacity
      from public.show_tables st
     where st.id = any(new.merged_from)
       and st.show_id = new.show_id
       and st.status::text = 'disabled'
       and public.normalize_booking_capacity_zone(st.section) = v_new_zone;
    if v_merge_source_count = cardinality(new.merged_from)
       and greatest(coalesce(new.capacity, 0), 0) <= v_merge_source_capacity then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.show_id::text || ':tables:' || v_new_zone, 0)
  );
  select coalesce(sum(greatest(coalesce(st.capacity, 0), 0)), 0)::integer
    into v_active_capacity
    from public.show_tables st
   where st.show_id = new.show_id
     and st.status::text <> 'disabled'
     and public.normalize_booking_capacity_zone(st.section) = v_new_zone
     and (tg_op = 'INSERT' or st.id <> new.id);
  if v_active_capacity + greatest(coalesce(new.capacity, 0), 0) > v_base_limit then
    raise exception using errcode = '23514', message = format(
      'TABLE_ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
      v_new_zone, v_base_limit,
      v_active_capacity + greatest(coalesce(new.capacity, 0), 0)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists show_tables_zone_capacity_guard on public.show_tables;
create trigger show_tables_zone_capacity_guard
before insert or delete or update of
  show_id, section, capacity, capacity_configured, status,
  is_physical, is_override, availability_scope, merged_from, merged_parent_id
on public.show_tables
for each row execute function public.enforce_show_table_zone_capacity();

revoke all on function public.booking_capacity_zone_temporary_capacity(uuid, text)
  from public, anon, authenticated;
revoke all on function public.booking_capacity_zone_effective_limit(uuid, text)
  from public, anon, authenticated;
grant execute on function public.booking_capacity_zone_temporary_capacity(uuid, text)
  to service_role;
grant execute on function public.booking_capacity_zone_effective_limit(uuid, text)
  to service_role;

comment on function public.booking_capacity_zone_effective_limit(uuid, text) is
  'Returns configured base capacity plus valid active flat temporary operational capacity for one show and zone.';
