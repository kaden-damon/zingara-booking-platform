do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.restore_koos_myberg_phase_50_5_atomic()'::regprocedure)
  into v_definition;
  v_updated := replace(
    v_definition,
    'lower(venue) like ''%cape town%''',
    'replace(lower(venue), ''-'', '' '') like ''%cape town%'''
  );
  if v_updated <> v_definition then execute v_updated; end if;
end;
$$;
