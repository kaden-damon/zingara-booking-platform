-- Phase 41.2E: edit an existing Corporate booking's authoritative zone split.

create or replace function public.update_corporate_booking_zone_entitlements_atomic(
  p_booking_reference text,
  p_zone_entitlements jsonb,
  p_expected_updated_at timestamptz,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_validate_only boolean default false
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
  v_booking public.bookings%rowtype;
  v_claim public.show_tables%rowtype;
  v_claim_ids uuid[] := '{}';
  v_existing_pax integer;
  v_limit integer;
  v_normalized jsonb;
  v_primary_section text;
  v_primary_zone text;
  v_show public.shows%rowtype;
  v_total integer;
  v_zone text;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (
       select 1 from public.role_permissions rp
       join public.permissions permission on permission.id = rp.permission_id
       where rp.role_id = role.id and permission.key = 'bookings:manage'
     );
  if v_actor_name is null then raise exception 'BOOKING_MANAGEMENT_PERMISSION_REQUIRED'; end if;

  select * into v_booking from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '') for update;
  if v_booking.id is null then raise exception 'CORPORATE_BOOKING_NOT_FOUND'; end if;
  if v_booking.booking_origin <> 'corporate' or v_booking.booking_source <> 'corporate-direct' then
    raise exception 'CORPORATE_BOOKING_REQUIRED';
  end if;
  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new','confirmed','pending_payment','checked_in') then
    raise exception 'ACTIVE_CORPORATE_BOOKING_REQUIRED';
  end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'CORPORATE_ZONE_ENTITLEMENTS_STALE';
  end if;

  v_total := v_booking.guest_count;
  if jsonb_typeof(p_zone_entitlements) <> 'array'
     or jsonb_array_length(p_zone_entitlements) = 0 then
    raise exception 'CORPORATE_ZONE_ENTITLEMENTS_INVALID';
  end if;
  select jsonb_agg(
      jsonb_build_object(
        'zoneId', public.normalize_booking_capacity_zone(item ->> 'zoneId'),
        'pax', (item ->> 'pax')::integer
      ) order by ordinal
    ) into v_normalized
    from jsonb_array_elements(p_zone_entitlements) with ordinality input(item, ordinal);
  if not public.corporate_zone_entitlements_valid(v_normalized, v_total)
     or exists (
       select 1 from jsonb_array_elements(v_normalized) item
       where item ->> 'zoneId' is null
     ) then
    raise exception 'CORPORATE_ZONE_ENTITLEMENTS_INVALID';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id for share;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or lower(trim(coalesce(v_show.venue, ''))) = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or replace(lower(trim(coalesce(v_show.venue, ''))), ' ', '-') = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  for v_zone in
    select zone from (
      select public.normalize_booking_capacity_zone(item ->> 'zoneId') as zone
      from jsonb_array_elements(v_normalized) item
      union
      select public.normalize_booking_capacity_zone(item ->> 'zoneId') as zone
      from jsonb_array_elements(coalesce(v_booking.zone_entitlements, jsonb_build_array(
        jsonb_build_object('zoneId', v_booking.section, 'pax', v_booking.guest_count)
      ))) item
    ) zones where zone is not null order by zone
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text || ':' || v_zone, 0));
  end loop;

  perform 1 from public.show_tables
   where booking_id = v_booking.id order by id for update;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_claim_ids
    from public.show_tables where booking_id = v_booking.id;
  for v_claim in select * from public.show_tables where booking_id = v_booking.id order by id
  loop
    v_zone := public.normalize_booking_capacity_zone(v_claim.section);
    if v_zone is null or not exists (
      select 1 from jsonb_array_elements(v_normalized) item
       where item ->> 'zoneId' = v_zone
    ) then
      raise exception using errcode = '23514', message = format(
        'CORPORATE_ZONE_TABLE_CONFLICT|%s|%s', coalesce(v_zone, 'unknown'), v_claim.table_code
      );
    end if;
  end loop;
  if cardinality(v_claim_ids) = 0 and v_booking.table_id is not null then
    raise exception 'CORPORATE_ZONE_PRIMARY_TABLE_INVALID';
  end if;
  if cardinality(v_claim_ids) > 0 and not (v_booking.table_id = any(v_claim_ids)) then
    raise exception 'CORPORATE_ZONE_PRIMARY_TABLE_INVALID';
  end if;

  for v_zone in
    select item ->> 'zoneId' from jsonb_array_elements(v_normalized) item order by 1
  loop
    v_limit := public.booking_capacity_zone_effective_limit(v_booking.show_id, v_zone);
    if v_limit is null then continue; end if;
    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_zone
    )), 0)::integer into v_existing_pax
      from public.bookings b
     where b.show_id = v_booking.show_id
       and b.id <> v_booking.id
       and b.archived_at is null
       and b.booking_status::text in ('new','confirmed','pending_payment','checked_in');
    if v_existing_pax + public.booking_zone_entitlement_pax(
      v_normalized, v_booking.section, v_booking.guest_count, v_zone
    ) > v_limit then
      raise exception using errcode = '23514', message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s', v_zone, v_limit,
        v_existing_pax + public.booking_zone_entitlement_pax(
          v_normalized, v_booking.section, v_booking.guest_count, v_zone
        )
      );
    end if;
  end loop;

  v_primary_zone := v_normalized -> 0 ->> 'zoneId';
  v_primary_section := case v_primary_zone
    when 'golden-circle' then 'Golden Circle'
    when 'middle-ring' then 'Middle Ring'
    when 'royal-booths' then 'Private Booths'
    when 'royal-balcony' then 'Royal Balcony'
    else null
  end;
  if v_primary_section is null then raise exception 'CORPORATE_ZONE_ENTITLEMENTS_INVALID'; end if;

  if v_booking.zone_entitlements is not distinct from v_normalized
     and public.normalize_booking_capacity_zone(v_booking.section) = v_primary_zone then
    return jsonb_build_object('booking_reference',v_booking.booking_reference,'idempotent',true,'ready',true,'zone_entitlements',v_normalized);
  end if;
  if p_validate_only then
    return jsonb_build_object('booking_reference',v_booking.booking_reference,'idempotent',false,'ready',true,'zone_entitlements',v_normalized);
  end if;

  update public.bookings
     set section = v_primary_section,
         zone_entitlements = v_normalized,
         updated_at = clock_timestamp()
   where id = v_booking.id;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'booking.corporate-zone-entitlements-updated', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('zone_entitlements',v_normalized,'guest_count',v_booking.guest_count,'show_id',v_booking.show_id),
    jsonb_build_object('zone_entitlements',coalesce(v_booking.zone_entitlements,jsonb_build_array(jsonb_build_object('zoneId',public.normalize_booking_capacity_zone(v_booking.section),'pax',v_booking.guest_count))),'guest_count',v_booking.guest_count,'show_id',v_booking.show_id),
    array['section','zone_entitlements'], v_booking.id::text, v_booking.booking_reference,
    'booking', 'success', 'Corporate seating-zone allocation updated without financial repricing.', 'Booking Details'
  );

  return jsonb_build_object('booking_reference',v_booking.booking_reference,'idempotent',false,'ready',true,'zone_entitlements',v_normalized);
end;
$$;

revoke all on function public.update_corporate_booking_zone_entitlements_atomic(text,jsonb,timestamptz,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.update_corporate_booking_zone_entitlements_atomic(text,jsonb,timestamptz,uuid,uuid,boolean)
  to service_role;

comment on function public.update_corporate_booking_zone_entitlements_atomic(text,jsonb,timestamptz,uuid,uuid,boolean) is
  'Atomically validates or updates one active Corporate booking zone split without repricing or table allocation.';
