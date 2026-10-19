create table if not exists public.customer_company_associations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  job_title text,
  created_at timestamptz not null default now(),
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  removed_at timestamptz,
  removed_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null
);

create unique index if not exists customer_company_associations_active_pair_idx
  on public.customer_company_associations(customer_id, company_id)
  where removed_at is null;

create index if not exists customer_company_associations_customer_idx
  on public.customer_company_associations(customer_id, created_at desc)
  where removed_at is null;

create index if not exists customer_company_associations_company_idx
  on public.customer_company_associations(company_id, created_at desc)
  where removed_at is null;

insert into public.customer_company_associations (
  customer_id,
  company_id,
  job_title,
  created_at
)
select customer.id, customer.company_id, customer.job_title, customer.updated_at
from public.customers customer
where customer.company_id is not null
  and customer.merged_into_customer_id is null
on conflict do nothing;

alter table public.customer_company_associations enable row level security;
revoke all on public.customer_company_associations from public, anon, authenticated;
grant all on public.customer_company_associations to service_role;

create or replace function public.enforce_company_primary_contact()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.primary_contact_customer_id is not null and not exists (
    select 1
    from public.customer_company_associations association
    join public.customers customer on customer.id = association.customer_id
    where association.customer_id = new.primary_contact_customer_id
      and association.company_id = new.id
      and association.removed_at is null
      and customer.merged_into_customer_id is null
  ) then
    raise exception 'PRIMARY_CONTACT_NOT_LINKED';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.preserve_customer_company_links_on_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.merged_into_customer_id is null and new.merged_into_customer_id is not null then
    insert into public.customer_company_associations (
      customer_id, company_id, job_title, created_at
    )
    select new.merged_into_customer_id, association.company_id,
      association.job_title, association.created_at
    from public.customer_company_associations association
    where association.customer_id = new.id
      and association.removed_at is null
      and not exists (
        select 1 from public.customer_company_associations existing
        where existing.customer_id = new.merged_into_customer_id
          and existing.company_id = association.company_id
          and existing.removed_at is null
      );

    update public.customer_company_associations
    set removed_at = coalesce(removed_at, now())
    where customer_id = new.id and removed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_preserve_company_links_on_merge on public.customers;
create trigger customers_preserve_company_links_on_merge
  after update of merged_into_customer_id on public.customers
  for each row execute function public.preserve_customer_company_links_on_merge();

create or replace function public.preserve_customer_company_links_on_company_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.merged_into_company_id is null and new.merged_into_company_id is not null then
    insert into public.customer_company_associations (
      customer_id, company_id, job_title, created_at
    )
    select association.customer_id, new.merged_into_company_id,
      association.job_title, association.created_at
    from public.customer_company_associations association
    where association.company_id = new.id
      and association.removed_at is null
      and not exists (
        select 1 from public.customer_company_associations existing
        where existing.customer_id = association.customer_id
          and existing.company_id = new.merged_into_company_id
          and existing.removed_at is null
      );

    update public.customer_company_associations
    set removed_at = coalesce(removed_at, now())
    where company_id = new.id and removed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_preserve_customer_links_on_merge on public.companies;
create trigger companies_preserve_customer_links_on_merge
  after update of merged_into_company_id on public.companies
  for each row execute function public.preserve_customer_company_links_on_company_merge();

create or replace function public.create_customer_profile_atomic(
  p_first_name text,
  p_surname text,
  p_email text,
  p_mobile text,
  p_customer_key text,
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
  v_customer public.customers%rowtype;
begin
  if nullif(trim(p_first_name), '') is null or nullif(trim(p_surname), '') is null then
    raise exception 'CUSTOMER_NAME_REQUIRED';
  end if;

  insert into public.customers (
    first_name, surname, email, mobile, preferences, relationship_notes
  ) values (
    left(trim(p_first_name), 150), left(trim(p_surname), 150),
    nullif(lower(trim(p_email)), ''), nullif(trim(p_mobile), ''),
    jsonb_build_object('customerKey', left(p_customer_key, 240), 'vipTags', '[]'::jsonb),
    ''
  ) returning * into v_customer;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, request_id,
    source_area, user_agent
  ) values (
    'customer.create', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'first_name', v_customer.first_name, 'surname', v_customer.surname,
      'email', v_customer.email, 'mobile', v_customer.mobile
    ),
    '{}'::jsonb, array['first_name', 'surname', 'email', 'mobile'],
    v_customer.id::text,
    trim(v_customer.first_name || ' ' || coalesce(v_customer.surname, '')),
    'customer', 'success', p_request_id, 'Customers', p_user_agent
  );

  return to_jsonb(v_customer);
end;
$$;

create or replace function public.link_customer_company_association_atomic(
  p_customer_id uuid,
  p_company_id uuid,
  p_job_title text,
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
  v_customer public.customers%rowtype;
  v_company public.companies%rowtype;
  v_link public.customer_company_associations%rowtype;
begin
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found or v_customer.merged_into_customer_id is not null then
    raise exception 'CUSTOMER_NOT_AVAILABLE';
  end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found or v_company.archived_at is not null or v_company.merged_into_company_id is not null then
    raise exception 'COMPANY_NOT_AVAILABLE';
  end if;

  select * into v_link
  from public.customer_company_associations
  where customer_id = p_customer_id and company_id = p_company_id and removed_at is null
  for update;

  if found then
    if coalesce(v_link.job_title, '') <> coalesce(nullif(left(trim(p_job_title), 150), ''), '') then
      update public.customer_company_associations
      set job_title = nullif(left(trim(p_job_title), 150), '')
      where id = v_link.id
      returning * into v_link;
    end if;
    return to_jsonb(v_link) || jsonb_build_object('idempotent', true);
  end if;

  insert into public.customer_company_associations (
    customer_id, company_id, job_title, created_by_staff_profile_id
  ) values (
    p_customer_id, p_company_id, nullif(left(trim(p_job_title), 150), ''), p_actor_staff_profile_id
  ) returning * into v_link;

  if v_customer.company_id is null then
    update public.customers
    set company_id = p_company_id,
        job_title = v_link.job_title,
        crm_revision = crm_revision + 1,
        updated_at = now()
    where id = p_customer_id;
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, request_id,
    source_area, user_agent
  ) values (
    'customer.company-linked', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('association_id', v_link.id, 'company_id', p_company_id, 'job_title', v_link.job_title),
    '{}'::jsonb, array['company_association'], p_customer_id::text,
    trim(v_customer.first_name || ' ' || coalesce(v_customer.surname, '')),
    'customer', 'success', p_request_id, 'CRM Customers', p_user_agent
  );

  return to_jsonb(v_link) || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.unlink_customer_company_association_atomic(
  p_customer_id uuid,
  p_company_id uuid,
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
  v_customer public.customers%rowtype;
  v_link public.customer_company_associations%rowtype;
  v_replacement public.customer_company_associations%rowtype;
begin
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found or v_customer.merged_into_customer_id is not null then
    raise exception 'CUSTOMER_NOT_AVAILABLE';
  end if;

  select * into v_link
  from public.customer_company_associations
  where customer_id = p_customer_id and company_id = p_company_id and removed_at is null
  for update;

  if not found then
    return jsonb_build_object('idempotent', true);
  end if;

  update public.customer_company_associations
  set removed_at = now(), removed_by_staff_profile_id = p_actor_staff_profile_id
  where id = v_link.id;

  if v_customer.company_id = p_company_id then
    select * into v_replacement
    from public.customer_company_associations
    where customer_id = p_customer_id and removed_at is null
    order by created_at, id
    limit 1;

    update public.customers
    set company_id = v_replacement.company_id,
        job_title = v_replacement.job_title,
        crm_revision = crm_revision + 1,
        updated_at = now()
    where id = p_customer_id;
  end if;

  update public.companies
  set primary_contact_customer_id = null
  where id = p_company_id and primary_contact_customer_id = p_customer_id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, request_id,
    source_area, user_agent
  ) values (
    'customer.company-unlinked', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'), p_actor_name, p_actor_role,
    p_actor_staff_profile_id, '{}'::jsonb,
    jsonb_build_object('association_id', v_link.id, 'company_id', p_company_id, 'job_title', v_link.job_title),
    array['company_association'], p_customer_id::text,
    trim(v_customer.first_name || ' ' || coalesce(v_customer.surname, '')),
    'customer', 'success', p_request_id, 'CRM Customers', p_user_agent
  );

  return jsonb_build_object('idempotent', false, 'removedAssociationId', v_link.id);
end;
$$;

revoke all on function public.link_customer_company_association_atomic(uuid, uuid, text, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.unlink_customer_company_association_atomic(uuid, uuid, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.create_customer_profile_atomic(text, text, text, text, text, uuid, uuid, text, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.link_customer_company_association_atomic(uuid, uuid, text, uuid, uuid, text, text, text[], text, text) to service_role;
grant execute on function public.unlink_customer_company_association_atomic(uuid, uuid, uuid, uuid, text, text, text[], text, text) to service_role;
grant execute on function public.create_customer_profile_atomic(text, text, text, text, text, uuid, uuid, text, text, text[], text, text) to service_role;
