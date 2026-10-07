create or replace function public.get_admin_booking_page(
  p_authorized_venues text[],
  p_filters jsonb,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with input as (
  select
    greatest(1, least(coalesce(p_page_size, 10), 10000)) as page_size,
    greatest(1, coalesce(p_page, 1)) as page_number,
    lower(trim(coalesce(p_filters->>'search', ''))) as search,
    coalesce(p_filters->>'kind', 'standard') as kind,
    coalesce(p_filters->>'archive', 'active') as archive,
    coalesce(p_filters->>'location', 'all') as location,
    coalesce(p_filters->>'show', 'all') as show_filter,
    coalesce(p_filters->>'bookingDate', 'all') as booking_date,
    nullif(p_filters->>'performanceFrom', '')::date as performance_from,
    nullif(p_filters->>'performanceTo', '')::date as performance_to,
    nullif(p_filters->>'createdFrom', '')::timestamptz as created_from,
    nullif(p_filters->>'createdToExclusive', '')::timestamptz as created_to,
    coalesce(p_filters->>'createdBy', 'all') as created_by,
    coalesce(p_filters->>'bookingStatus', 'all') as booking_status,
    coalesce(p_filters->>'paymentStatus', 'all') as payment_status,
    coalesce(p_filters->>'seatingZone', 'all') as seating_zone,
    coalesce(p_filters->>'source', 'all') as source,
    coalesce(p_filters->>'promo', 'all') as promo,
    coalesce((p_filters->>'hideCancelled')::boolean, true) as hide_cancelled,
    coalesce(p_filters->>'sortKey', 'createdAt') as sort_key,
    coalesce(p_filters->>'sortDirection', 'desc') as sort_direction
), candidates as (
  select
    b.id,
    b.booking_reference,
    b.created_at,
    b.guest_count,
    b.amount_paid,
    b.balance_outstanding,
    b.payment_status::text,
    coalesce(b.section, '') as section,
    coalesce(c.first_name, '') || ' ' || coalesce(c.surname, '') as customer_name,
    s.date as show_date,
    coalesce(st.table_code, '') as table_code,
    coalesce(b.booking_source, '') as booking_source,
    coalesce(pc.code, '') as promo_code,
    case
      when lower(s.venue) like '%johannesburg%' then 'johannesburg'
      when lower(s.venue) like '%cape town%' then 'cape-town'
      else lower(replace(s.venue, ' ', '-'))
    end as venue_key,
    case
      when b.booking_origin = 'customer_public' then 'customer_public'
      when b.booking_origin = 'data_import' then 'data_import'
      when b.booking_origin = 'corporate' and b.corporate_request_id is not null then 'corporate_conversion'
      when b.booking_origin in ('admin_staff', 'corporate') then 'staff_internal'
      when b.booking_origin is null or b.booking_origin = 'legacy_unknown' then 'legacy_unknown'
      else 'other'
    end as source_key
  from public.bookings b
  join public.shows s on s.id = b.show_id
  join public.customers c on c.id = b.customer_id
  left join public.show_tables st on st.id = b.table_id
  left join public.promo_redemptions pr on pr.booking_id = b.id
  left join public.promo_codes pc on pc.id = pr.promo_code_id
  cross join input i
  where
    (('all' = any(coalesce(p_authorized_venues, '{}'::text[]))) or
      (case when lower(s.venue) like '%johannesburg%' then 'johannesburg'
            when lower(s.venue) like '%cape town%' then 'cape-town'
            else lower(replace(s.venue, ' ', '-')) end) = any(coalesce(p_authorized_venues, '{}'::text[])))
    and ((i.kind = 'corporate' and b.booking_source = 'corporate-direct') or
         (i.kind = 'standard' and b.booking_source <> 'corporate-direct'))
    and (i.archive = 'all' or (i.archive = 'active' and b.archived_at is null) or (i.archive = 'archived' and b.archived_at is not null))
    and (i.location = 'all' or (case when lower(s.venue) like '%johannesburg%' then 'johannesburg' when lower(s.venue) like '%cape town%' then 'cape-town' else lower(replace(s.venue, ' ', '-')) end) = i.location)
    and (i.show_filter = 'all' or b.show_id::text = i.show_filter)
    and (i.booking_date = 'all' or s.date::text = i.booking_date)
    and (i.performance_from is null or s.date >= i.performance_from)
    and (i.performance_to is null or s.date <= i.performance_to)
    and (i.created_from is null or b.created_at >= i.created_from)
    and (i.created_to is null or b.created_at < i.created_to)
    and (i.created_by = 'all' or b.created_by_staff_id::text = i.created_by)
    and (i.booking_status = 'all' or replace(b.booking_status::text, '_', '-') = i.booking_status)
    and (i.payment_status = 'all' or replace(b.payment_status::text, '_', '-') = i.payment_status)
    and (i.seating_zone = 'all' or replace(lower(coalesce(b.section, '')), ' ', '-') = i.seating_zone or exists (
      select 1 from jsonb_array_elements(coalesce(b.zone_entitlements, '[]'::jsonb)) zone
      where zone->>'zoneId' = i.seating_zone
    ))
    and (i.source = 'all' or i.source = case
      when b.booking_origin = 'customer_public' then 'customer_public'
      when b.booking_origin = 'data_import' then 'data_import'
      when b.booking_origin = 'corporate' and b.corporate_request_id is not null then 'corporate_conversion'
      when b.booking_origin in ('admin_staff', 'corporate') then 'staff_internal'
      when b.booking_origin is null or b.booking_origin = 'legacy_unknown' then 'legacy_unknown'
      else 'other' end)
    and (i.promo = 'all' or (i.promo = 'none' and pc.code is null) or upper(pc.code) = upper(i.promo))
    and (not i.hide_cancelled or i.booking_status = 'cancelled' or i.archive = 'archived' or b.booking_status <> 'cancelled')
    and (i.search = '' or lower(concat_ws(' ', b.booking_reference, b.company_name, c.first_name, c.surname, c.email, c.mobile, st.table_code, b.section, s.name, s.venue, s.date::text, s.time::text, b.booking_status::text, b.payment_status::text, b.guest_count::text)) like '%' || i.search || '%')
), ordered as (
  select c.*
  from candidates c cross join input i
  order by
    case when i.sort_key = 'name' and i.sort_direction = 'asc' then lower(c.customer_name) end asc,
    case when i.sort_key = 'name' and i.sort_direction = 'desc' then lower(c.customer_name) end desc,
    case when i.sort_key = 'pax' and i.sort_direction = 'asc' then c.guest_count end asc,
    case when i.sort_key = 'pax' and i.sort_direction = 'desc' then c.guest_count end desc,
    case when i.sort_key = 'amountPaid' and i.sort_direction = 'asc' then c.amount_paid end asc,
    case when i.sort_key = 'amountPaid' and i.sort_direction = 'desc' then c.amount_paid end desc,
    case when i.sort_key = 'balance' and i.sort_direction = 'asc' then c.balance_outstanding end asc,
    case when i.sort_key = 'balance' and i.sort_direction = 'desc' then c.balance_outstanding end desc,
    case when i.sort_key = 'showDate' and i.sort_direction = 'asc' then c.show_date end asc,
    case when i.sort_key = 'showDate' and i.sort_direction = 'desc' then c.show_date end desc,
    case when i.sort_key = 'payment' and i.sort_direction = 'asc' then c.payment_status end asc,
    case when i.sort_key = 'payment' and i.sort_direction = 'desc' then c.payment_status end desc,
    case when i.sort_key = 'section' and i.sort_direction = 'asc' then c.section end asc,
    case when i.sort_key = 'section' and i.sort_direction = 'desc' then c.section end desc,
    case when i.sort_key = 'source' and i.sort_direction = 'asc' then c.booking_source end asc,
    case when i.sort_key = 'source' and i.sort_direction = 'desc' then c.booking_source end desc,
    case when i.sort_key = 'table' and i.sort_direction = 'asc' then c.table_code end asc,
    case when i.sort_key = 'table' and i.sort_direction = 'desc' then c.table_code end desc,
    case when i.sort_direction = 'asc' then c.created_at end asc,
    case when i.sort_direction = 'desc' then c.created_at end desc,
    c.id desc
), page_rows as (
  select o.id
  from ordered o
  offset (select (page_number - 1) * page_size from input)
  limit (select page_size from input)
)
select jsonb_build_object(
  'total', (select count(*) from candidates),
  'archivedTotal', (
    select count(*)
    from public.bookings b
    join public.shows s on s.id = b.show_id
    cross join input i
    where b.archived_at is not null
      and ((i.kind = 'corporate' and b.booking_source = 'corporate-direct') or
           (i.kind = 'standard' and b.booking_source <> 'corporate-direct'))
      and (('all' = any(coalesce(p_authorized_venues, '{}'::text[]))) or
        (case when lower(s.venue) like '%johannesburg%' then 'johannesburg'
              when lower(s.venue) like '%cape town%' then 'cape-town'
              else lower(replace(s.venue, ' ', '-')) end) = any(coalesce(p_authorized_venues, '{}'::text[])))
  ),
  'ids', coalesce((select jsonb_agg(id) from page_rows), '[]'::jsonb)
);
$$;

revoke all on function public.get_admin_booking_page(text[], jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.get_admin_booking_page(text[], jsonb, integer, integer) to service_role;
