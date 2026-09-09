-- Phase 41.1W: allow the existing service-role-only atomic multi-table pathway
-- to assign any active operational booking. The legacy function name remains
-- unchanged for backward compatibility with the deployed Floor integration.

do $$
declare
  v_definition text;
  v_original text;
  v_signature regprocedure :=
    'public.assign_corporate_booking_zone_tables_atomic(text,text,timestamptz,uuid[],jsonb,uuid,uuid)'::regprocedure;
begin
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;

  v_definition := regexp_replace(
    v_definition,
    $pattern$if\s+v_booking\.booking_origin\s+not\s+in\s+\('corporate',\s*'data_import'\)\s+or\s+v_booking\.booking_source\s*<>\s*'corporate-direct'\s+then\s+raise exception 'CORPORATE_BOOKING_REQUIRED';\s+end if;$pattern$,
    '',
    'i'
  );

  if v_definition = v_original then
    raise exception 'Expected Corporate-only multi-table assignment guard was not found in %', v_signature;
  end if;

  v_definition := replace(v_definition, '''CORPORATE_BOOKING_NOT_FOUND''', '''BOOKING_NOT_FOUND''');
  v_definition := replace(v_definition, '''ACTIVE_CORPORATE_BOOKING_REQUIRED''', '''ACTIVE_BOOKING_REQUIRED''');
  v_definition := replace(v_definition, '''booking.corporate-zone-tables-assigned''', '''booking.zone-tables-assigned''');
  v_definition := replace(v_definition, '''Corporate zone tables assigned.''', '''Operational zone tables assigned.''');

  execute v_definition;
end;
$$;

revoke all on function public.assign_corporate_booking_zone_tables_atomic(text,text,timestamptz,uuid[],jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.assign_corporate_booking_zone_tables_atomic(text,text,timestamptz,uuid[],jsonb,uuid,uuid)
  to service_role;
