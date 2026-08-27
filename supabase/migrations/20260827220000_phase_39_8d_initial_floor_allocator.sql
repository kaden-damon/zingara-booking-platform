-- Phase 39.8D: apply one reviewed, show-scoped initial-floor plan atomically.
-- Planning remains read-only; this function is service-role only and rejects
-- stale booking/table snapshots before changing any row.

create or replace function public.apply_initial_floor_plan_atomic(
  p_show_id uuid,
  p_snapshot_token text,
  p_plan jsonb,
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
  v_allocation jsonb;
  v_booking public.bookings%rowtype;
  v_booking_snapshot jsonb;
  v_capacity_change jsonb;
  v_capacity_count integer := 0;
  v_expected_table_id uuid;
  v_map_result jsonb;
  v_merge jsonb;
  v_merge_count integer := 0;
  v_merge_ids jsonb := '{}'::jsonb;
  v_merge_result jsonb;
  v_mapping_count integer := 0;
  v_source_table public.show_tables%rowtype;
  v_table public.show_tables%rowtype;
  v_table_snapshot jsonb;
  v_target_table_id uuid;
begin
  if p_show_id is null
     or nullif(trim(p_snapshot_token), '') is null
     or p_plan is null
     or p_plan ->> 'showId' is distinct from p_show_id::text
     or p_plan ->> 'snapshotToken' is distinct from p_snapshot_token then
    raise exception 'FLOOR_PLAN_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text || ':initial-floor', 0));

  if not exists (
    select 1 from public.shows s
     where s.id = p_show_id and s.status::text = 'active'
  ) then
    raise exception 'FLOOR_PLAN_INVALID';
  end if;

  -- Lock and verify the complete selected-show snapshot. This preserves valid
  -- staff allocations and prevents an Apply racing a newer Floor edit.
  for v_booking_snapshot in
    select value
      from jsonb_array_elements(coalesce(p_plan -> 'snapshot' -> 'bookings', '[]'::jsonb))
     order by value ->> 'id'
  loop
    select * into v_booking
      from public.bookings
     where id = (v_booking_snapshot ->> 'id')::uuid
       and show_id = p_show_id
     for update;

    if v_booking.id is null
       or v_booking.updated_at is distinct from (v_booking_snapshot ->> 'updatedAt')::timestamptz
       or v_booking.table_id is distinct from nullif(v_booking_snapshot ->> 'tableId', '')::uuid
       or v_booking.archived_at is not null
       or v_booking.booking_status::text <> 'confirmed' then
      raise exception 'FLOOR_PLAN_STALE';
    end if;
  end loop;

  for v_table_snapshot in
    select value
      from jsonb_array_elements(coalesce(p_plan -> 'snapshot' -> 'tables', '[]'::jsonb))
     order by value ->> 'id'
  loop
    select * into v_table
      from public.show_tables
     where id = (v_table_snapshot ->> 'id')::uuid
       and show_id = p_show_id
     for update;

    if v_table.id is null
       or v_table.updated_at is distinct from (v_table_snapshot ->> 'updatedAt')::timestamptz
       or v_table.booking_id is distinct from nullif(v_table_snapshot ->> 'bookingId', '')::uuid
       or v_table.capacity is distinct from nullif(v_table_snapshot ->> 'capacity', '')::integer
       or v_table.capacity_configured is distinct from (v_table_snapshot ->> 'capacityConfigured')::boolean
       or v_table.status::text is distinct from v_table_snapshot ->> 'status' then
      raise exception 'FLOOR_PLAN_STALE';
    end if;
  end loop;

  for v_capacity_change in
    select value
      from jsonb_array_elements(coalesce(p_plan -> 'capacityProposals', '[]'::jsonb))
     order by value ->> 'tableId'
  loop
    update public.show_tables st
       set capacity = (v_capacity_change ->> 'capacity')::integer,
           capacity_configured = true,
           status = 'available',
           updated_at = now()
     where st.id = (v_capacity_change ->> 'tableId')::uuid
       and st.show_id = p_show_id
       and st.is_physical
       and not st.capacity_configured
       and st.capacity is null
       and st.status::text = 'disabled'
       and st.booking_id is null
       and st.merged_parent_id is null
       and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
       and exists (
         select 1
           from public.venue_tables vt
          where vt.id = st.venue_table_id
            and vt.is_physical
            and (v_capacity_change ->> 'capacity')::integer
                between vt.minimum_capacity and vt.maximum_capacity
       );

    if not found then
      raise exception 'FLOOR_PLAN_STALE';
    end if;

    v_capacity_count := v_capacity_count + 1;
  end loop;

  for v_merge in
    select value
      from jsonb_array_elements(coalesce(p_plan -> 'merges', '[]'::jsonb))
     order by value ->> 'id'
  loop
    select public.merge_show_tables_atomic(
      p_show_id => p_show_id,
      p_zone_id => v_merge ->> 'zone',
      p_source_table_ids => array(
        select value::uuid
          from jsonb_array_elements_text(v_merge -> 'memberTableIds')
         order by value
      ),
      p_existing_merged_table_id => null
    ) into v_merge_result;

    v_merge_ids := v_merge_ids || jsonb_build_object(
      v_merge ->> 'id',
      v_merge_result ->> 'merged_table_id'
    );
    v_merge_count := v_merge_count + 1;
  end loop;

  for v_allocation in
    select value
      from jsonb_array_elements(coalesce(p_plan -> 'allocations', '[]'::jsonb))
     order by value ->> 'bookingReference'
  loop
    select * into v_booking
      from public.bookings
     where id = (v_allocation ->> 'bookingId')::uuid
       and show_id = p_show_id
     for update;

    if v_booking.id is null
       or v_booking.updated_at is distinct from (v_allocation ->> 'expectedBookingUpdatedAt')::timestamptz
       or v_booking.table_id is distinct from nullif(v_allocation ->> 'expectedPreviousTableId', '')::uuid
       or v_booking.archived_at is not null
       or v_booking.booking_status::text <> 'confirmed' then
      raise exception 'FLOOR_PLAN_STALE';
    end if;

    if nullif(v_allocation ->> 'targetMergeId', '') is not null then
      v_target_table_id := nullif(
        v_merge_ids ->> (v_allocation ->> 'targetMergeId'),
        ''
      )::uuid;
    else
      v_target_table_id := nullif(v_allocation ->> 'targetTableId', '')::uuid;
    end if;

    if v_target_table_id is null then
      raise exception 'FLOOR_PLAN_INVALID';
    end if;

    select * into v_source_table
      from public.show_tables
     where id = v_booking.table_id;

    -- Existing authoritative reallocation handles every recognised legacy,
    -- physical, temporary, or merged source. A truly unallocated/stale source
    -- is claimed directly inside this same transaction.
    if v_booking.table_id is not null
       and v_source_table.id is not null
       and (
         v_source_table.is_physical
         or (
           not v_source_table.is_physical
           and v_source_table.is_override
           and v_source_table.availability_scope::text = 'operational'
           and v_source_table.merged_parent_id is null
         )
         or (
           not v_source_table.is_physical
           and (
             (public.normalize_booking_capacity_zone(v_source_table.section) = 'golden-circle' and v_source_table.table_code ~* '^GC[0-9]+$')
             or (public.normalize_booking_capacity_zone(v_source_table.section) = 'middle-ring' and v_source_table.table_code ~* '^MR[0-9]+$')
             or (public.normalize_booking_capacity_zone(v_source_table.section) = 'royal-booths' and v_source_table.table_code ~* '^B[0-9]+$')
             or (public.normalize_booking_capacity_zone(v_source_table.section) = 'royal-balcony' and v_source_table.table_code ~* '^RB[0-9]+$')
           )
         )
       ) then
      select public.map_booking_physical_table_atomic(
        p_booking_id => v_booking.id,
        p_expected_previous_table_id => v_booking.table_id,
        p_target_table_id => v_target_table_id
      ) into v_map_result;
    else
      select * into v_table
        from public.show_tables
       where id = v_target_table_id
         and show_id = p_show_id
       for update;

      if v_table.id is null
         or public.normalize_booking_capacity_zone(v_table.section)
            is distinct from public.normalize_booking_capacity_zone(v_booking.section)
         or not v_table.capacity_configured
         or v_table.capacity is null
         or v_table.capacity < v_booking.guest_count
         or v_table.status::text <> 'available'
         or v_table.booking_id is not null
         or v_table.merged_parent_id is not null then
        raise exception 'FLOOR_PLAN_STALE';
      end if;

      update public.show_tables
         set booking_id = v_booking.id,
             status = 'booked',
             updated_at = now()
       where id = v_target_table_id
         and booking_id is null
         and status::text = 'available';

      if not found then
        raise exception 'FLOOR_PLAN_STALE';
      end if;

      update public.show_tables
         set booking_id = null,
             status = 'available',
             updated_at = now()
       where booking_id = v_booking.id
         and id <> v_target_table_id;

      update public.bookings
         set table_id = v_target_table_id,
             updated_at = now()
       where id = v_booking.id
         and table_id is not distinct from v_booking.table_id;

      if not found then
        raise exception 'FLOOR_PLAN_STALE';
      end if;
    end if;

    v_mapping_count := v_mapping_count + 1;
  end loop;

  insert into public.audit_events (
    actor_staff_profile_id,
    actor_auth_user_id,
    actor_name,
    actor_role,
    actor_location_scope,
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
  ) values (
    p_actor_staff_profile_id,
    p_actor_auth_user_id,
    p_actor_name,
    p_actor_role,
    coalesce(p_actor_location_scope, '{}'),
    'show.initial-floor-applied',
    'show',
    p_show_id::text,
    p_show_id::text,
    'success',
    'Operations Floor',
    'Applied a reviewed, show-scoped initial floor plan.',
    jsonb_build_object('snapshot_token', p_snapshot_token),
    jsonb_build_object(
      'allocations', v_mapping_count,
      'capacity_changes', v_capacity_count,
      'merges', v_merge_count
    ),
    array['table_capacity', 'merged_from', 'booking_table_id']
  );

  return jsonb_build_object(
    'allocations', v_mapping_count,
    'capacity_changes', v_capacity_count,
    'merges', v_merge_count,
    'snapshot_token', p_snapshot_token
  );
end
$$;

revoke all on function public.apply_initial_floor_plan_atomic(
  uuid,
  text,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text[]
) from public, anon, authenticated;

grant execute on function public.apply_initial_floor_plan_atomic(
  uuid,
  text,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text[]
) to service_role;
