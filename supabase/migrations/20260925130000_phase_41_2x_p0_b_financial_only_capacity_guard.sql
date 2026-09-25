-- Phase 41.2X-P0-B: capacity protects entitlement changes, not unrelated
-- persistence on an entitlement that already exists.
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

  -- UPDATE OF fires when a guarded column is targeted even if its value is
  -- unchanged. Skip capacity validation only when every authoritative input
  -- to booking entitlement remains equivalent.
  if tg_op = 'UPDATE'
     and old.show_id is not distinct from new.show_id
     and old.section is not distinct from new.section
     and old.zone_entitlements is not distinct from new.zone_entitlements
     and old.guest_count is not distinct from new.guest_count
     and (old.archived_at is null) = (new.archived_at is null)
     and (
       old.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     ) = (
       new.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     ) then
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

    -- Public-online inserts remain limited to the sellable base. Existing
    -- staff-managed bookings use effective operational capacity.
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

