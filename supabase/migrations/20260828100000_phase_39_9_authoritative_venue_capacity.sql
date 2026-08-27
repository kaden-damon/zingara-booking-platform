-- Read future booking and operational-table ceilings from the authoritative
-- venue configuration. Existing rows are untouched and the capacity triggers
-- continue to preserve unchanged or reducing edits on over-capacity shows.

create or replace function public.booking_capacity_zone_limit(p_zone text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_configured text;
  v_fallback integer;
begin
  v_fallback := case p_zone
    when 'golden-circle' then 148
    when 'middle-ring' then 132
    when 'royal-booths' then 138
    when 'royal-balcony' then 40
    else null
  end;

  select vs.settings -> 'zonePricing' -> p_zone ->> 'maxSeats'
    into v_configured
    from public.venue_settings vs
   where vs.venue_key = 'zingara-cape-town'
   limit 1;

  if v_configured ~ '^[1-9][0-9]*$' then
    return v_configured::integer;
  end if;

  return v_fallback;
end
$$;

revoke all on function public.booking_capacity_zone_limit(text) from public;
grant execute on function public.booking_capacity_zone_limit(text) to anon, authenticated, service_role;
