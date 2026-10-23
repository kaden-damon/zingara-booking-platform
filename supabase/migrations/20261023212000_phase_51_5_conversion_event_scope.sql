-- Restrict conversion aggregation to the event types the report actually uses.
-- The guarded replacement preserves the established report function verbatim.
do $migration$
declare
  v_definition text;
  v_search text := 'where e.created_at >= b.starts_at';
  v_replacement text := $replacement$where e.event_type in (
      'site_view',
      'session_started',
      'journey_started',
      'show_selected',
      'seating_selected',
      'guest_details_completed',
      'payment_initiated'
    )
    and e.created_at >= b.starts_at$replacement$;
begin
  select pg_get_functiondef(
    'public.get_website_conversion_analytics(date,date,text)'::regprocedure
  )
  into v_definition;

  if position(v_search in v_definition) = 0 then
    raise exception 'Expected website conversion event-range predicate was not found';
  end if;

  execute replace(v_definition, v_search, v_replacement);
end
$migration$;
