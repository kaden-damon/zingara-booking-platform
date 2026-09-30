-- Attribute conversions only to visitors and sessions that consented to analytics.

create or replace function public.get_website_conversion_analytics_v3(
  p_from date,
  p_to date,
  p_venue text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report jsonb;
  v_visitor_completed integer := 0;
  v_session_completed integer := 0;
begin
  v_report := public.get_website_conversion_analytics_v2(p_from, p_to, p_venue);

  with bounds as (
    select
      (p_from::timestamp at time zone 'Africa/Johannesburg') as starts_at,
      ((p_to + 1)::timestamp at time zone 'Africa/Johannesburg') as ends_at
  ),
  completed_bookings as (
    select
      b.booking_reference,
      case
        when lower(coalesce(s.venue, '')) like '%johannesburg%'
          or lower(coalesce(s.venue, '')) = 'jhb' then 'johannesburg'
        when lower(coalesce(s.venue, '')) like '%cape%'
          or lower(coalesce(s.venue, '')) = 'cpt' then 'cape-town'
        else null
      end as venue_key
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    join public.shows s on s.id = b.show_id
    cross join bounds range
    where b.booking_origin = 'customer_public'
      and b.booking_source = 'online'
      and b.created_at >= range.starts_at
      and b.created_at < range.ends_at
      and b.public_checkout_superseded_by is null
      and b.payment_status::text in ('fully_paid', 'deposit_paid')
      and not (
        lower(trim(concat_ws(' ', c.first_name, c.surname)))
          ~ '^(test|demo|qa)([[:space:]]+(test|demo|qa))?$'
        or lower(coalesce(c.email, ''))
          ~ '(^|[.+_-])(test|demo|qa)([.+_@-]|$)'
        or lower(coalesce(c.email, '')) like '%@example.com'
      )
  ),
  attributed as (
    select distinct
      e.booking_reference,
      e.session_id,
      e.metadata->>'visitorId' as visitor_id
    from public.platform_events e
    join completed_bookings b on b.booking_reference = e.booking_reference
    cross join bounds range
    where e.event_type = 'payment_initiated'
      and e.created_at >= range.starts_at
      and e.created_at < range.ends_at
      and e.session_id is not null
      and e.metadata->>'visitorId' ~ '^visitor_[A-Za-z0-9_-]{24,80}$'
      and coalesce(e.metadata->>'environment', 'production') = 'production'
      and coalesce(e.metadata->>'trafficKind', 'human') <> 'automated'
      and (p_venue = 'all' or b.venue_key = p_venue)
  )
  select
    count(distinct booking_reference)::integer,
    count(distinct booking_reference)::integer
  into v_visitor_completed, v_session_completed
  from attributed;

  v_report := jsonb_set(
    v_report,
    '{totals,visitor_completed_bookings}',
    to_jsonb(v_visitor_completed),
    true
  );
  v_report := jsonb_set(
    v_report,
    '{totals,session_completed_bookings}',
    to_jsonb(v_session_completed),
    true
  );

  return v_report;
end;
$$;

revoke all on function public.get_website_conversion_analytics_v3(date, date, text)
  from public, anon, authenticated;
grant execute on function public.get_website_conversion_analytics_v3(date, date, text)
  to service_role;
