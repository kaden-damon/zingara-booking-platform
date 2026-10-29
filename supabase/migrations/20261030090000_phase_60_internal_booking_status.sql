-- Phase 60: public show status does not replace internal operational capacity.
-- The service-only transfer RPC still performs all booking, zone, table and
-- concurrency checks; the authenticated API owns management approval policy.

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.transfer_booking_show_atomic(text,uuid,uuid,uuid,uuid,text,text,text[],text,text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception 'transfer_booking_show_atomic was not found';
  end if;

  v_updated := replace(
    v_definition,
    'v_destination_show.status::text not in (''active'', ''sold_out'')',
    'v_destination_show.status::text not in (''active'', ''inactive'', ''sold_out'', ''special_event'')'
  );

  if v_updated = v_definition then
    raise exception 'transfer_booking_show_atomic status guard did not match the expected baseline';
  end if;

  execute v_updated;
end
$$;

revoke all on function public.transfer_booking_show_atomic(
  text, uuid, uuid, uuid, uuid, text, text, text[], text, text
) from public, anon, authenticated;

grant execute on function public.transfer_booking_show_atomic(
  text, uuid, uuid, uuid, uuid, text, text, text[], text, text
) to service_role;
