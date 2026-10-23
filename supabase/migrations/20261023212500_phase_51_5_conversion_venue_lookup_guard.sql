-- The lateral lookup is only needed when neither direct source can resolve venue.
do $migration$
declare
  v_definition text;
  v_search text := ') journey_location on true';
  v_replacement text := $replacement$) journey_location on
    nullif(e.metadata->>'location', '') is null
    and not (
      lower(coalesce(bs.venue, '')) like '%johannesburg%'
      or lower(coalesce(bs.venue, '')) = 'jhb'
      or lower(coalesce(bs.venue, '')) like '%cape%'
      or lower(coalesce(bs.venue, '')) = 'cpt'
    )$replacement$;
begin
  select pg_get_functiondef(
    'public.get_website_conversion_analytics(date,date,text)'::regprocedure
  )
  into v_definition;

  if position(v_search in v_definition) = 0 then
    raise exception 'Expected website conversion venue lookup join was not found';
  end if;

  execute replace(v_definition, v_search, v_replacement);
end
$migration$;
