-- Phase 41.2I follow-up: retained Corporate Floor RPCs must resolve the same
-- effective operational ceiling and zone-entitlement grain as current flows.

do $$
declare
  v_definition text;
  v_original text;
  v_signature regprocedure :=
    'public.transfer_corporate_booking_zone_atomic(text,uuid,text,uuid,timestamptz,text,uuid,uuid,text,text,text[])'::regprocedure;
begin
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    'v_zone_limit := public.booking_capacity_zone_limit(v_target_zone);',
    'v_zone_limit := public.booking_capacity_zone_effective_limit(v_booking.show_id, v_target_zone);'
  );
  v_definition := replace(
    v_definition,
    $old$select coalesce(sum(greatest(coalesce(guest_count, 0), 0)), 0)::integer
    into v_existing_target_pax
    from public.bookings
   where show_id = v_booking.show_id
     and id <> v_booking.id
     and archived_at is null
     and booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     and public.normalize_booking_capacity_zone(section) = v_target_zone;$old$,
    $new$select coalesce(sum(public.booking_zone_entitlement_pax(
      zone_entitlements, section, guest_count, v_target_zone
    )), 0)::integer
    into v_existing_target_pax
    from public.bookings
   where show_id = v_booking.show_id
     and id <> v_booking.id
     and archived_at is null
     and booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');$new$
  );

  if v_definition = v_original
     or v_definition like '%booking_capacity_zone_limit(v_target_zone)%'
     or v_definition like '%greatest(coalesce(guest_count, 0), 0)%' then
    raise exception 'Expected Corporate zone-transfer capacity guards were not found in %', v_signature;
  end if;

  execute v_definition;
end;
$$;

do $$
declare
  v_definition text;
  v_original text;
  v_signature regprocedure :=
    'public.assign_corporate_booking_tables_atomic(text,timestamptz,uuid[],jsonb,uuid,uuid)'::regprocedure;
begin
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;
  v_definition := replace(
    v_definition,
    'v_zone_limit := public.booking_capacity_zone_limit(v_target_zone);',
    'v_zone_limit := public.booking_capacity_zone_effective_limit(v_booking.show_id, v_target_zone);'
  );

  if v_definition = v_original
     or v_definition like '%booking_capacity_zone_limit(v_target_zone)%' then
    raise exception 'Expected retained Corporate assignment capacity guard was not found in %', v_signature;
  end if;

  execute v_definition;
end;
$$;

revoke all on function public.transfer_corporate_booking_zone_atomic(
  text, uuid, text, uuid, timestamptz, text, uuid, uuid, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.transfer_corporate_booking_zone_atomic(
  text, uuid, text, uuid, timestamptz, text, uuid, uuid, text, text, text[]
) to service_role;

revoke all on function public.assign_corporate_booking_tables_atomic(
  text, timestamptz, uuid[], jsonb, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.assign_corporate_booking_tables_atomic(
  text, timestamptz, uuid[], jsonb, uuid, uuid
) to service_role;
