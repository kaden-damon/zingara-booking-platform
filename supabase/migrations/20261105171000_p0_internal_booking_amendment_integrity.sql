-- P0: Internal booking amendments must remain independent of public sales
-- status, and proposed single-zone pax must drive table-fit validation.

begin;

do $migration$
declare
  v_definition text;
  v_function regprocedure;
  v_old_guard text;
  v_old_entitlement text;
  v_new_entitlement text;
begin
  v_function := to_regprocedure(
    'public.reconcile_corporate_booking_guest_count_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'CORPORATE_GUEST_COUNT_RECONCILIATION_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);
  v_old_guard := E'  if p_guest_count > v_booking.guest_count and v_show.status::text <> ''active'' then\n    raise exception ''SHOW_NOT_ACTIVE'';\n  end if;\n';
  if position(v_old_guard in v_definition) = 0 then
    raise exception 'CORPORATE_GUEST_COUNT_STATUS_GUARD_NOT_FOUND';
  end if;
  execute replace(v_definition, v_old_guard, '');

  v_function := to_regprocedure(
    'public.resolve_booking_table_assignment_compatibility(uuid,integer)'
  );
  if v_function is null then
    raise exception 'TABLE_ASSIGNMENT_COMPATIBILITY_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);
  v_old_entitlement := E'    v_entitlement := public.booking_zone_entitlement_pax(\n      v_booking.zone_entitlements,\n      v_booking.section,\n      coalesce(p_guest_count, v_booking.guest_count),\n      v_set.zone_id\n    );\n';
  v_new_entitlement := E'    if p_guest_count is not null\n       and coalesce(jsonb_array_length(v_booking.zone_entitlements), 0) <= 1\n       and v_set.zone_id = public.normalize_booking_capacity_zone(coalesce(\n         v_booking.zone_entitlements -> 0 ->> ''zoneId'',\n         v_booking.section\n       )) then\n      v_entitlement := p_guest_count;\n    else\n      v_entitlement := public.booking_zone_entitlement_pax(\n        v_booking.zone_entitlements,\n        v_booking.section,\n        v_booking.guest_count,\n        v_set.zone_id\n      );\n    end if;\n';
  if position(v_old_entitlement in v_definition) = 0 then
    raise exception 'TABLE_ASSIGNMENT_PROPOSED_PAX_GUARD_NOT_FOUND';
  end if;
  execute replace(v_definition, v_old_entitlement, v_new_entitlement);

  if position(
    'SHOW_NOT_ACTIVE' in pg_get_functiondef(
      'public.reconcile_corporate_booking_guest_count_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'::regprocedure
    )
  ) > 0 then
    raise exception 'CORPORATE_GUEST_COUNT_STATUS_GUARD_STILL_PRESENT';
  end if;
  if position(
    'v_entitlement := p_guest_count' in pg_get_functiondef(
      'public.resolve_booking_table_assignment_compatibility(uuid,integer)'::regprocedure
    )
  ) = 0 then
    raise exception 'TABLE_ASSIGNMENT_PROPOSED_PAX_GUARD_NOT_APPLIED';
  end if;

  v_function := to_regprocedure(
    'public.transfer_booking_show_atomic(text,uuid,uuid,uuid,uuid,text,text,text[],text,text)'
  );
  if v_function is null then
    raise exception 'BOOKING_TRANSFER_FUNCTION_NOT_FOUND';
  end if;
  v_definition := pg_get_functiondef(v_function);
  if position(
    'v_destination_show.status::text not in (''active'', ''inactive'', ''sold_out'', ''special_event'')'
    in v_definition
  ) = 0 then
    raise exception 'BOOKING_TRANSFER_STATUS_GUARD_NOT_FOUND';
  end if;
  execute replace(
    v_definition,
    'v_destination_show.status::text not in (''active'', ''inactive'', ''sold_out'', ''special_event'')',
    'v_destination_show.status::text not in (''active'', ''blackout'', ''inactive'', ''sold_out'', ''special_event'')'
  );

  if position(
    '''blackout''' in pg_get_functiondef(
      'public.transfer_booking_show_atomic(text,uuid,uuid,uuid,uuid,text,text,text[],text,text)'::regprocedure
    )
  ) = 0 then
    raise exception 'BOOKING_TRANSFER_BLACKOUT_STATUS_NOT_APPLIED';
  end if;
end;
$migration$;

commit;
