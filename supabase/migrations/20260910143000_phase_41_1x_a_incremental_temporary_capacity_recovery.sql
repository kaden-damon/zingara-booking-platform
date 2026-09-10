-- Phase 41.1X-A: allow temporary operational capacity to improve an
-- inherited over-capacity state incrementally. Reductions and removals remain
-- blocked whenever their resulting capacity would strand active entitlement.

-- Phase 41.1X: legacy logical public rows are not physical Floor inventory.
-- Count physical rows and authoritative operational override representations
-- only, while preserving the configured base-capacity ceiling.
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
  v_previous_effective_capacity integer := 0;
  v_resulting_effective_capacity integer := 0;
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

    v_previous_effective_capacity := v_base_limit + v_current_temporary;
    v_resulting_effective_capacity :=
      v_previous_effective_capacity
      - v_old_temporary_capacity
      + v_new_temporary_capacity;

    if v_active_entitlement > v_resulting_effective_capacity
       and v_resulting_effective_capacity <= v_previous_effective_capacity then
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

-- Phase 41.1X: a sold-out performance remains operational for Floor work.
-- Keep the reviewed, atomic temporary-capacity architecture unchanged while
-- allowing staff to seat existing entitlement on active or sold-out shows.

create or replace function public.create_temporary_floor_capacity_plan_atomic(
  p_show_id uuid,
  p_zone_id text,
  p_capacities integer[],
  p_expected_booking_state jsonb,
  p_expected_table_state jsonb,
  p_plan_summary jsonb,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_capacity integer;
  v_created jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_expected_count integer;
  v_next_code integer;
  v_row public.show_tables%rowtype;
  v_show public.shows%rowtype;
  v_zone text;
  v_zone_pax integer := 0;
  v_zone_limit integer;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (
       select 1
         from public.role_permissions role_permission
         join public.permissions permission on permission.id = role_permission.permission_id
        where role_permission.role_id = role.id
          and permission.key = 'bookings:manage'
     )
     and exists (
       select 1
         from public.role_permissions role_permission
         join public.permissions permission on permission.id = role_permission.permission_id
        where role_permission.role_id = role.id
          and permission.key = 'tables:manage'
     );

  if v_actor_name is null then
    raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  if coalesce(cardinality(p_capacities), 0) = 0
     or cardinality(p_capacities) > 100
     or exists (
       select 1 from unnest(coalesce(p_capacities, '{}'::integer[])) capacity
       where capacity < 1 or capacity > 12
     ) then
    raise exception 'TEMPORARY_CAPACITY_PLAN_INVALID';
  end if;

  v_zone := public.normalize_booking_capacity_zone(p_zone_id);
  v_zone_limit := public.booking_capacity_zone_limit(v_zone);
  if v_zone is null or v_zone_limit is null then
    raise exception 'SUPPORTED_TARGET_ZONE_REQUIRED';
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null
     or v_show.status::text not in ('active', 'sold_out') then
    raise exception 'OPERATIONAL_SHOW_REQUIRED';
  end if;

  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text || ':' || v_zone, 0));

  v_zone_limit := public.booking_capacity_zone_effective_limit(
    p_show_id, v_zone
  );

  v_expected_count := coalesce(jsonb_array_length(p_expected_booking_state), 0);
  if (select count(*) from public.bookings where show_id = p_show_id and archived_at is null) <> v_expected_count
     or exists (
       select 1
         from public.bookings booking
        where booking.show_id = p_show_id
          and booking.archived_at is null
          and not exists (
            select 1
              from jsonb_array_elements(p_expected_booking_state) expected
             where (expected ->> 'id')::uuid = booking.id
               and coalesce(expected ->> 'booking_status', '') = booking.booking_status::text
               and coalesce((expected ->> 'guest_count')::integer, 0) = booking.guest_count
               and coalesce(expected ->> 'section', '') = coalesce(booking.section, '')
               and nullif(expected ->> 'table_id', '')::uuid is not distinct from booking.table_id
               and (expected ->> 'updated_at')::timestamptz = booking.updated_at
          )
     ) then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  v_expected_count := coalesce(jsonb_array_length(p_expected_table_state), 0);
  if (select count(*) from public.show_tables where show_id = p_show_id) <> v_expected_count
     or exists (
       select 1
         from public.show_tables floor_table
        where floor_table.show_id = p_show_id
          and not exists (
            select 1
              from jsonb_array_elements(p_expected_table_state) expected
             where (expected ->> 'id')::uuid = floor_table.id
               and nullif(expected ->> 'booking_id', '')::uuid is not distinct from floor_table.booking_id
               and coalesce((expected ->> 'capacity')::integer, 0) = coalesce(floor_table.capacity, 0)
               and coalesce((expected ->> 'capacity_configured')::boolean, false) = floor_table.capacity_configured
               and coalesce(expected ->> 'status', '') = floor_table.status::text
               and (expected ->> 'updated_at')::timestamptz = floor_table.updated_at
          )
     ) then
    raise exception 'FLOOR_PLAN_STALE';
  end if;

  select coalesce(sum(public.booking_zone_entitlement_pax(
    booking.zone_entitlements,
    booking.section,
    booking.guest_count,
    v_zone
  )), 0)::integer
    into v_zone_pax
    from public.bookings booking
   where booking.show_id = p_show_id
     and booking.archived_at is null
     and booking.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

  if v_zone_pax >
     v_zone_limit + coalesce((
       select sum(capacity)::integer
       from unnest(p_capacities) capacity
     ), 0) then
    raise exception 'ZONE_CAPACITY_INSUFFICIENT';
  end if;

  select coalesce(max(table_code::integer), 0) + 1
    into v_next_code
    from public.show_tables
   where show_id = p_show_id
     and public.normalize_booking_capacity_zone(section) = v_zone
     and table_code ~ '^[0-9]+$';

  foreach v_capacity in array p_capacities loop
    while exists (
      select 1 from public.show_tables
       where show_id = p_show_id and table_code = v_next_code::text
    ) loop
      v_next_code := v_next_code + 1;
    end loop;

    insert into public.show_tables (
      availability_scope, capacity, capacity_configured, custom_price_per_person,
      is_override, is_physical, merged_from, override_notes, section, show_id,
      status, table_code
    ) values (
      'operational', v_capacity, true, null,
      true, false, '{}'::uuid[],
      'Created from an approved show-wide Floor capacity plan.',
      v_zone, p_show_id, 'available', v_next_code::text
    ) returning * into v_row;

    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'table_code', v_row.table_code,
      'capacity', v_row.capacity,
      'section', v_row.section
    ));
    v_created_count := v_created_count + 1;
    v_next_code := v_next_code + 1;
  end loop;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'show.floor-temporary-plan-created',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('tables', v_created, 'plan', p_plan_summary),
    jsonb_build_object('tables_created', 0),
    array['show_tables'],
    p_show_id::text,
    p_show_id::text || ':' || v_zone,
    'show',
    'success',
    format('Created %s reviewed temporary operational tables for %s.', v_created_count, v_zone),
    'Operations Floor'
  );

  return jsonb_build_object(
    'created_count', v_created_count,
    'show_id', p_show_id,
    'tables', v_created,
    'zone', v_zone
  );
end;
$$;

revoke all on function public.create_temporary_floor_capacity_plan_atomic(
  uuid, text, integer[], jsonb, jsonb, jsonb, uuid, uuid, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.create_temporary_floor_capacity_plan_atomic(
  uuid, text, integer[], jsonb, jsonb, jsonb, uuid, uuid, text, text, text[]
) to service_role;

comment on function public.create_temporary_floor_capacity_plan_atomic(
  uuid, text, integer[], jsonb, jsonb, jsonb, uuid, uuid, text, text, text[]
) is 'Creates one reviewed, show-scoped temporary Floor capacity plan atomically for active or sold-out operational performances.';
