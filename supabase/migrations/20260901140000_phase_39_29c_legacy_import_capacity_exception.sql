-- Permit reviewed historical Dineplan imports to preserve sold entitlement
-- without weakening the normal booking capacity guard.

create or replace function public.enforce_booking_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_entitlement integer := 0;
  v_import_exception boolean := false;
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

  if v_import_exception then
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

  perform pg_advisory_xact_lock(
    hashtextextended(new.show_id::text || ':' || v_new_zone, 0)
  );

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
      message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_new_zone,
        v_limit,
        v_existing_entitlement + v_new_contribution
      );
  end if;

  return new;
end
$$;

create or replace function public.execute_historical_dineplan_import(
  p_file_name text,
  p_rows jsonb,
  p_preview_hash text,
  p_staff_profile_id uuid,
  p_started_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    raise exception 'Historical Dineplan import rows are required.';
  end if;

  if p_preview_hash is null or p_preview_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Historical Dineplan import preview hash is invalid.';
  end if;

  if not exists (
    select 1
      from public.staff_profiles staff
      join public.roles role on role.id = staff.role_id
     where staff.id = p_staff_profile_id
       and staff.active
       and lower(role.name) = 'super admin'
  ) then
    raise exception 'An active Super Admin import actor is required.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_rows) source(row_data)
     where coalesce((source.row_data ->> 'valid')::boolean, false) is not true
        or source.row_data ->> 'action' <> 'Create'
        or lower(coalesce(source.row_data #>> '{values,source_format}', '')) <> 'dineplan legacy export'
        or lower(coalesce(source.row_data #>> '{values,floor_assignment_required}', '')) <> 'yes'
        or coalesce(source.row_data #>> '{values,resolved_booking_source}', '') <> 'admin'
        or coalesce(source.row_data #>> '{values,resolved_booking_status}', '') <> 'confirmed'
        or coalesce(source.row_data #>> '{values,resolved_table_id}', '') <> ''
        or coalesce(source.row_data #>> '{values,booking_reference}', '') !~ '^DP-JHB-[A-F0-9]{12}$'
        or coalesce(source.row_data #>> '{values,serialized_booking}', '') not like '__zingara_booking_meta__:%'
        or coalesce(source.row_data #>> '{values,serialized_booking}', '') not like '%"bookingOrigin":"data_import"%'
  ) then
    raise exception 'Historical Dineplan import payload is outside the controlled scope.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_rows) source(row_data)
      left join public.shows show
        on show.id::text = source.row_data #>> '{values,resolved_show_id}'
     where show.id is null
        or show.venue <> 'johannesburg'
        or show.status::text <> 'active'
  ) then
    raise exception 'Historical Dineplan import requires exact active Johannesburg shows.';
  end if;

  perform set_config('zingara.historical_dineplan_import', 'active', true);

  v_result := public.execute_data_portability_import(
    'bookings',
    p_file_name,
    p_rows,
    p_preview_hash,
    p_staff_profile_id,
    p_started_at
  );

  perform set_config('zingara.historical_dineplan_import', '', true);
  return v_result;
exception
  when others then
    perform set_config('zingara.historical_dineplan_import', '', true);
    raise;
end;
$$;

revoke all on function public.execute_historical_dineplan_import(text, jsonb, text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.execute_historical_dineplan_import(text, jsonb, text, uuid, timestamptz)
  to service_role;

revoke all on function public.enforce_booking_zone_capacity()
  from public, anon, authenticated;
