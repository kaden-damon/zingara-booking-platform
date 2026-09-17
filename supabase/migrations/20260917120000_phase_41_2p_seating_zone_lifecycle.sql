-- Phase 41.2P: one authoritative seating-zone lifecycle guard.

create or replace function public.normalize_seating_zone_lifecycle_id(p_zone text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_zone, '')))
    when 'elevated stage' then 'elevated-stage'
    when 'elevated-stage' then 'elevated-stage'
    when 'es' then 'elevated-stage'
    when 'golden circle' then 'golden-circle'
    when 'golden-circle' then 'golden-circle'
    when 'gc' then 'golden-circle'
    when 'middle ring' then 'middle-ring'
    when 'middle-ring' then 'middle-ring'
    when 'mr' then 'middle-ring'
    when 'private booth' then 'royal-booths'
    when 'private booths' then 'royal-booths'
    when 'royal booth' then 'royal-booths'
    when 'royal booths' then 'royal-booths'
    when 'royal-booths' then 'royal-booths'
    when 'pb' then 'royal-booths'
    when 'rb' then 'royal-balcony'
    when 'royal balcony' then 'royal-balcony'
    when 'royal-balcony' then 'royal-balcony'
    else null
  end
$$;

create or replace function public.seating_zone_is_enabled(p_zone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select public.normalize_seating_zone_lifecycle_id(p_zone) as zone_id
  )
  select case
    when normalized.zone_id is null then false
    else coalesce(
      (
        select (settings #>> array['zonePricing', normalized.zone_id, 'enabled'])::boolean
          from public.venue_settings
         where venue_key = 'zingara-cape-town'
         limit 1
      ),
      true
    )
  end
  from normalized
$$;

create or replace function public.booking_seating_zone_lifecycle_ids(
  p_section text,
  p_zone_entitlements jsonb
)
returns setof text
language sql
immutable
as $$
  select distinct zone_id
  from (
    select public.normalize_seating_zone_lifecycle_id(item ->> 'zoneId') as zone_id
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_zone_entitlements) = 'array'
            and jsonb_array_length(p_zone_entitlements) > 0
          then p_zone_entitlements
          else '[]'::jsonb
        end
      ) item
    union all
    select public.normalize_seating_zone_lifecycle_id(p_section)
      where jsonb_typeof(p_zone_entitlements) is distinct from 'array'
         or jsonb_array_length(p_zone_entitlements) = 0
  ) zones
  where zone_id is not null
$$;

create or replace function public.enforce_booking_seating_zone_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_zone text;
begin
  if tg_op = 'INSERT'
     and current_setting('zingara.historical_dineplan_import', true) = 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and current_setting('zingara.historical_dineplan_update', true) = 'active'
     and current_setting('zingara.historical_dineplan_update_booking_id', true) = new.id::text then
    return new;
  end if;

  for v_zone in
    select zone_id
      from public.booking_seating_zone_lifecycle_ids(new.section, new.zone_entitlements) zone_id
  loop
    if not public.seating_zone_is_enabled(v_zone)
       and (
         tg_op = 'INSERT'
         or not exists (
           select 1
             from public.booking_seating_zone_lifecycle_ids(old.section, old.zone_entitlements) old_zone
            where old_zone = v_zone
         )
       ) then
      raise exception using
        errcode = '23514',
        message = format('SEATING_ZONE_DISABLED|%s', v_zone);
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists bookings_seating_zone_lifecycle_guard on public.bookings;
create trigger bookings_seating_zone_lifecycle_guard
before insert or update of section, zone_entitlements
on public.bookings
for each row
execute function public.enforce_booking_seating_zone_lifecycle();

create or replace function public.enforce_corporate_request_seating_zone_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_zone text;
begin
  v_zone := public.normalize_seating_zone_lifecycle_id(new.seating_preference);
  if v_zone is not null
     and not public.seating_zone_is_enabled(v_zone)
     and (
       tg_op = 'INSERT'
       or public.normalize_seating_zone_lifecycle_id(old.seating_preference) is distinct from v_zone
     ) then
    raise exception using
      errcode = '23514',
      message = format('SEATING_ZONE_DISABLED|%s', v_zone);
  end if;
  return new;
end
$$;

drop trigger if exists corporate_requests_seating_zone_lifecycle_guard on public.corporate_requests;
create trigger corporate_requests_seating_zone_lifecycle_guard
before insert or update of seating_preference
on public.corporate_requests
for each row
execute function public.enforce_corporate_request_seating_zone_lifecycle();

revoke all on function public.seating_zone_is_enabled(text) from public, anon, authenticated;
grant execute on function public.seating_zone_is_enabled(text) to service_role;

comment on function public.seating_zone_is_enabled(text) is
  'Returns the authoritative Venue Configuration lifecycle state for a canonical seating zone.';
