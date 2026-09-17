-- Phase 41.2O-B: public sales state does not determine whether authorised
-- staff may amend the guest count on an existing eligible booking. Preserve
-- the current reconciliation implementations and remove only that coupling.

begin;

do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_guard text;
begin
  v_function := to_regprocedure(
    'public.reconcile_booking_guest_count_financials_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'GUEST_COUNT_RECONCILIATION_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);
  v_guard := E'  if p_guest_count > v_booking.guest_count and v_show.status::text <> ''active'' then\n    raise exception ''SHOW_NOT_ACTIVE'';\n  end if;\n';
  if position(v_guard in v_definition) = 0 then
    raise exception 'GUEST_COUNT_SALES_STATUS_GUARD_NOT_FOUND';
  end if;
  execute replace(v_definition, v_guard, '');

  v_function := to_regprocedure(
    'public.reconcile_legacy_booking_guest_count_financials_atomic(text,timestamp with time zone,integer,text,text,numeric,uuid,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'LEGACY_GUEST_COUNT_RECONCILIATION_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);
  v_guard := E'  if v_show.status::text <> ''active'' then raise exception ''SHOW_NOT_ACTIVE''; end if;\n';
  if position(v_guard in v_definition) = 0 then
    raise exception 'LEGACY_GUEST_COUNT_SALES_STATUS_GUARD_NOT_FOUND';
  end if;
  execute replace(v_definition, v_guard, '');

  if exists (
    select 1
      from pg_proc function_definition
      join pg_namespace namespace on namespace.oid = function_definition.pronamespace
     where namespace.nspname = 'public'
       and function_definition.proname in (
         'reconcile_booking_guest_count_financials_atomic',
         'reconcile_legacy_booking_guest_count_financials_atomic'
       )
       and position('SHOW_NOT_ACTIVE' in pg_get_functiondef(function_definition.oid)) > 0
  ) then
    raise exception 'GUEST_COUNT_SALES_STATUS_GUARD_STILL_PRESENT';
  end if;
end;
$migration$;

commit;
