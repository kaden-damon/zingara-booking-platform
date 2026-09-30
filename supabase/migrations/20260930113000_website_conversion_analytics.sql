-- Privacy-conscious website traffic and authoritative public booking conversion reporting.

create or replace function public.get_website_conversion_analytics(
  p_from date,
  p_to date,
  p_venue text default 'all'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with bounds as (
  select
    (p_from::timestamp at time zone 'Africa/Johannesburg') as starts_at,
    ((p_to + 1)::timestamp at time zone 'Africa/Johannesburg') as ends_at
),
event_candidates as (
  select
    e.*,
    (e.created_at at time zone 'Africa/Johannesburg')::date as report_date,
    coalesce(
      nullif(e.metadata->>'location', ''),
      case
        when lower(coalesce(bs.venue, '')) like '%johannesburg%'
          or lower(coalesce(bs.venue, '')) = 'jhb' then 'johannesburg'
        when lower(coalesce(bs.venue, '')) like '%cape%'
          or lower(coalesce(bs.venue, '')) = 'cpt' then 'cape-town'
        else null
      end,
      journey_location.location
    ) as resolved_location
  from public.platform_events e
  left join public.bookings bb on bb.booking_reference = e.booking_reference
  left join public.shows bs on bs.id = bb.show_id
  left join lateral (
    select prior.metadata->>'location' as location
    from public.platform_events prior
    where e.session_id is not null
      and prior.session_id = e.session_id
      and prior.created_at <= e.created_at
      and prior.created_at >= e.created_at - interval '4 hours'
      and prior.metadata->>'location' in ('cape-town', 'johannesburg')
    order by prior.created_at desc
    limit 1
  ) journey_location on true
  cross join bounds b
  where e.created_at >= b.starts_at
    and e.created_at < b.ends_at
    and coalesce(e.metadata->>'environment', 'production') = 'production'
    and coalesce(e.metadata->>'trafficKind', 'human') <> 'automated'
),
events as (
  select *
  from event_candidates
  where p_venue = 'all' or resolved_location = p_venue
),
booking_rows as (
  select
    b.*,
    (b.created_at at time zone 'Africa/Johannesburg')::date as report_date,
    case
      when lower(coalesce(s.venue, '')) like '%johannesburg%'
        or lower(coalesce(s.venue, '')) = 'jhb' then 'johannesburg'
      when lower(coalesce(s.venue, '')) like '%cape%'
        or lower(coalesce(s.venue, '')) = 'cpt' then 'cape-town'
      else null
    end as venue_key,
    (
      lower(trim(concat_ws(' ', c.first_name, c.surname)))
        ~ '^(test|demo|qa)([[:space:]]+(test|demo|qa))?$'
      or lower(coalesce(c.email, ''))
        ~ '(^|[.+_-])(test|demo|qa)([.+_@-]|$)'
      or lower(coalesce(c.email, '')) like '%@example.com'
    ) as is_synthetic
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.shows s on s.id = b.show_id
  cross join bounds range
  where b.booking_origin = 'customer_public'
    and b.booking_source = 'online'
    and b.created_at >= range.starts_at
    and b.created_at < range.ends_at
    and b.public_checkout_superseded_by is null
),
bookings as (
  select
    *,
    payment_status::text in ('fully_paid', 'deposit_paid') as is_completed,
    payment_status::text = 'pending_payment'
      and (archived_at is not null or booking_status::text = 'cancelled')
      as is_abandoned_hold
  from booking_rows
  where not is_synthetic
    and (p_venue = 'all' or venue_key = p_venue)
),
dates as (
  select day::date as report_date
  from generate_series(p_from, p_to, interval '1 day') day
),
event_daily as (
  select
    report_date,
    count(*) filter (where event_type = 'site_view')::integer as site_views,
    count(distinct metadata->>'visitorId') filter (
      where event_type = 'site_view'
        and metadata->>'visitorId' ~ '^visitor_[A-Za-z0-9_-]{24,80}$'
    )::integer as visitors,
    count(distinct session_id) filter (
      where event_type = 'session_started'
    )::integer as sessions,
    count(*) filter (where event_type = 'journey_started')::integer
      as recorded_journey_starts,
    count(*) filter (where event_type = 'show_selected')::integer
      as performance_selected,
    count(*) filter (where event_type = 'seating_selected')::integer
      as seating_selected,
    count(*) filter (
      where event_type = 'guest_details_completed'
    )::integer as guest_details_reached,
    count(distinct booking_reference) filter (
      where event_type = 'payment_initiated'
        and booking_reference is not null
    )::integer as payment_started
  from events
  group by report_date
),
booking_daily as (
  select
    report_date,
    count(*) filter (where is_completed)::integer as completed_bookings,
    coalesce(sum(guest_count) filter (where is_completed), 0)::integer
      as completed_guests,
    coalesce(sum(total_amount) filter (where is_completed), 0)::numeric
      as completed_booking_value,
    count(*) filter (where not is_completed and not is_abandoned_hold)::integer
      as active_incomplete_bookings,
    count(*) filter (where is_abandoned_hold)::integer as abandoned_holds
  from bookings
  group by report_date
),
daily as (
  select
    d.report_date,
    coalesce(e.site_views, 0) as site_views,
    coalesce(e.visitors, 0) as visitors,
    coalesce(e.sessions, 0) as sessions,
    coalesce(e.recorded_journey_starts, 0) as recorded_journey_starts,
    coalesce(e.performance_selected, 0) as performance_selected,
    coalesce(e.seating_selected, 0) as seating_selected,
    coalesce(e.guest_details_reached, 0) as guest_details_reached,
    coalesce(e.payment_started, 0) as payment_started,
    coalesce(b.completed_bookings, 0) as completed_bookings,
    coalesce(b.completed_guests, 0) as completed_guests,
    coalesce(b.completed_booking_value, 0) as completed_booking_value,
    coalesce(b.active_incomplete_bookings, 0) as active_incomplete_bookings,
    coalesce(b.abandoned_holds, 0) as abandoned_holds
  from dates d
  left join event_daily e using (report_date)
  left join booking_daily b using (report_date)
),
traffic_totals as (
  select
    count(*) filter (where event_type = 'site_view')::integer as site_views,
    count(distinct metadata->>'visitorId') filter (
      where event_type = 'site_view'
        and metadata->>'visitorId' ~ '^visitor_[A-Za-z0-9_-]{24,80}$'
    )::integer as visitors,
    count(distinct session_id) filter (
      where event_type = 'session_started'
    )::integer as sessions,
    count(*) filter (where event_type = 'journey_started')::integer
      as recorded_journey_starts,
    count(*) filter (where event_type = 'show_selected')::integer
      as performance_selected,
    count(*) filter (where event_type = 'seating_selected')::integer
      as seating_selected,
    count(*) filter (
      where event_type = 'guest_details_completed'
    )::integer as guest_details_reached,
    count(distinct booking_reference) filter (
      where event_type = 'payment_initiated'
        and booking_reference is not null
    )::integer as payment_started
  from events
),
booking_totals as (
  select
    count(*) filter (where is_completed)::integer as completed_bookings,
    coalesce(sum(guest_count) filter (where is_completed), 0)::integer
      as completed_guests,
    coalesce(sum(total_amount) filter (where is_completed), 0)::numeric
      as completed_booking_value,
    count(*) filter (where not is_completed and not is_abandoned_hold)::integer
      as active_incomplete_bookings,
    count(*) filter (where is_abandoned_hold)::integer as abandoned_holds
  from bookings
),
device_rows as (
  select metadata->>'device' as label, count(*)::integer as value
  from events
  where event_type = 'session_started'
    and metadata->>'device' in ('desktop', 'mobile', 'tablet')
  group by metadata->>'device'
),
source_rows as (
  select metadata->>'trafficSource' as label, count(*)::integer as value
  from events
  where event_type = 'session_started'
    and metadata ? 'trafficSource'
  group by metadata->>'trafficSource'
)
select jsonb_build_object(
  'asOf', now(),
  'from', p_from,
  'to', p_to,
  'venue', p_venue,
  'legacyFunnelAvailableFrom', (
    select min(created_at) from public.platform_events
    where event_type = 'journey_started'
  ),
  'visitorTrackingAvailableFrom', (
    select min(created_at) from public.platform_events
    where event_type = 'site_view'
      and metadata->>'environment' = 'production'
  ),
  'sessionTrackingAvailableFrom', (
    select min(created_at) from public.platform_events
    where event_type = 'session_started'
      and metadata->>'environment' = 'production'
  ),
  'totals', (select to_jsonb(t) from (
    select traffic_totals.*, booking_totals.*
    from traffic_totals cross join booking_totals
  ) t),
  'daily', coalesce((
    select jsonb_agg(to_jsonb(d) order by report_date) from daily d
  ), '[]'::jsonb),
  'devices', coalesce((
    select jsonb_agg(to_jsonb(r) order by value desc, label) from device_rows r
  ), '[]'::jsonb),
  'sources', coalesce((
    select jsonb_agg(to_jsonb(r) order by value desc, label) from source_rows r
  ), '[]'::jsonb)
);
$$;

revoke all on function public.get_website_conversion_analytics(date, date, text)
  from public, anon, authenticated;
grant execute on function public.get_website_conversion_analytics(date, date, text)
  to service_role;
