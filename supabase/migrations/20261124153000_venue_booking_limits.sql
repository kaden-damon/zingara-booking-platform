-- Booking-size limits are independent of the immutable 415-seat public layout.
-- No booking, table, assignment or approved layout rows are rewritten.
begin;

create or replace function public.private_booth_booking_maximum(p_table public.show_tables)
returns integer language sql immutable set search_path=public as $$
  select case when p_table.is_physical and not p_table.is_override
    and p_table.capacity_configured and p_table.capacity=6
    and p_table.merged_parent_id is null
    and coalesce(cardinality(p_table.merged_from),0)=0
    and public.normalize_booking_capacity_zone(p_table.section)='royal-booths'
    and p_table.table_code=any(array['1','2','3','4','5','6','7','8','9','10','11','12',
      '14','15','16','17','18','19','20','21','22','23','24'])
    then 8 else p_table.capacity end;
$$;
revoke all on function public.private_booth_booking_maximum(public.show_tables) from public,anon,authenticated;
grant execute on function public.private_booth_booking_maximum(public.show_tables) to service_role;

-- Preserve these restricted limits when an older general settings form saves.
create or replace function public.preserve_seating_booking_limits()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('zingara.booking_limits_write',true) is distinct from 'allowed' then
    new.settings := (new.settings - 'bookingLimits') ||
      case when old.settings ? 'bookingLimits' then jsonb_build_object('bookingLimits',old.settings->'bookingLimits') else '{}'::jsonb end;
  end if;
  return new;
end; $$;
create trigger preserve_seating_booking_limits before update of settings on public.venue_settings
for each row execute function public.preserve_seating_booking_limits();

create or replace function public.set_seating_booking_limits(
  p_venue text,p_zone text,p_minimum integer,p_maximum integer,
  p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_name text; v_role text; v_scope text[]; v_settings jsonb; v_previous jsonb;
  v_limit jsonb := jsonb_build_object('minGuests',p_minimum,'maxGuests',p_maximum);
begin
  select staff.full_name,role.name,staff.venue_scope into v_name,v_role,v_scope
  from public.staff_profiles staff join public.roles role on role.id=staff.role_id
  where staff.id=p_actor_staff_profile_id and staff.user_id=p_actor_auth_user_id
    and staff.active and staff.id in ('e8598359-54a0-4e1f-a635-1ec8ae02cb78','3ac09b59-fc3f-4c6d-9bb3-8dd47a077188')
    and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
      where rp.role_id=role.id and p.key='tables:manage');
  if v_name is null then raise exception 'BOOKING_LIMIT_PERMISSION_REQUIRED'; end if;
  if p_venue is null or p_venue not in ('cape-town','johannesburg')
    or not ('all'=any(coalesce(v_scope,'{}'::text[])) or p_venue=any(coalesce(v_scope,'{}'::text[])))
    then raise exception 'SHOW_OUTSIDE_STAFF_SCOPE'; end if;
  if p_zone is null or p_zone not in ('golden-circle','middle-ring','royal-booths','royal-balcony')
    or p_minimum is null or p_maximum is null or p_minimum<1 or p_minimum>p_maximum
    or p_maximum>(case when p_zone='royal-booths' then 8 else 19 end)
    then raise exception 'BOOKING_LIMIT_INVALID'; end if;
  select settings into strict v_settings from public.venue_settings
    where venue_key='zingara-cape-town' for update;
  v_previous := v_settings #> array['bookingLimits',p_venue,p_zone];
  v_settings := jsonb_set(v_settings,'{bookingLimits}',
    coalesce(v_settings->'bookingLimits','{}'::jsonb) || jsonb_build_object(p_venue,
      coalesce(v_settings #> array['bookingLimits',p_venue],'{}'::jsonb) || jsonb_build_object(p_zone,v_limit)));
  perform set_config('zingara.booking_limits_write','allowed',true);
  update public.venue_settings set settings=v_settings,updated_at=clock_timestamp()
    where venue_key='zingara-cape-town';
  perform set_config('zingara.booking_limits_write','',true);
  insert into public.audit_events(action,actor_staff_profile_id,actor_auth_user_id,actor_name,actor_role,
    actor_location_scope,entity_type,entity_id,entity_reference,entity_location,before_values,after_values,
    changed_fields,outcome,reason,source_area)
  values('venue.booking-limits-updated',p_actor_staff_profile_id,p_actor_auth_user_id,v_name,v_role,v_scope,
    'venue',p_venue,p_venue||':'||p_zone,p_venue,coalesce(v_previous,'{}'::jsonb),v_limit,array['bookingLimits'],
    'success','Venue seating-zone booking sizes updated.','Operations Floor');
end; $$;
revoke all on function public.set_seating_booking_limits(text,text,integer,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_seating_booking_limits(text,text,integer,integer,uuid,uuid) to service_role;

-- Extend the existing fit checks only; raw capacities still drive snapshots,
-- layout reconciliation and public capacity reporting.
do $$
declare v_signature text; v_old text; v_new text; v_find text; v_replace text;
begin
  for v_signature,v_find,v_replace in select * from (values
    ('assign_corporate_booking_tables_atomic(text,timestamp with time zone,uuid[],jsonb,uuid,uuid)',
      'v_combined_capacity + v_table.capacity','v_combined_capacity + public.private_booth_booking_maximum(v_table)'),
    ('assign_corporate_booking_zone_tables_atomic(text,text,timestamp with time zone,uuid[],jsonb,uuid,uuid)',
      'v_combined_capacity + v_table.capacity','v_combined_capacity + public.private_booth_booking_maximum(v_table)'),
    ('assign_full_show_buyout_zone_tables_atomic(text,timestamp with time zone,text,uuid[],uuid,uuid)',
      'v_combined_capacity + v_table.capacity','v_combined_capacity + public.private_booth_booking_maximum(v_table)'),
    ('reallocate_booking_zone_tables_atomic(text,timestamp with time zone,uuid[],text,uuid[],uuid,uuid)',
      'v_combined_capacity + v_table.capacity','v_combined_capacity + public.private_booth_booking_maximum(v_table)'),
    ('apply_initial_floor_plan_atomic(uuid,text,jsonb,uuid,uuid,text,text,text[])',
      'v_table.capacity < v_booking.guest_count','public.private_booth_booking_maximum(v_table) < v_booking.guest_count'),
    ('map_booking_physical_table_atomic(uuid,uuid,uuid)',
      'v_target_table.capacity < v_booking.guest_count','public.private_booth_booking_maximum(v_target_table) < v_booking.guest_count'),
    ('assign_unallocated_booking_table_atomic(uuid,uuid)',
      'v_target.capacity < v_booking.guest_count','public.private_booth_booking_maximum(v_target) < v_booking.guest_count'),
    ('resolve_booking_table_assignment_compatibility(uuid,integer)',
      'sum(st.capacity)::integer as maximum_occupancy','sum(public.private_booth_booking_maximum(st))::integer as maximum_occupancy'),
    ('try_automatic_table_assignment(uuid)',
      'v_candidate_capacity + v_candidate.capacity','v_candidate_capacity + public.private_booth_booking_maximum(v_candidate)'),
    ('try_automatic_table_assignment_phase_54_5(uuid)',
      'v_candidate_capacity + v_candidate.capacity','v_candidate_capacity + public.private_booth_booking_maximum(v_candidate)'),
    ('try_hybrid_table_assignment_phase_54_11(uuid)',
      'v_candidate_capacity + v_candidate.capacity','v_candidate_capacity + public.private_booth_booking_maximum(v_candidate)'),
    ('try_phase55_existing_booking_assignment(uuid)',
      'v_candidate_capacity + v_candidate.capacity','v_candidate_capacity + public.private_booth_booking_maximum(v_candidate)')
  ) changes(signature,find,replace)
  loop
    v_old := pg_get_functiondef(('public.'||v_signature)::regprocedure);
    if (length(v_old)-length(replace(v_old,v_find,'')))/length(v_find)<>1
      then raise exception 'BOOKING_LIMIT_FUNCTION_DRIFT: %',v_signature; end if;
    v_new := replace(v_old,v_find,v_replace);
    execute v_new;
  end loop;
end; $$;

-- New automatic allocations use the current venue-specific booth minimum.
do $$
declare v_old text; v_find text := 'coalesce(approved.minimum_guests, venue_table.minimum_capacity)';
begin
  v_old := pg_get_functiondef('public.resolve_approved_table_minimum_occupancy(uuid)'::regprocedure);
  if position(v_find in v_old)=0 then raise exception 'BOOTH_MINIMUM_FUNCTION_DRIFT'; end if;
  execute replace(v_old,v_find,$replacement$case when approved.zone_id='royal-booths'
    then coalesce((select (settings #>> array['bookingLimits',setting.venue,'royal-booths','minGuests'])::integer
      from public.venue_settings where venue_key='zingara-cape-town'),6)
    else coalesce(approved.minimum_guests, venue_table.minimum_capacity) end$replacement$);
end; $$;

-- Explicitly authorised initial settings. Other zones retain their current
-- Standard booking range (one to nineteen; twenty-plus remains Corporate).
do $$
declare v_before jsonb; v_limits jsonb; v_zones jsonb;
begin
  select settings->'bookingLimits' into v_before from public.venue_settings where venue_key='zingara-cape-town' for update;
  select jsonb_object_agg(zone,jsonb_build_object('minGuests',case when zone='royal-booths' then 6 else 1 end,
    'maxGuests',case when zone='royal-booths' then 8 else 19 end)) into v_zones
    from unnest(array['golden-circle','middle-ring','royal-booths','royal-balcony']) zone;
  v_limits := jsonb_build_object('cape-town',v_zones,'johannesburg',v_zones);
  if v_before is not null then raise exception 'BOOKING_LIMIT_SETTINGS_ALREADY_EXIST'; end if;
  perform set_config('zingara.booking_limits_write','allowed',true);
  update public.venue_settings set settings=jsonb_set(settings,'{bookingLimits}',v_limits),updated_at=clock_timestamp()
    where venue_key='zingara-cape-town';
  if not found then raise exception 'VENUE_SETTINGS_REQUIRED'; end if;
  perform set_config('zingara.booking_limits_write','',true);
  insert into public.audit_events(action,actor_name,entity_type,entity_id,entity_reference,before_values,after_values,
    changed_fields,outcome,reason,source_area)
  values('venue.booking-limits-initialised','System','venue','both','cape-town:johannesburg',coalesce(v_before,'{}'::jsonb),v_limits,
    array['bookingLimits'],'success','Authorised 6-8 guest limits for the 23 existing Private Booths at both venues; public capacities and existing seating unchanged.','Operations Floor');
end; $$;
commit;
