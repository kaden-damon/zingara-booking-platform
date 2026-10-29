-- Prospective, server-authoritative public booking failure and recovery reporting.

create index if not exists platform_events_booking_rejection_date_idx
  on public.platform_events (created_at desc)
  where event_type = 'booking_attempt_rejected';

create index if not exists platform_events_booking_rejection_venue_idx
  on public.platform_events ((metadata ->> 'venue'), created_at desc)
  where event_type = 'booking_attempt_rejected';

create index if not exists platform_events_booking_rejection_performance_idx
  on public.platform_events ((metadata ->> 'performanceId'), created_at desc)
  where event_type = 'booking_attempt_rejected';

create or replace function public.get_booking_failure_recovery_report(
  p_from date,
  p_to date,
  p_venue text default 'all',
  p_performance_date date default null,
  p_zone text default 'all',
  p_failure_reason text default 'all',
  p_page integer default 0,
  p_page_size integer default 25
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
    ((p_to + 1)::timestamp at time zone 'Africa/Johannesburg') as ends_at,
    greatest(coalesce(p_page, 0), 0) as page_number,
    least(greatest(coalesce(p_page_size, 25), 1), 50) as page_size
),
base_failures as (
  select
    event.id,
    event.booking_reference,
    event.created_at,
    event.journey_id,
    event.metadata ->> 'failureReason' as failure_reason,
    event.metadata ->> 'performanceDate' as performance_date,
    event.metadata ->> 'performanceId' as performance_id,
    event.metadata ->> 'section' as seating_zone,
    event.metadata ->> 'venue' as venue,
    case when event.metadata ->> 'quotedValue' ~ '^[0-9]+([.][0-9]+)?$'
      then (event.metadata ->> 'quotedValue')::numeric else 0 end as quoted_value,
    case when event.metadata ->> 'requestedGuests' ~ '^[0-9]+$'
      then (event.metadata ->> 'requestedGuests')::integer else 0 end as requested_guests,
    event.status_code
  from public.platform_events event
  cross join bounds
  where event.event_type = 'booking_attempt_rejected'
    and event.journey_id is not null
    and event.metadata ->> 'environment' = 'production'
    and event.created_at >= bounds.starts_at
    and event.created_at < bounds.ends_at
),
matching_journeys as (
  select distinct failure.journey_id
  from base_failures failure
  where (p_venue = 'all' or failure.venue = p_venue)
    and (p_performance_date is null or failure.performance_date = p_performance_date::text)
    and (p_zone = 'all' or failure.seating_zone = p_zone)
    and (p_failure_reason = 'all' or failure.failure_reason = p_failure_reason)
),
journey_failures as (
  select
    failure.journey_id,
    count(*)::integer as failed_attempts,
    min(failure.created_at) as first_failed_at,
    max(failure.created_at) as last_failed_at,
    max(failure.requested_guests)::integer as requested_guests,
    max(failure.quoted_value)::numeric as potential_value,
    (array_agg(failure.performance_id order by failure.created_at desc))[1] as performance_id,
    (array_agg(failure.performance_date order by failure.created_at desc))[1] as performance_date,
    (array_agg(failure.venue order by failure.created_at desc))[1] as venue,
    (array_agg(failure.seating_zone order by failure.created_at desc))[1] as seating_zone,
    (array_agg(failure.failure_reason order by failure.created_at desc))[1] as latest_failure_reason,
    jsonb_agg(jsonb_build_object(
      'at', failure.created_at,
      'bookingReference', failure.booking_reference,
      'failureReason', failure.failure_reason,
      'performanceDate', failure.performance_date,
      'performanceId', failure.performance_id,
      'quotedValue', failure.quoted_value,
      'requestedGuests', failure.requested_guests,
      'seatingZone', failure.seating_zone,
      'statusCode', failure.status_code,
      'venue', failure.venue
    ) order by failure.created_at) as timeline
  from base_failures failure
  join matching_journeys matching using (journey_id)
  group by failure.journey_id
),
enriched as (
  select
    journey.*,
    recovery.booking_reference as successful_booking_reference,
    booking.amount_paid,
    booking.booking_status::text as booking_status,
    booking.payment_status::text as payment_status,
    booking.total_amount,
    case
      when recovery.booking_reference is not null then 'recovered'
      when cancellation.id is not null then 'abandoned'
      else 'unresolved'
    end as outcome
  from journey_failures journey
  left join lateral (
    select event.booking_reference
    from public.platform_events event
    where event.journey_id = journey.journey_id
      and event.created_at >= journey.first_failed_at
      and event.event_type in ('booking_reserved', 'booking_completed', 'payment_confirmed')
      and event.booking_reference is not null
    order by event.created_at
    limit 1
  ) recovery on true
  left join public.bookings booking
    on booking.booking_reference = recovery.booking_reference
  left join lateral (
    select event.id
    from public.platform_events event
    where event.journey_id = journey.journey_id
      and event.created_at >= journey.first_failed_at
      and event.event_type = 'payfast_returned'
      and lower(coalesce(event.metadata ->> 'paymentState', '')) = 'cancelled'
    order by event.created_at
    limit 1
  ) cancellation on true
),
summary as (
  select
    count(*)::integer as failed_journeys,
    coalesce(sum(failed_attempts), 0)::integer as total_attempts,
    count(*) filter (where outcome = 'recovered')::integer as recovered_journeys,
    count(*) filter (where outcome = 'abandoned')::integer as abandoned_journeys,
    count(*) filter (where outcome = 'unresolved')::integer as unresolved_journeys,
    coalesce(sum(requested_guests), 0)::integer as requested_guests,
    coalesce(sum(potential_value), 0)::numeric as potential_value
  from enriched
),
page_rows as (
  select enriched.*
  from enriched
  cross join bounds
  order by last_failed_at desc
  limit (select page_size from bounds)
  offset (select page_number * page_size from bounds)
)
select jsonb_build_object(
  'asOf', now(),
  'from', p_from,
  'to', p_to,
  'page', (select page_number from bounds),
  'pageSize', (select page_size from bounds),
  'summary', (select to_jsonb(summary) from summary),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
    'abandoned', row.outcome = 'abandoned',
    'amountPaid', coalesce(row.amount_paid, 0),
    'bookingStatus', row.booking_status,
    'failedAttempts', row.failed_attempts,
    'firstFailedAt', row.first_failed_at,
    'journeyId', row.journey_id,
    'lastFailedAt', row.last_failed_at,
    'latestFailureReason', row.latest_failure_reason,
    'outcome', row.outcome,
    'paymentStatus', row.payment_status,
    'performanceDate', row.performance_date,
    'performanceId', row.performance_id,
    'potentialValue', row.potential_value,
    'requestedGuests', row.requested_guests,
    'seatingZone', row.seating_zone,
    'successfulBookingReference', row.successful_booking_reference,
    'timeline', row.timeline,
    'totalAmount', coalesce(row.total_amount, 0),
    'venue', row.venue
  ) order by row.last_failed_at desc) from page_rows row), '[]'::jsonb)
);
$$;

revoke all on function public.get_booking_failure_recovery_report(
  date, date, text, date, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_booking_failure_recovery_report(
  date, date, text, date, text, text, integer, integer
) to service_role;
