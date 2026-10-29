-- Identity audit snapshots contain changed fields only. Combine former values
-- with unchanged current fields so a first-name-only edit remains searchable
-- by the complete historical name.

create or replace function public.search_customer_crm_page(
  p_search text,
  p_archived text default 'active',
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
with input as (
  select lower(trim(coalesce(p_search, ''))) as search,
    regexp_replace(coalesce(p_search, ''), '\D', '', 'g') as phone_search,
    case when p_archived in ('active','archived','all') then p_archived else 'active' end as archive,
    greatest(1, coalesce(p_page, 1)) as page_number,
    greatest(1, least(coalesce(p_page_size, 10), 25)) as page_size
), candidates as (
  select distinct customer.id, customer.updated_at
  from public.customers customer cross join input i
  where customer.merged_into_customer_id is null
    and (i.archive = 'all'
      or (i.archive = 'active' and customer.preferences->>'archivedAt' is null)
      or (i.archive = 'archived' and customer.preferences->>'archivedAt' is not null))
    and (i.search = ''
      or lower(concat_ws(' ', customer.first_name, customer.surname)) like '%' || i.search || '%'
      or lower(coalesce(customer.email, '')) like '%' || i.search || '%'
      or (length(i.phone_search) >= 3 and regexp_replace(coalesce(customer.mobile, ''), '\D', '', 'g') like '%' || i.phone_search || '%')
      or exists (
        select 1
        from public.audit_events identity_edit
        where identity_edit.entity_type = 'customer'
          and identity_edit.action = 'customer.identity_edit'
          and identity_edit.entity_id = customer.id::text
          and (
            lower(concat_ws(' ',
              coalesce(identity_edit.before_values->>'first_name', customer.first_name),
              coalesce(identity_edit.before_values->>'surname', customer.surname)
            )) like '%' || i.search || '%'
            or lower(coalesce(identity_edit.before_values->>'email', '')) like '%' || i.search || '%'
            or (length(i.phone_search) >= 3 and regexp_replace(
              coalesce(identity_edit.before_values->>'mobile', ''),
              '\D',
              '',
              'g'
            ) like '%' || i.phone_search || '%')
          )
      )
      or exists (
        select 1 from public.bookings booking
        where booking.customer_id = customer.id
          and lower(booking.booking_reference) like '%' || i.search || '%'
      )
      or exists (
        select 1
        from public.customer_company_associations association
        join public.companies company on company.id = association.company_id
        where association.customer_id = customer.id and association.removed_at is null
          and company.archived_at is null and company.merged_into_company_id is null
          and lower(concat_ws(' ', company.legal_name, company.trading_name)) like '%' || i.search || '%'
      )
      or exists (
        select 1 from public.bookings booking
        left join public.companies company on company.id = booking.company_id
        where booking.customer_id = customer.id
          and lower(concat_ws(' ', booking.company_name, company.legal_name, company.trading_name)) like '%' || i.search || '%'
      ))
), ordered as (
  select candidates.id
  from candidates cross join input
  order by candidates.updated_at desc, candidates.id desc
  offset (select (page_number - 1) * page_size from input)
  limit (select page_size from input)
)
select jsonb_build_object(
  'ids', coalesce((select jsonb_agg(id) from ordered), '[]'::jsonb),
  'total', (select count(*) from candidates)
);
$$;

revoke all on function public.search_customer_crm_page(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.search_customer_crm_page(text,text,integer,integer) to service_role;
