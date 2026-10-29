-- P0: Corporate guest-count reductions lower the authoritative entitlement and
-- must not be rejected merely because a grandfathered zone remains over its
-- current operational limit. Increases retain the existing fail-closed guard.

begin;

do $migration$
declare
  v_function regprocedure := 'public.reconcile_corporate_booking_guest_count_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'::regprocedure;
  v_definition text;
  v_old_guard text := 'if v_limit is not null and v_existing_pax + p_guest_count > v_limit then';
  v_new_guard text := 'if p_guest_count > v_booking.guest_count
     and v_limit is not null
     and v_existing_pax + p_guest_count > v_limit then';
begin
  select pg_get_functiondef(v_function) into v_definition;

  if position(v_old_guard in v_definition) = 0 then
    raise exception 'CORPORATE_GUEST_COUNT_CAPACITY_GUARD_NOT_FOUND';
  end if;
  if position(v_new_guard in v_definition) > 0 then
    raise exception 'CORPORATE_GUEST_COUNT_CAPACITY_GUARD_ALREADY_CORRECTED';
  end if;

  v_definition := replace(v_definition, v_old_guard, v_new_guard);
  execute v_definition;
end;
$migration$;

revoke all on function public.reconcile_corporate_booking_guest_count_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reconcile_corporate_booking_guest_count_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) to service_role;

commit;
