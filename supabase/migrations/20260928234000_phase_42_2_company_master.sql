-- Phase 42.2: Company master data, contact links, review queue, and safe customer merge.

create or replace function public.normalise_company_match_key(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
$$;

create or replace function public.normalise_company_review_key(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    trim(
      regexp_replace(
        coalesce(public.normalise_company_match_key(p_value), ''),
        '\s+(proprietary limited|pty ltd|limited|ltd|incorporated|inc|close corporation|cc)$',
        '',
        'g'
      )
    ),
    ''
  );
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) between 2 and 250),
  trading_name text,
  normalised_name text generated always as (public.normalise_company_match_key(legal_name)) stored,
  registration_number text,
  vat_number text,
  billing_email text,
  phone text,
  billing_address_line_1 text,
  billing_address_line_2 text,
  billing_suburb text,
  billing_city text,
  billing_province text,
  billing_postal_code text,
  billing_country text not null default 'South Africa',
  physical_address_different boolean not null default false,
  physical_address_line_1 text,
  physical_address_line_2 text,
  physical_suburb text,
  physical_city text,
  physical_province text,
  physical_postal_code text,
  physical_country text,
  primary_contact_customer_id uuid,
  archived_at timestamptz,
  archived_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  archive_reason text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  constraint companies_normalised_name_key unique (normalised_name),
  constraint companies_normalised_name_check check (normalised_name is not null),
  constraint companies_billing_email_check check (
    billing_email is null or billing_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

alter table public.customers
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists job_title text,
  add column if not exists merged_into_customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists crm_revision integer not null default 1 check (crm_revision > 0);

alter table public.companies
  drop constraint if exists companies_primary_contact_customer_id_fkey;
alter table public.companies
  add constraint companies_primary_contact_customer_id_fkey
  foreign key (primary_contact_customer_id) references public.customers(id) on delete set null;
alter table public.companies
  add column if not exists merged_into_company_id uuid references public.companies(id) on delete restrict;

alter table public.bookings
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.corporate_requests
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists contact_customer_id uuid references public.customers(id) on delete set null;

create table if not exists public.crm_data_review_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_type text not null check (
    candidate_type in ('company-variant', 'customer-duplicate', 'company-as-person')
  ),
  review_key text not null,
  subject_ids uuid[] not null check (cardinality(subject_ids) > 0),
  display_names text[] not null default '{}',
  reason text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'pending' check (
    status in ('pending', 'keep-separate', 'linked', 'merged', 'not-a-duplicate', 'dismissed')
  ),
  decision_note text,
  reviewed_at timestamptz,
  reviewed_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_data_review_candidates_identity_key unique (candidate_type, review_key)
);

create index if not exists companies_active_name_idx
  on public.companies (archived_at, legal_name);
create index if not exists companies_primary_contact_idx
  on public.companies (primary_contact_customer_id)
  where primary_contact_customer_id is not null;
create index if not exists companies_merged_into_idx
  on public.companies (merged_into_company_id)
  where merged_into_company_id is not null;
create index if not exists customers_company_idx
  on public.customers (company_id, surname, first_name)
  where company_id is not null;
create index if not exists customers_merged_into_idx
  on public.customers (merged_into_customer_id)
  where merged_into_customer_id is not null;
create index if not exists bookings_company_idx
  on public.bookings (company_id, created_at desc)
  where company_id is not null;
create index if not exists corporate_requests_company_idx
  on public.corporate_requests (company_id, created_at desc)
  where company_id is not null;
create index if not exists corporate_requests_contact_customer_idx
  on public.corporate_requests (contact_customer_id)
  where contact_customer_id is not null;
create index if not exists crm_data_review_candidates_pending_idx
  on public.crm_data_review_candidates (status, candidate_type, created_at desc);

alter table public.companies enable row level security;
alter table public.crm_data_review_candidates enable row level security;
revoke all on public.companies from public, anon, authenticated;
revoke all on public.crm_data_review_candidates from public, anon, authenticated;
grant select, insert, update on public.companies to service_role;
grant select, insert, update on public.crm_data_review_candidates to service_role;

create or replace function public.enforce_company_primary_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.primary_contact_customer_id is not null and not exists (
    select 1
    from public.customers customer
    where customer.id = new.primary_contact_customer_id
      and customer.company_id = new.id
      and customer.merged_into_customer_id is null
  ) then
    raise exception 'PRIMARY_CONTACT_NOT_LINKED';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists companies_primary_contact_guard on public.companies;
create trigger companies_primary_contact_guard
  before insert or update on public.companies
  for each row execute function public.enforce_company_primary_contact();

create or replace function public.resolve_booking_company_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is null and new.customer_id is not null then
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

create or replace function public.resolve_corporate_request_master_links()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is null and nullif(trim(new.company_name), '') is not null then
    select id into new.company_id
    from public.companies
    where normalised_name = public.normalise_company_match_key(new.company_name)
      and archived_at is null
    limit 1;
  end if;
  if new.contact_customer_id is null and nullif(lower(trim(new.email)), '') is not null then
    select id into new.contact_customer_id
    from public.customers
    where lower(trim(email)) = lower(trim(new.email))
      and merged_into_customer_id is null
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists corporate_requests_resolve_master_links on public.corporate_requests;
create trigger corporate_requests_resolve_master_links
  before insert or update of company_name, email, company_id, contact_customer_id
  on public.corporate_requests
  for each row execute function public.resolve_corporate_request_master_links();

create or replace function public.save_company_atomic(
  p_company_id uuid,
  p_expected_revision integer,
  p_payload jsonb,
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
set search_path = public
as $$
declare
  v_before public.companies%rowtype;
  v_after public.companies%rowtype;
  v_company_id uuid := coalesce(p_company_id, gen_random_uuid());
  v_legal_name text := left(trim(coalesce(p_payload->>'legalName', '')), 250);
  v_current_revision integer := 0;
begin
  if length(v_legal_name) < 2 then
    raise exception 'COMPANY_NAME_REQUIRED';
  end if;

  if p_company_id is not null then
    select * into v_before from public.companies where id = p_company_id for update;
    if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
    if v_before.merged_into_company_id is not null then raise exception 'COMPANY_ALREADY_MERGED'; end if;
    v_current_revision := v_before.revision;
  end if;

  if coalesce(p_expected_revision, 0) <> v_current_revision then
    raise exception 'COMPANY_CHANGED';
  end if;

  insert into public.companies (
    id, legal_name, trading_name, registration_number, vat_number,
    billing_email, phone, billing_address_line_1, billing_address_line_2,
    billing_suburb, billing_city, billing_province, billing_postal_code,
    billing_country, physical_address_different, physical_address_line_1,
    physical_address_line_2, physical_suburb, physical_city,
    physical_province, physical_postal_code, physical_country,
    primary_contact_customer_id, archived_at, archived_by_staff_profile_id,
    archive_reason, revision, created_by_staff_profile_id,
    updated_by_staff_profile_id, updated_at
  ) values (
    v_company_id,
    v_legal_name,
    nullif(left(trim(coalesce(p_payload->>'tradingName', '')), 250), ''),
    nullif(left(upper(regexp_replace(coalesce(p_payload->>'registrationNumber', ''), '\s+', '', 'g')), 100), ''),
    nullif(left(upper(regexp_replace(coalesce(p_payload->>'vatNumber', ''), '\s+', '', 'g')), 100), ''),
    nullif(left(lower(trim(coalesce(p_payload->>'billingEmail', ''))), 320), ''),
    nullif(left(trim(coalesce(p_payload->>'phone', '')), 100), ''),
    nullif(left(trim(coalesce(p_payload->>'billingAddressLine1', '')), 250), ''),
    nullif(left(trim(coalesce(p_payload->>'billingAddressLine2', '')), 250), ''),
    nullif(left(trim(coalesce(p_payload->>'billingSuburb', '')), 150), ''),
    nullif(left(trim(coalesce(p_payload->>'billingCity', '')), 150), ''),
    nullif(left(trim(coalesce(p_payload->>'billingProvince', '')), 150), ''),
    nullif(left(trim(coalesce(p_payload->>'billingPostalCode', '')), 30), ''),
    coalesce(nullif(left(trim(coalesce(p_payload->>'billingCountry', '')), 100), ''), 'South Africa'),
    coalesce((p_payload->>'physicalAddressDifferent')::boolean, false),
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalAddressLine1', '')), 250), '') end,
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalAddressLine2', '')), 250), '') end,
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalSuburb', '')), 150), '') end,
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalCity', '')), 150), '') end,
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalProvince', '')), 150), '') end,
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalPostalCode', '')), 30), '') end,
    case when coalesce((p_payload->>'physicalAddressDifferent')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'physicalCountry', '')), 100), '') end,
    nullif(p_payload->>'primaryContactCustomerId', '')::uuid,
    case when coalesce((p_payload->>'archived')::boolean, false) then now() else null end,
    case when coalesce((p_payload->>'archived')::boolean, false) then p_actor_staff_profile_id else null end,
    case when coalesce((p_payload->>'archived')::boolean, false)
      then nullif(left(trim(coalesce(p_payload->>'archiveReason', '')), 500), '') else null end,
    v_current_revision + 1,
    p_actor_staff_profile_id,
    p_actor_staff_profile_id,
    now()
  ) on conflict (id) do update set
    legal_name = excluded.legal_name,
    trading_name = excluded.trading_name,
    registration_number = excluded.registration_number,
    vat_number = excluded.vat_number,
    billing_email = excluded.billing_email,
    phone = excluded.phone,
    billing_address_line_1 = excluded.billing_address_line_1,
    billing_address_line_2 = excluded.billing_address_line_2,
    billing_suburb = excluded.billing_suburb,
    billing_city = excluded.billing_city,
    billing_province = excluded.billing_province,
    billing_postal_code = excluded.billing_postal_code,
    billing_country = excluded.billing_country,
    physical_address_different = excluded.physical_address_different,
    physical_address_line_1 = excluded.physical_address_line_1,
    physical_address_line_2 = excluded.physical_address_line_2,
    physical_suburb = excluded.physical_suburb,
    physical_city = excluded.physical_city,
    physical_province = excluded.physical_province,
    physical_postal_code = excluded.physical_postal_code,
    physical_country = excluded.physical_country,
    primary_contact_customer_id = excluded.primary_contact_customer_id,
    archived_at = excluded.archived_at,
    archived_by_staff_profile_id = excluded.archived_by_staff_profile_id,
    archive_reason = excluded.archive_reason,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    updated_by_staff_profile_id = excluded.updated_by_staff_profile_id
  returning * into v_after;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, request_id,
    source_area, user_agent
  ) values (
    case when p_company_id is null then 'company.created' else 'company.updated' end,
    p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'), p_actor_name,
    p_actor_role, p_actor_staff_profile_id,
    to_jsonb(v_after) - 'created_by_staff_profile_id' - 'updated_by_staff_profile_id',
    case when p_company_id is null then '{}'::jsonb else
      to_jsonb(v_before) - 'created_by_staff_profile_id' - 'updated_by_staff_profile_id' end,
    array['company_details'], v_after.id::text, v_after.legal_name, 'company',
    'success', p_request_id, 'CRM Companies', p_user_agent
  );

  return to_jsonb(v_after);
exception
  when unique_violation then
    raise exception 'COMPANY_ALREADY_EXISTS';
end;
$$;

create or replace function public.link_customer_company_atomic(
  p_customer_id uuid,
  p_company_id uuid,
  p_job_title text,
  p_expected_revision integer,
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
set search_path = public
as $$
declare
  v_before public.customers%rowtype;
  v_after public.customers%rowtype;
begin
  select * into v_before from public.customers where id = p_customer_id for update;
  if not found or v_before.merged_into_customer_id is not null then
    raise exception 'CUSTOMER_NOT_AVAILABLE';
  end if;
  if v_before.crm_revision <> p_expected_revision then raise exception 'CUSTOMER_CHANGED'; end if;
  if p_company_id is not null and not exists (
    select 1 from public.companies where id = p_company_id and archived_at is null
  ) then raise exception 'COMPANY_NOT_AVAILABLE'; end if;

  if v_before.company_id is not distinct from p_company_id
     and coalesce(v_before.job_title, '') = coalesce(nullif(trim(p_job_title), ''), '') then
    return to_jsonb(v_before) || jsonb_build_object('idempotent', true);
  end if;

  update public.customers set
    company_id = p_company_id,
    job_title = nullif(left(trim(coalesce(p_job_title, '')), 150), ''),
    crm_revision = crm_revision + 1,
    updated_at = now()
  where id = p_customer_id
  returning * into v_after;

  if v_before.company_id is not null and v_before.company_id is distinct from p_company_id then
    update public.companies set primary_contact_customer_id = null
    where id = v_before.company_id and primary_contact_customer_id = p_customer_id;
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, request_id,
    source_area, user_agent
  ) values (
    case when p_company_id is null then 'customer.company-unlinked' else 'customer.company-linked' end,
    p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'), p_actor_name,
    p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('company_id', v_after.company_id, 'job_title', v_after.job_title),
    jsonb_build_object('company_id', v_before.company_id, 'job_title', v_before.job_title),
    array['company_id', 'job_title'], v_after.id::text,
    trim(v_after.first_name || ' ' || coalesce(v_after.surname, '')), 'customer',
    'success', p_request_id, 'CRM Customers', p_user_agent
  );

  return to_jsonb(v_after) || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.merge_customers_atomic(
  p_survivor_customer_id uuid,
  p_duplicate_customer_id uuid,
  p_expected_survivor_updated_at timestamptz,
  p_expected_duplicate_updated_at timestamptz,
  p_reason text,
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
set search_path = public
as $$
declare
  v_survivor public.customers%rowtype;
  v_duplicate public.customers%rowtype;
  v_now timestamptz := now();
begin
  if p_survivor_customer_id = p_duplicate_customer_id then raise exception 'SAME_CUSTOMER'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'MERGE_REASON_REQUIRED'; end if;

  select * into v_survivor from public.customers where id = p_survivor_customer_id for update;
  select * into v_duplicate from public.customers where id = p_duplicate_customer_id for update;
  if v_survivor.id is null or v_duplicate.id is null then raise exception 'CUSTOMER_NOT_FOUND'; end if;

  if v_duplicate.merged_into_customer_id = p_survivor_customer_id then
    return jsonb_build_object('survivorCustomerId', p_survivor_customer_id, 'duplicateCustomerId', p_duplicate_customer_id, 'idempotent', true);
  end if;
  if v_survivor.merged_into_customer_id is not null or v_duplicate.merged_into_customer_id is not null then
    raise exception 'CUSTOMER_ALREADY_MERGED';
  end if;
  if v_survivor.updated_at <> p_expected_survivor_updated_at or v_duplicate.updated_at <> p_expected_duplicate_updated_at then
    raise exception 'CUSTOMER_CHANGED';
  end if;
  if v_survivor.company_id is not null and v_duplicate.company_id is not null
     and v_survivor.company_id <> v_duplicate.company_id then
    raise exception 'CUSTOMER_COMPANY_CONFLICT';
  end if;
  if v_survivor.email is not null and v_duplicate.email is not null
     and lower(trim(v_survivor.email)) <> lower(trim(v_duplicate.email)) then
    raise exception 'CUSTOMER_EMAIL_CONFLICT';
  end if;
  if v_survivor.mobile is not null and v_duplicate.mobile is not null
     and regexp_replace(v_survivor.mobile, '\D', '', 'g') <> regexp_replace(v_duplicate.mobile, '\D', '', 'g') then
    raise exception 'CUSTOMER_MOBILE_CONFLICT';
  end if;
  if exists (
    select 1 from public.customer_communication_suppressions a
    join public.customer_communication_suppressions b on b.channel = a.channel
    where a.customer_id = p_survivor_customer_id and b.customer_id = p_duplicate_customer_id
  ) then raise exception 'CUSTOMER_SUPPRESSION_CONFLICT'; end if;
  if exists (
    select 1 from public.promo_redemptions a
    join public.promo_redemptions b on b.promo_code_id = a.promo_code_id and b.booking_id = a.booking_id
    where a.customer_id = p_survivor_customer_id and b.customer_id = p_duplicate_customer_id
  ) then raise exception 'CUSTOMER_PROMO_CONFLICT'; end if;

  update public.bookings set customer_id = p_survivor_customer_id where customer_id = p_duplicate_customer_id;
  update public.communications set customer_id = p_survivor_customer_id where customer_id = p_duplicate_customer_id;
  update public.waitlist_entries set customer_id = p_survivor_customer_id where customer_id = p_duplicate_customer_id;
  update public.promo_redemptions set customer_id = p_survivor_customer_id where customer_id = p_duplicate_customer_id;
  update public.customer_communication_suppressions set customer_id = p_survivor_customer_id where customer_id = p_duplicate_customer_id;
  update public.corporate_requests set contact_customer_id = p_survivor_customer_id where contact_customer_id = p_duplicate_customer_id;
  update public.companies set primary_contact_customer_id = p_survivor_customer_id where primary_contact_customer_id = p_duplicate_customer_id;

  if v_duplicate.email is not null and (
    v_survivor.email is null or lower(trim(v_survivor.email)) = lower(trim(v_duplicate.email))
  ) then
    update public.customers set email = null where id = p_duplicate_customer_id;
  end if;

  update public.customers set
    email = coalesce(v_survivor.email, v_duplicate.email),
    mobile = coalesce(v_survivor.mobile, v_duplicate.mobile),
    company_id = coalesce(v_survivor.company_id, v_duplicate.company_id),
    job_title = coalesce(v_survivor.job_title, v_duplicate.job_title),
    relationship_notes = concat_ws(E'\n\n', nullif(v_survivor.relationship_notes, ''), nullif(v_duplicate.relationship_notes, '')),
    dietary_requirements = coalesce(v_survivor.dietary_requirements, v_duplicate.dietary_requirements),
    preferences = coalesce(v_duplicate.preferences, '{}'::jsonb) || coalesce(v_survivor.preferences, '{}'::jsonb),
    crm_revision = crm_revision + 1,
    updated_at = v_now
  where id = p_survivor_customer_id;

  update public.customers set
    merged_into_customer_id = p_survivor_customer_id,
    preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(
      'archivedAt', v_now,
      'archivedBy', coalesce(p_actor_name, 'System'),
      'archiveReason', 'Merged into customer ' || p_survivor_customer_id::text,
      'mergedIdentity', jsonb_build_object(
        'email', v_duplicate.email,
        'mobile', v_duplicate.mobile,
        'name', trim(v_duplicate.first_name || ' ' || coalesce(v_duplicate.surname, ''))
      )
    ),
    crm_revision = crm_revision + 1,
    updated_at = v_now
  where id = p_duplicate_customer_id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'customer.merged', p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'),
    p_actor_name, p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('survivor_customer_id', p_survivor_customer_id, 'duplicate_customer_id', p_duplicate_customer_id),
    jsonb_build_object('survivor_email', v_survivor.email, 'duplicate_email', v_duplicate.email),
    array['customer_dependencies', 'merged_into_customer_id'], p_survivor_customer_id::text,
    trim(v_survivor.first_name || ' ' || coalesce(v_survivor.surname, '')), 'customer',
    'success', left(trim(p_reason), 1000), p_request_id, 'CRM Customers', p_user_agent
  );

  return jsonb_build_object('survivorCustomerId', p_survivor_customer_id, 'duplicateCustomerId', p_duplicate_customer_id, 'idempotent', false);
end;
$$;

create or replace function public.merge_companies_atomic(
  p_survivor_company_id uuid,
  p_duplicate_company_id uuid,
  p_expected_survivor_revision integer,
  p_expected_duplicate_revision integer,
  p_reason text,
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
set search_path = public
as $$
declare
  v_survivor public.companies%rowtype;
  v_duplicate public.companies%rowtype;
begin
  if p_survivor_company_id = p_duplicate_company_id then raise exception 'SAME_COMPANY'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'MERGE_REASON_REQUIRED'; end if;
  select * into v_survivor from public.companies where id = p_survivor_company_id for update;
  select * into v_duplicate from public.companies where id = p_duplicate_company_id for update;
  if v_survivor.id is null or v_duplicate.id is null then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_duplicate.merged_into_company_id = p_survivor_company_id then
    return jsonb_build_object('survivorCompanyId', p_survivor_company_id, 'duplicateCompanyId', p_duplicate_company_id, 'idempotent', true);
  end if;
  if v_survivor.merged_into_company_id is not null or v_duplicate.merged_into_company_id is not null then
    raise exception 'COMPANY_ALREADY_MERGED';
  end if;
  if v_survivor.revision <> p_expected_survivor_revision or v_duplicate.revision <> p_expected_duplicate_revision then
    raise exception 'COMPANY_CHANGED';
  end if;
  if v_survivor.registration_number is not null and v_duplicate.registration_number is not null
     and v_survivor.registration_number <> v_duplicate.registration_number then raise exception 'COMPANY_REGISTRATION_CONFLICT'; end if;
  if v_survivor.vat_number is not null and v_duplicate.vat_number is not null
     and v_survivor.vat_number <> v_duplicate.vat_number then raise exception 'COMPANY_VAT_CONFLICT'; end if;

  update public.customers set company_id = p_survivor_company_id, crm_revision = crm_revision + 1, updated_at = now()
  where company_id = p_duplicate_company_id;
  update public.bookings set company_id = p_survivor_company_id where company_id = p_duplicate_company_id;
  update public.corporate_requests set company_id = p_survivor_company_id where company_id = p_duplicate_company_id;
  update public.companies set
    trading_name = coalesce(v_survivor.trading_name, v_duplicate.trading_name),
    registration_number = coalesce(v_survivor.registration_number, v_duplicate.registration_number),
    vat_number = coalesce(v_survivor.vat_number, v_duplicate.vat_number),
    billing_email = coalesce(v_survivor.billing_email, v_duplicate.billing_email),
    phone = coalesce(v_survivor.phone, v_duplicate.phone),
    billing_address_line_1 = coalesce(v_survivor.billing_address_line_1, v_duplicate.billing_address_line_1),
    billing_address_line_2 = coalesce(v_survivor.billing_address_line_2, v_duplicate.billing_address_line_2),
    billing_suburb = coalesce(v_survivor.billing_suburb, v_duplicate.billing_suburb),
    billing_city = coalesce(v_survivor.billing_city, v_duplicate.billing_city),
    billing_province = coalesce(v_survivor.billing_province, v_duplicate.billing_province),
    billing_postal_code = coalesce(v_survivor.billing_postal_code, v_duplicate.billing_postal_code),
    primary_contact_customer_id = coalesce(v_survivor.primary_contact_customer_id, v_duplicate.primary_contact_customer_id),
    revision = revision + 1, updated_at = now(), updated_by_staff_profile_id = p_actor_staff_profile_id
  where id = p_survivor_company_id;
  update public.companies set
    primary_contact_customer_id = null,
    merged_into_company_id = p_survivor_company_id,
    archived_at = now(),
    archived_by_staff_profile_id = p_actor_staff_profile_id,
    archive_reason = 'Merged into Company ' || p_survivor_company_id::text,
    revision = revision + 1,
    updated_at = now(),
    updated_by_staff_profile_id = p_actor_staff_profile_id
  where id = p_duplicate_company_id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'company.merged', p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'),
    p_actor_name, p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('survivor_company_id', p_survivor_company_id, 'duplicate_company_id', p_duplicate_company_id),
    jsonb_build_object('survivor_name', v_survivor.legal_name, 'duplicate_name', v_duplicate.legal_name),
    array['company_links', 'merged_into_company_id'], p_survivor_company_id::text,
    v_survivor.legal_name, 'company', 'success', left(trim(p_reason), 1000),
    p_request_id, 'CRM Companies', p_user_agent
  );
  return jsonb_build_object('survivorCompanyId', p_survivor_company_id, 'duplicateCompanyId', p_duplicate_company_id, 'idempotent', false);
end;
$$;

revoke all on function public.save_company_atomic(uuid, integer, jsonb, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.link_customer_company_atomic(uuid, uuid, text, integer, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.merge_customers_atomic(uuid, uuid, timestamptz, timestamptz, text, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.merge_companies_atomic(uuid, uuid, integer, integer, text, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.save_company_atomic(uuid, integer, jsonb, uuid, uuid, text, text, text[], text, text) to service_role;
grant execute on function public.link_customer_company_atomic(uuid, uuid, text, integer, uuid, uuid, text, text, text[], text, text) to service_role;
grant execute on function public.merge_customers_atomic(uuid, uuid, timestamptz, timestamptz, text, uuid, uuid, text, text, text[], text, text) to service_role;
grant execute on function public.merge_companies_atomic(uuid, uuid, integer, integer, text, uuid, uuid, text, text, text[], text, text) to service_role;

-- Deterministic exact/case/punctuation Company candidates. Original snapshots remain unchanged.
with observed as (
  select trim(company_name) as display_name, public.normalise_company_match_key(company_name) as match_key
  from public.bookings where nullif(trim(company_name), '') is not null
  union all
  select trim(company_name), public.normalise_company_match_key(company_name)
  from public.corporate_requests where nullif(trim(company_name), '') is not null
), ranked as (
  select match_key, display_name, count(*) as usage_count,
    row_number() over (partition by match_key order by count(*) desc, display_name) as rank
  from observed where match_key is not null group by match_key, display_name
), inserted as (
  insert into public.companies (legal_name)
  select display_name from ranked where rank = 1
  on conflict (normalised_name) do nothing
  returning *
)
insert into public.audit_events (
  actor_name, action, entity_type, entity_reference, entity_id, outcome,
  source_area, reason, before_values, after_values, changed_fields
)
select 'Phase 42.2 company backfill', 'company.created', 'company', legal_name,
  id::text, 'success', 'CRM Companies',
  'Created from an exact case, whitespace and punctuation-normalised historical Company snapshot.',
  '{}'::jsonb, jsonb_build_object('legal_name', legal_name), array['legal_name']
from inserted;

update public.bookings booking set company_id = company.id
from public.companies company
where booking.company_id is null
  and public.normalise_company_match_key(booking.company_name) = company.normalised_name;

update public.corporate_requests request set company_id = company.id
from public.companies company
where request.company_id is null
  and public.normalise_company_match_key(request.company_name) = company.normalised_name;

with unambiguous as (
  select booking.customer_id, min(booking.company_id::text)::uuid as company_id
  from public.bookings booking
  where booking.company_id is not null
  group by booking.customer_id
  having count(distinct booking.company_id) = 1
)
update public.customers customer set company_id = unambiguous.company_id
from unambiguous
where customer.id = unambiguous.customer_id and customer.company_id is null;

insert into public.audit_events (
  actor_name, action, entity_type, entity_reference, entity_id, outcome,
  source_area, reason, before_values, after_values, changed_fields
)
select 'Phase 42.2 company backfill', 'customer.company-linked', 'customer',
  trim(customer.first_name || ' ' || coalesce(customer.surname, '')),
  customer.id::text, 'success', 'CRM Customers',
  'Linked from one unambiguous exact Company identity across historical booking snapshots.',
  '{}'::jsonb, jsonb_build_object('company_id', customer.company_id), array['company_id']
from public.customers customer
where customer.company_id is not null
  and not exists (
    select 1 from public.audit_events audit
    where audit.action = 'customer.company-linked'
      and audit.entity_id = customer.id::text
      and audit.actor_name = 'Phase 42.2 company backfill'
  );

update public.corporate_requests request set contact_customer_id = customer.id
from public.customers customer
where request.contact_customer_id is null
  and nullif(lower(trim(request.email)), '') is not null
  and lower(trim(customer.email)) = lower(trim(request.email));

with request_contacts as (
  select contact_customer_id as customer_id, min(company_id::text)::uuid as company_id
  from public.corporate_requests
  where contact_customer_id is not null and company_id is not null
  group by contact_customer_id
  having count(distinct company_id) = 1
)
update public.customers customer set company_id = request_contacts.company_id
from request_contacts
where customer.id = request_contacts.customer_id and customer.company_id is null;

insert into public.audit_events (
  actor_name, action, entity_type, entity_reference, entity_id, outcome,
  source_area, reason, before_values, after_values, changed_fields
)
select 'Phase 42.2 company backfill', 'customer.company-linked', 'customer',
  trim(customer.first_name || ' ' || coalesce(customer.surname, '')),
  customer.id::text, 'success', 'CRM Customers',
  'Linked from one unambiguous exact Corporate contact email and Company snapshot.',
  '{}'::jsonb, jsonb_build_object('company_id', customer.company_id), array['company_id']
from public.customers customer
where customer.company_id is not null
  and not exists (
    select 1 from public.audit_events audit
    where audit.action = 'customer.company-linked'
      and audit.entity_id = customer.id::text
      and audit.actor_name = 'Phase 42.2 company backfill'
  );

with first_contact as (
  select distinct on (company_id) company_id, id
  from public.customers
  where company_id is not null and merged_into_customer_id is null
  order by company_id, created_at, id
)
update public.companies company set primary_contact_customer_id = first_contact.id
from first_contact
where company.id = first_contact.company_id and company.primary_contact_customer_id is null;

-- Strict exact duplicate cleanup: identical normalised name/mobile, identical import
-- timestamp, and no conflicting nonblank email. All less-certain matches stay in review.
do $$
declare
  v_group record;
  v_survivor public.customers%rowtype;
  v_duplicate public.customers%rowtype;
begin
  for v_group in
    select
      lower(trim(first_name || ' ' || coalesce(surname, ''))) as name_key,
      regexp_replace(mobile, '\D', '', 'g') as mobile_key,
      min(created_at) as created_at,
      array_agg(id order by id) as customer_ids
    from public.customers
    where length(regexp_replace(coalesce(mobile, ''), '\D', '', 'g')) >= 7
      and merged_into_customer_id is null
    group by
      lower(trim(first_name || ' ' || coalesce(surname, ''))),
      regexp_replace(mobile, '\D', '', 'g')
    having count(*) > 1
      and min(created_at) = max(created_at)
      and count(distinct lower(coalesce(email, ''))) = 1
  loop
    select * into v_survivor
    from public.customers
    where id = v_group.customer_ids[1];

    for v_duplicate in
      select * from public.customers
      where id = any(v_group.customer_ids[2:cardinality(v_group.customer_ids)])
      order by id
    loop
      perform public.merge_customers_atomic(
        v_survivor.id,
        v_duplicate.id,
        v_survivor.updated_at,
        v_duplicate.updated_at,
        'Proven exact duplicate imported profile: identical name, mobile, email state and import timestamp.',
        null,
        null,
        'Phase 42.2 exact duplicate cleanup',
        'System',
        '{}'::text[],
        'phase-42-2-backfill-' || v_duplicate.id::text,
        null
      );
      select * into v_survivor from public.customers where id = v_survivor.id;
    end loop;
  end loop;
end;
$$;

-- Legal-suffix/spelling candidates are review-only and are never silently collapsed.
with grouped as (
  select public.normalise_company_review_key(legal_name) as review_key,
    array_agg(id order by legal_name) as ids,
    array_agg(legal_name order by legal_name) as names
  from public.companies
  where public.normalise_company_review_key(legal_name) is not null
  group by public.normalise_company_review_key(legal_name)
  having count(*) > 1
)
insert into public.crm_data_review_candidates (
  candidate_type, review_key, subject_ids, display_names, reason, evidence
)
select 'company-variant', review_key, ids, names,
  'These Company names share a simplified legal-name key and require management review.',
  jsonb_build_object('match', 'legal-suffix-or-punctuation-variant')
from grouped
on conflict (candidate_type, review_key) do nothing;

with mobile_groups as (
  select regexp_replace(mobile, '\D', '', 'g') as review_key,
    array_agg(id order by created_at) as ids,
    array_agg(trim(first_name || ' ' || coalesce(surname, '')) order by created_at) as names,
    array_agg(distinct lower(coalesce(email, ''))) as emails
  from public.customers
  where length(regexp_replace(coalesce(mobile, ''), '\D', '', 'g')) >= 7
    and merged_into_customer_id is null
  group by regexp_replace(mobile, '\D', '', 'g')
  having count(*) > 1
)
insert into public.crm_data_review_candidates (
  candidate_type, review_key, subject_ids, display_names, reason, evidence
)
select 'customer-duplicate', review_key, ids, names,
  'These people share a normalised mobile number. Confirm their identity before merging.',
  jsonb_build_object('match', 'shared-mobile', 'emails', emails)
from mobile_groups
on conflict (candidate_type, review_key) do nothing;

with company_people as (
  select customer.id as customer_id, company.id as company_id,
    trim(customer.first_name || ' ' || coalesce(customer.surname, '')) as customer_name,
    company.legal_name
  from public.customers customer
  join public.companies company on company.id = customer.company_id
  where customer.merged_into_customer_id is null
    and public.normalise_company_match_key(trim(customer.first_name || ' ' || coalesce(customer.surname, ''))) = company.normalised_name
)
insert into public.crm_data_review_candidates (
  candidate_type, review_key, subject_ids, display_names, reason, evidence
)
select 'company-as-person', customer_id::text, array[customer_id, company_id],
  array[customer_name, legal_name],
  'This legacy person profile has the same name as a Company. Review and link it without deleting history.',
  jsonb_build_object('customerId', customer_id, 'companyId', company_id)
from company_people
on conflict (candidate_type, review_key) do nothing;

-- Only dependency-free placeholder records qualify for automatic archive cleanup.
with safe_empty as (
  select customer.*
  from public.customers customer
  where customer.email is null and customer.mobile is null
    and lower(trim(customer.first_name || ' ' || coalesce(customer.surname, ''))) in (
      '', 'unknown', 'unknown customer', 'unknown-customer', 'imported guest', 'guest', 'customer', 'n/a', 'na'
    )
    and coalesce(nullif(trim(customer.relationship_notes), ''), nullif(trim(customer.dietary_requirements), ''), nullif(trim(customer.vip_status), '')) is null
    and not exists (select 1 from public.bookings row where row.customer_id = customer.id)
    and not exists (select 1 from public.communications row where row.customer_id = customer.id)
    and not exists (select 1 from public.customer_communication_suppressions row where row.customer_id = customer.id)
    and not exists (select 1 from public.promo_redemptions row where row.customer_id = customer.id)
    and not exists (select 1 from public.waitlist_entries row where row.customer_id = customer.id)
    and not exists (select 1 from public.corporate_requests row where row.contact_customer_id = customer.id)
    and not exists (select 1 from public.audit_events row where row.entity_id = customer.id::text or row.entity_reference = customer.id::text)
    and customer.merged_into_customer_id is null
    and not coalesce(customer.preferences ? 'archivedAt', false)
), archived as (
  update public.customers customer set
    preferences = coalesce(customer.preferences, '{}'::jsonb) || jsonb_build_object(
      'archivedAt', now(), 'archivedBy', 'Phase 42.2 system cleanup',
      'archiveReason', 'Dependency-free empty CRM profile'
    ),
    crm_revision = customer.crm_revision + 1,
    updated_at = now()
  from safe_empty
  where customer.id = safe_empty.id
  returning customer.*
)
insert into public.audit_events (
  actor_name, action, entity_type, entity_reference, entity_id, outcome,
  source_area, reason, before_values, after_values, changed_fields
)
select 'Phase 42.2 system cleanup', 'customer.archived', 'customer',
  trim(first_name || ' ' || coalesce(surname, '')), id::text, 'success',
  'CRM Customers', 'Dependency-free empty CRM profile archived during approved cleanup.',
  '{}'::jsonb, jsonb_build_object('archived', true), array['preferences']
from archived;

comment on table public.companies is
  'Authoritative Company master. Booking and Corporate request company text remains a historical snapshot.';
comment on table public.crm_data_review_candidates is
  'Ambiguous customer and Company candidates requiring explicit staff review; no row implies automatic merge authority.';
