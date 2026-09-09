-- Phase 41.1U: reuse the existing atomic per-table release pathway for every
-- active operational booking assignment. The function name remains unchanged
-- for compatibility with the deployed client/server integration.

do $$
declare
  v_definition text;
  v_original text;
  v_signature regprocedure :=
    'public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid)'::regprocedure;
begin
  v_definition := pg_get_functiondef(v_signature);
  v_original := v_definition;

  v_definition := regexp_replace(
    v_definition,
    $pattern$if\s+v_booking\.booking_source\s*<>\s*'corporate-direct'\s+or\s+v_booking\.booking_origin\s+not\s+in\s+\('corporate',\s*'data_import'\)\s+then\s+raise exception 'CORPORATE_BOOKING_REQUIRED';\s+end if;$pattern$,
    '',
    'i'
  );

  if v_definition = v_original then
    raise exception 'Expected Corporate-only table release guard was not found in %', v_signature;
  end if;

  v_definition := replace(
    v_definition,
    '''CORPORATE_BOOKING_NOT_FOUND''',
    '''BOOKING_NOT_FOUND'''
  );
  v_definition := replace(
    v_definition,
    '''ACTIVE_CORPORATE_BOOKING_REQUIRED''',
    '''ACTIVE_BOOKING_REQUIRED'''
  );
  v_definition := replace(
    v_definition,
    '''booking.corporate-table-released''',
    '''booking.table-released'''
  );
  v_definition := replace(
    v_definition,
    '''One Corporate operational table claim released; remaining assignment retained.''',
    '''One operational table claim released; remaining assignment retained.'''
  );

  execute v_definition;
end;
$$;

revoke all on function public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid)
  to service_role;
