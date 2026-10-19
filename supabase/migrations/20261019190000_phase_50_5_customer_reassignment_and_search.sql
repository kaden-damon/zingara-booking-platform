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

create or replace function public.resolve_booking_company_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Customer reassignment and Company assignment are independent business actions.
  if tg_op = 'INSERT' and new.company_id is null and nullif(trim(new.company_name), '') is not null then
    select id into new.company_id
    from public.companies
    where normalised_name = public.normalise_company_match_key(new.company_name)
      and archived_at is null and merged_into_company_id is null
    limit 1;
  end if;
  if tg_op = 'INSERT' and new.company_id is null and new.customer_id is not null then
    select company_id into new.company_id
    from public.customers
    where id = new.customer_id and merged_into_customer_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_resolve_company_link on public.bookings;
create trigger bookings_resolve_company_link
  before insert or update of customer_id, company_id on public.bookings
  for each row execute function public.resolve_booking_company_link();

create or replace function public.reassign_booking_customer_atomic(
  p_booking_reference text,
  p_new_customer_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_lock_session_id text,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_request_id text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_before public.customers%rowtype;
  v_after public.customers%rowtype;
  v_venue text;
  v_venue_key text;
begin
  if lower(trim(coalesce(p_actor_role, ''))) not in ('super admin','venue manager','box office manager') then
    raise exception 'MANAGEMENT_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(upper(trim(p_booking_reference)), 0));
  select * into v_booking from public.bookings
  where upper(booking_reference) = upper(trim(p_booking_reference)) for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at <> p_expected_updated_at then raise exception 'BOOKING_CHANGED'; end if;

  select venue into v_venue from public.shows where id = v_booking.show_id;
  v_venue_key := case
    when lower(v_venue) like '%johannesburg%' then 'johannesburg'
    when lower(v_venue) like '%cape town%' then 'cape-town'
    else lower(replace(v_venue, ' ', '-')) end;
  if not ('all' = any(coalesce(p_actor_location_scope, '{}'::text[])))
     and not (v_venue_key = any(coalesce(p_actor_location_scope, '{}'::text[]))) then
    raise exception 'VENUE_SCOPE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.booking_edit_locks lock
    where lock.booking_reference = v_booking.booking_reference
      and lock.staff_profile_id = p_actor_staff_profile_id
      and lock.session_id = p_lock_session_id
      and lock.released_at is null
      and lock.last_activity_at > now() - interval '3 minutes'
  ) then raise exception 'BOOKING_LOCK_REQUIRED'; end if;

  select * into v_before from public.customers where id = v_booking.customer_id;
  select * into v_after from public.customers
  where id = p_new_customer_id and merged_into_customer_id is null
    and preferences->>'archivedAt' is null;
  if not found then raise exception 'CUSTOMER_NOT_AVAILABLE'; end if;
  if v_booking.customer_id = p_new_customer_id then
    return jsonb_build_object('bookingReference', v_booking.booking_reference, 'customerId', p_new_customer_id, 'idempotent', true);
  end if;

  update public.bookings set customer_id = p_new_customer_id, updated_at = now()
  where id = v_booking.id returning * into v_booking;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.customer-reassigned', p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'),
    p_actor_name, p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('customer_id', v_after.id, 'customer_name', trim(v_after.first_name || ' ' || coalesce(v_after.surname, '')), 'company_id', v_booking.company_id),
    jsonb_build_object('customer_id', v_before.id, 'customer_name', trim(v_before.first_name || ' ' || coalesce(v_before.surname, '')), 'company_id', v_booking.company_id),
    array['customer_id'], v_booking.id::text, v_booking.booking_reference, 'booking',
    'success', left(trim(p_reason), 1000), p_request_id, 'Bookings', p_user_agent
  );
  return jsonb_build_object('bookingReference', v_booking.booking_reference, 'customerId', p_new_customer_id, 'updatedAt', v_booking.updated_at, 'idempotent', false);
end;
$$;

revoke all on function public.reassign_booking_customer_atomic(text,uuid,timestamptz,text,text,uuid,uuid,text,text,text[],text,text) from public, anon, authenticated;
grant execute on function public.reassign_booking_customer_atomic(text,uuid,timestamptz,text,text,uuid,uuid,text,text,text[],text,text) to service_role;

create or replace function public.reconcile_verified_corporate_company_links_phase_50_5()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created integer := 0;
  v_linked integer := 0;
  v_associations integer := 0;
begin
  create temporary table phase_50_5_verified on commit drop as
  select booking.id as booking_id, booking.booking_reference, booking.customer_id,
    trim(booking.company_name) as company_name,
    public.normalise_company_match_key(booking.company_name) as match_key
  from public.bookings booking
  where booking.booking_source = 'corporate-direct'
    and booking.company_id is null
    and nullif(trim(booking.company_name), '') is not null
    and (
      exists (
        select 1 from public.companies existing
        where existing.normalised_name = public.normalise_company_match_key(booking.company_name)
          and existing.archived_at is null and existing.merged_into_company_id is null
      )
      or (
        booking.notes like '__zingara_booking_meta__:%'
        and public.normalise_company_match_key(
          nullif(trim(substring((substring(booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb #>> '{operationalNotes}') from 'Company:[[:space:]]*(.*?)(?:[|]|$)')), '')
        ) = public.normalise_company_match_key(booking.company_name)
      )
    );

  with names as (
    select match_key, min(company_name) as company_name from phase_50_5_verified group by match_key
  ), inserted as (
    insert into public.companies (legal_name)
    select company_name from names
    on conflict (normalised_name) do nothing returning id, legal_name
  )
  select count(*) into v_created from inserted;

  insert into public.audit_events (
    actor_name, action, entity_type, entity_reference, entity_id, outcome,
    source_area, reason, before_values, after_values, changed_fields
  )
  select 'Phase 50.5 exact-evidence reconciliation', 'company.created', 'company', legal_name,
    id::text, 'success', 'Corporate Company Integrity',
    'Created from an exact immutable Corporate booking Company snapshot match.',
    '{}'::jsonb, jsonb_build_object('legal_name', legal_name), array['legal_name']
  from public.companies company
  where company.created_at >= transaction_timestamp()
    and company.normalised_name in (select match_key from phase_50_5_verified);

  with changed as (
    update public.bookings booking set company_id = company.id, updated_at = now()
    from phase_50_5_verified verified
    join public.companies company on company.normalised_name = verified.match_key
      and company.archived_at is null and company.merged_into_company_id is null
    where booking.id = verified.booking_id and booking.company_id is null
    returning booking.id, booking.booking_reference, booking.customer_id, booking.company_id
  )
  select count(*) into v_linked from changed;

  insert into public.audit_events (
    actor_name, action, entity_type, entity_reference, entity_id, outcome,
    source_area, reason, before_values, after_values, changed_fields
  )
  select 'Phase 50.5 exact-evidence reconciliation', 'booking.company-associated', 'booking',
    booking.booking_reference, booking.id::text, 'success', 'Corporate Company Integrity',
    'Linked from an exact authoritative Corporate booking Company identity.',
    jsonb_build_object('company_id', null, 'company_name', verified.company_name),
    jsonb_build_object('company_id', booking.company_id, 'company_name', verified.company_name),
    array['company_id']
  from phase_50_5_verified verified
  join public.bookings booking on booking.id = verified.booking_id
  where booking.company_id is not null;

  create temporary table phase_50_5_associations on commit drop as
  select distinct booking.customer_id, booking.company_id
  from public.bookings booking join phase_50_5_verified verified on verified.booking_id = booking.id
  where booking.company_id is not null
    and not exists (
      select 1 from public.customer_company_associations association
      where association.customer_id = booking.customer_id and association.company_id = booking.company_id
        and association.removed_at is null
    );

  insert into public.customer_company_associations (customer_id, company_id, created_at)
  select customer_id, company_id, now() from phase_50_5_associations;
  get diagnostics v_associations = row_count;

  insert into public.audit_events (
    actor_name, action, entity_type, entity_reference, entity_id, outcome,
    source_area, reason, before_values, after_values, changed_fields
  )
  select 'Phase 50.5 exact-evidence reconciliation', 'customer.company-linked', 'customer',
    trim(customer.first_name || ' ' || coalesce(customer.surname, '')), customer.id::text,
    'success', 'Corporate Company Integrity',
    'Associated from an exact authoritative Corporate booking Company identity.',
    '{}'::jsonb, jsonb_build_object('company_id', association.company_id), array['company_association']
  from phase_50_5_associations association
  join public.customers customer on customer.id = association.customer_id
  where association.company_id is not null;

  return jsonb_build_object('companiesCreated', v_created, 'bookingsLinked', v_linked, 'customerCompanyAssociationsCreated', v_associations);
end;
$$;

revoke all on function public.reconcile_verified_corporate_company_links_phase_50_5() from public, anon, authenticated;
grant execute on function public.reconcile_verified_corporate_company_links_phase_50_5() to service_role;

create or replace function public.restore_koos_myberg_phase_50_5_atomic()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_company public.companies%rowtype;
  v_metadata jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('ZNG-9VHFFH', 0));
  select * into v_booking from public.bookings where booking_reference = 'ZNG-9VHFFH' for update;
  if not found then raise exception 'KOOS_BOOKING_NOT_FOUND'; end if;
  if v_booking.customer_id in (
    select id from public.customers where lower(first_name) = 'koos' and lower(surname) = 'myberg'
  ) then
    return jsonb_build_object('bookingReference', v_booking.booking_reference, 'customerId', v_booking.customer_id, 'idempotent', true);
  end if;
  if v_booking.guest_count <> 80 or v_booking.section <> 'Middle Ring'
     or v_booking.total_amount <> 122400 or v_booking.amount_paid <> 0
     or v_booking.balance_outstanding <> 122400
     or public.normalise_company_match_key(v_booking.company_name) <> public.normalise_company_match_key('Events Cape Town') then
    raise exception 'KOOS_BOOKING_EVIDENCE_CHANGED';
  end if;
  if v_booking.notes not like '__zingara_booking_meta__:%' then raise exception 'KOOS_IMMUTABLE_EVIDENCE_MISSING'; end if;
  v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
  if lower(coalesce(v_metadata #>> '{customer,name}', '')) <> 'koos myberg'
     or lower(coalesce(v_metadata #>> '{customer,email}', '')) <> 'tracy@zingara.co.za' then
    raise exception 'KOOS_IMMUTABLE_IDENTITY_MISMATCH';
  end if;
  if not exists (
    select 1 from public.shows where id = v_booking.show_id and date = date '2026-11-05'
      and replace(lower(venue), '-', ' ') like '%cape town%'
  ) then raise exception 'KOOS_SHOW_EVIDENCE_CHANGED'; end if;

  select * into v_customer from public.customers
  where lower(first_name) = 'koos' and lower(surname) = 'myberg'
    and merged_into_customer_id is null and preferences->>'archivedAt' is null
  order by created_at limit 1 for update;
  if not found then
    insert into public.customers (first_name, surname, email, mobile, preferences, relationship_notes)
    values ('Koos', 'Myberg', null, null,
      jsonb_build_object('customerKey', 'phase-50-5:koos-myberg:zng-9vhffh', 'vipTags', '[]'::jsonb), '')
    returning * into v_customer;
    insert into public.audit_events (
      actor_name, action, entity_type, entity_reference, entity_id, outcome,
      source_area, reason, before_values, after_values, changed_fields
    ) values (
      'Phase 50.5 authorised correction', 'customer.create', 'customer', 'Koos Myberg',
      v_customer.id::text, 'success', 'Bookings',
      'Created from immutable booking evidence for ZNG-9VHFFH; no contact details transferred from Tracy Maltman.',
      '{}'::jsonb, jsonb_build_object('first_name', 'Koos', 'surname', 'Myberg', 'email', null, 'mobile', null),
      array['first_name','surname']
    );
  end if;

  select * into v_company from public.companies
  where normalised_name = public.normalise_company_match_key('Events Cape Town')
    and archived_at is null and merged_into_company_id is null
  limit 1 for update;
  if not found then raise exception 'KOOS_COMPANY_NOT_AVAILABLE'; end if;

  insert into public.customer_company_associations (customer_id, company_id, created_at)
  values (v_customer.id, v_company.id, now()) on conflict do nothing;

  update public.bookings
  set customer_id = v_customer.id, company_id = v_company.id, updated_at = now()
  where id = v_booking.id;

  insert into public.audit_events (
    actor_name, action, entity_type, entity_reference, entity_id, outcome,
    source_area, reason, before_values, after_values, changed_fields
  ) values (
    'Phase 50.5 authorised correction', 'booking.customer-reassigned', 'booking',
    v_booking.booking_reference, v_booking.id::text, 'success', 'Bookings',
    'Restored the authoritative customer and Company from immutable booking evidence.',
    jsonb_build_object('customer_id', v_booking.customer_id, 'company_id', v_booking.company_id),
    jsonb_build_object('customer_id', v_customer.id, 'customer_name', 'Koos Myberg', 'company_id', v_company.id, 'company_name', v_company.legal_name),
    array['customer_id','company_id']
  );
  return jsonb_build_object('bookingReference', v_booking.booking_reference, 'customerId', v_customer.id, 'companyId', v_company.id, 'idempotent', false);
end;
$$;

revoke all on function public.restore_koos_myberg_phase_50_5_atomic() from public, anon, authenticated;
grant execute on function public.restore_koos_myberg_phase_50_5_atomic() to service_role;
