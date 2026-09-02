-- Extend the transaction-scoped legacy correction context to an exact,
-- audited show/zone reassignment that always releases the old table claim.

create or replace function public.enforce_booking_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_entitlement integer := 0;
  v_import_exception boolean := false;
  v_import_update_exception boolean := false;
  v_limit integer;
  v_new_contribution integer := 0;
  v_new_occupies boolean;
  v_new_zone text;
  v_old_contribution integer := 0;
  v_old_occupies boolean := false;
  v_old_zone text;
begin
  v_new_zone := public.normalize_booking_capacity_zone(new.section);
  v_limit := public.booking_capacity_zone_limit(v_new_zone);
  v_new_occupies :=
    new.archived_at is null
    and new.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

  if not v_new_occupies or v_limit is null then
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

  if v_import_exception or v_import_update_exception then
    return new;
  end if;

  v_new_contribution := greatest(coalesce(new.guest_count, 0), 0);

  if tg_op = 'UPDATE' then
    v_old_zone := public.normalize_booking_capacity_zone(old.section);
    v_old_occupies :=
      old.archived_at is null
      and old.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

    if v_old_occupies and old.show_id = new.show_id and v_old_zone = v_new_zone then
      v_old_contribution := greatest(coalesce(old.guest_count, 0), 0);

      if v_new_contribution <= v_old_contribution then
        return new;
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.show_id::text || ':' || v_new_zone, 0));

  select coalesce(sum(greatest(coalesce(b.guest_count, 0), 0)), 0)::integer
    into v_existing_entitlement
    from public.bookings b
   where b.show_id = new.show_id
     and b.archived_at is null
     and b.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     and public.normalize_booking_capacity_zone(b.section) = v_new_zone
     and (tg_op = 'INSERT' or b.id <> new.id);

  if v_existing_entitlement + v_new_contribution > v_limit then
    raise exception using
      errcode = '23514',
      message = format('ZONE_CAPACITY_EXCEEDED|%s|%s|%s', v_new_zone, v_limit, v_existing_entitlement + v_new_contribution);
  end if;

  return new;
end
$$;

create or replace function public.execute_historical_dineplan_reassignment_correction(
  p_booking_reference text,
  p_expected_show_id uuid,
  p_expected_table_id uuid,
  p_expected_section text,
  p_destination_show_id uuid,
  p_destination_section text,
  p_staff_profile_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_auth_user_id uuid;
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_booking public.bookings%rowtype;
  v_destination_show public.shows%rowtype;
  v_old_table_code text;
  v_released integer := 0;
begin
  select staff.user_id, staff.venue_scope, staff.full_name, role.name
    into v_actor_auth_user_id, v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_staff_profile_id
     and staff.active
     and lower(role.name) = 'super admin';

  if v_actor_auth_user_id is null then
    raise exception 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'CORRECTION_REASON_REQUIRED';
  end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;

  if v_booking.id is null then
    raise exception 'LEGACY_BOOKING_NOT_FOUND';
  end if;

  if v_booking.booking_origin <> 'data_import'
     or v_booking.booking_source not in ('admin', 'corporate-direct')
     or v_booking.provenance_recorded_at is null
     or v_booking.notes not like '__zingara_booking_meta__:%' then
    raise exception 'LEGACY_BOOKING_PROVENANCE_REQUIRED';
  end if;

  if v_booking.show_id <> p_expected_show_id
     or v_booking.table_id is distinct from p_expected_table_id
     or v_booking.section is distinct from p_expected_section then
    raise exception 'LEGACY_BOOKING_ASSIGNMENT_CHANGED';
  end if;

  select * into v_destination_show
    from public.shows
   where id = p_destination_show_id
     and venue = 'johannesburg'
     and status::text = 'active';

  if v_destination_show.id is null then
    raise exception 'ACTIVE_JOHANNESBURG_DESTINATION_REQUIRED';
  end if;

  if public.normalize_booking_capacity_zone(p_destination_section) is null then
    raise exception 'SUPPORTED_DESTINATION_ZONE_REQUIRED';
  end if;

  select table_code into v_old_table_code
    from public.show_tables
   where id = p_expected_table_id
     and booking_id = v_booking.id
   for update;

  if p_expected_table_id is not null and v_old_table_code is null then
    raise exception 'RECIPROCAL_TABLE_CLAIM_CHANGED';
  end if;

  update public.show_tables
     set booking_id = null,
         status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
         updated_at = clock_timestamp()
   where id = p_expected_table_id
     and booking_id = v_booking.id;
  get diagnostics v_released = row_count;

  if p_expected_table_id is not null and v_released <> 1 then
    raise exception 'RECIPROCAL_TABLE_RELEASE_FAILED';
  end if;

  perform set_config('zingara.historical_dineplan_update', 'active', true);
  perform set_config('zingara.historical_dineplan_update_booking_id', v_booking.id::text, true);

  update public.bookings
     set show_id = p_destination_show_id,
         section = p_destination_section,
         table_id = null,
         updated_at = clock_timestamp()
   where id = v_booking.id;

  perform set_config('zingara.historical_dineplan_update_booking_id', '', true);
  perform set_config('zingara.historical_dineplan_update', '', true);

  insert into public.booking_lifecycle_events (booking_id, changed_by, from_status, to_status, note, reason)
  values (
    v_booking.id,
    v_actor_auth_user_id,
    v_booking.booking_status,
    v_booking.booking_status,
    format('Historical Dineplan assignment correction: show %s to %s; zone %s to %s; table %s released.', v_booking.show_id, p_destination_show_id, v_booking.section, p_destination_section, coalesce(v_old_table_code, 'Unassigned')),
    trim(p_reason)
  );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'booking.legacy-assignment-correction',
    v_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_staff_profile_id,
    jsonb_build_object('show_id', p_destination_show_id, 'section', p_destination_section, 'table_id', null),
    jsonb_build_object('show_id', v_booking.show_id, 'section', v_booking.section, 'table_id', v_booking.table_id, 'table_code', v_old_table_code),
    array['show_id', 'section', 'table_id'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    trim(p_reason),
    'Data Portability'
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'show_id', p_destination_show_id,
    'section', p_destination_section,
    'table_id', null,
    'released_table_count', v_released
  );
exception
  when others then
    perform set_config('zingara.historical_dineplan_update_booking_id', '', true);
    perform set_config('zingara.historical_dineplan_update', '', true);
    raise;
end;
$$;

revoke all on function public.execute_historical_dineplan_reassignment_correction(text, uuid, uuid, text, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.execute_historical_dineplan_reassignment_correction(text, uuid, uuid, text, uuid, text, uuid, text)
  to service_role;

revoke all on function public.enforce_booking_zone_capacity()
  from public, anon, authenticated;
