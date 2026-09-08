-- Phase 41.1H-D: imported Corporate bookings retain data_import provenance,
-- but corporate-direct remains the authoritative operational booking type.
-- Patch the existing atomic assignment/release functions without changing
-- their locking, capacity, ownership, audit, or financial behavior.

do $$
declare
  v_definition text;
  v_original text;
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.assign_corporate_booking_tables_atomic(text,timestamptz,uuid[],jsonb,uuid,uuid)'::regprocedure,
    'public.release_corporate_booking_tables_atomic(text,timestamptz,uuid[],uuid,uuid)'::regprocedure,
    'public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    v_original := v_definition;
    v_definition := regexp_replace(
      v_definition,
      $pattern$if\s+v_booking\.booking_origin\s*<>\s*'corporate'\s+or\s+v_booking\.booking_source\s*<>\s*'corporate-direct'\s+then$pattern$,
      $replacement$if v_booking.booking_source <> 'corporate-direct'
     or v_booking.booking_origin not in ('corporate', 'data_import') then$replacement$,
      'i'
    );

    if v_definition = v_original then
      raise exception 'Expected Corporate floor eligibility guard was not found in %', v_signature;
    end if;

    execute v_definition;
  end loop;
end;
$$;

revoke all on function public.assign_corporate_booking_tables_atomic(text,timestamptz,uuid[],jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.assign_corporate_booking_tables_atomic(text,timestamptz,uuid[],jsonb,uuid,uuid)
  to service_role;

revoke all on function public.release_corporate_booking_tables_atomic(text,timestamptz,uuid[],uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.release_corporate_booking_tables_atomic(text,timestamptz,uuid[],uuid,uuid)
  to service_role;

revoke all on function public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.release_corporate_booking_table_atomic(text,uuid,timestamptz,uuid[],uuid,uuid)
  to service_role;
