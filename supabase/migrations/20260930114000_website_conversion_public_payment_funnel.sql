-- Restrict payment-start conversion to authoritative public online bookings.

create or replace function public.get_website_conversion_analytics_v2(
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
  v_payment_started integer := 0;
  v_payment_completed integer := 0;
begin
  v_report := public.get_website_conversion_analytics(p_from, p_to, p_venue);

  with bounds as (
    select
      (p_from::timestamp at time zone 'Africa/Johannesburg') as starts_at,
      ((p_to + 1)::timestamp at time zone 'Africa/Johannesburg') as ends_at
  ),
  eligible_bookings as (
    select
      b.booking_reference,
      b.payment_status::text in ('fully_paid', 'deposit_paid') as is_completed,
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
      and not (
        lower(trim(concat_ws(' ', c.first_name, c.surname)))
          ~ '^(test|demo|qa)([[:space:]]+(test|demo|qa))?$'
        or lower(coalesce(c.email, ''))
          ~ '(^|[.+_-])(test|demo|qa)([.+_@-]|$)'
        or lower(coalesce(c.email, '')) like '%@example.com'
      )
  ),
  payment_starts as (
    select distinct e.booking_reference, b.is_completed
    from public.platform_events e
    join eligible_bookings b on b.booking_reference = e.booking_reference
    cross join bounds range
    where e.event_type = 'payment_initiated'
      and e.created_at >= range.starts_at
      and e.created_at < range.ends_at
      and coalesce(e.metadata->>'environment', 'production') = 'production'
      and coalesce(e.metadata->>'trafficKind', 'human') <> 'automated'
      and (p_venue = 'all' or b.venue_key = p_venue)
  )
  select
    count(*)::integer,
    count(*) filter (where is_completed)::integer
  into v_payment_started, v_payment_completed
  from payment_starts;

  v_report := jsonb_set(
    v_report,
    '{totals,payment_started}',
    to_jsonb(v_payment_started),
    true
  );
  v_report := jsonb_set(
    v_report,
    '{totals,payment_completed}',
    to_jsonb(v_payment_completed),
    true
  );

  return v_report;
end;
$$;

revoke all on function public.get_website_conversion_analytics_v2(date, date, text)
  from public, anon, authenticated;
grant execute on function public.get_website_conversion_analytics_v2(date, date, text)
  to service_role;
