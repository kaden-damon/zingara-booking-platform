-- Phase 41.1X: legacy logical public rows are not physical Floor inventory.\n-- Count physical rows and authoritative operational override representations\n-- only, while preserving the configured base-capacity ceiling.\n
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

  -- Count temporary inventory on both sides so it cancels out and physical
  -- inventory remains bounded by the configured base capacity.
  v_base_limit := public.booking_capacity_zone_effective_limit(new.show_id, v_new_zone);
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
     and (
       st.is_physical
       or (
         not st.is_physical
         and st.is_override
         and st.availability_scope::text = 'operational'
       )
     )
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
