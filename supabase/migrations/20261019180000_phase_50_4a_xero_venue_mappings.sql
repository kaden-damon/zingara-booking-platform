alter table public.xero_account_mappings
  add column if not exists venue text not null default 'all',
  add column if not exists account_id text,
  add column if not exists account_name text,
  add column if not exists account_type text,
  add column if not exists tax_name text,
  add column if not exists tax_rate numeric,
  add column if not exists verified_at timestamptz;

alter table public.xero_account_mappings
  drop constraint if exists xero_account_mappings_tenant_id_category_key;

alter table public.xero_account_mappings
  drop constraint if exists xero_account_mappings_venue_check;

alter table public.xero_account_mappings
  add constraint xero_account_mappings_venue_check
  check (venue in ('all', 'johannesburg', 'cape-town'));

create unique index if not exists xero_account_mappings_tenant_venue_category_idx
  on public.xero_account_mappings(tenant_id, venue, category);

comment on column public.xero_account_mappings.venue is
  'Authoritative Zingara venue for this mapping. all is reserved for shared non-revenue settings such as payment clearing.';
comment on column public.xero_account_mappings.account_id is
  'Verified immutable Xero AccountID captured during read-only chart-of-accounts discovery.';
comment on column public.xero_account_mappings.verified_at is
  'Time the account and tax identities were last verified against the connected Xero organisation.';

create or replace function public.approve_xero_account_mapping_atomic(
  p_tenant_id text,
  p_venue text,
  p_category text,
  p_account_id text,
  p_account_code text,
  p_account_name text,
  p_account_type text,
  p_tax_code text,
  p_tax_name text,
  p_tax_rate numeric,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.xero_account_mappings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.xero_account_mappings%rowtype;
  v_mapping public.xero_account_mappings%rowtype;
begin
  if p_venue not in ('all', 'johannesburg', 'cape-town') then raise exception 'INVALID_MAPPING_VENUE'; end if;
  select * into v_before from public.xero_account_mappings
    where tenant_id = p_tenant_id and venue = p_venue and category = p_category
    for update;

  insert into public.xero_account_mappings(
    tenant_id, venue, category, account_id, account_code, account_name, account_type,
    tax_code, tax_name, tax_rate, verified_at, approved_at, approved_by_staff_profile_id, updated_at
  ) values (
    p_tenant_id, p_venue, p_category, p_account_id, p_account_code, p_account_name, p_account_type,
    nullif(p_tax_code, ''), nullif(p_tax_name, ''), p_tax_rate, now(), now(), p_actor_staff_profile_id, now()
  )
  on conflict (tenant_id, venue, category) do update set
    account_id = excluded.account_id,
    account_code = excluded.account_code,
    account_name = excluded.account_name,
    account_type = excluded.account_type,
    tax_code = excluded.tax_code,
    tax_name = excluded.tax_name,
    tax_rate = excluded.tax_rate,
    verified_at = excluded.verified_at,
    approved_at = excluded.approved_at,
    approved_by_staff_profile_id = excluded.approved_by_staff_profile_id,
    updated_at = excluded.updated_at
  returning * into v_mapping;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_account_mapping_approved', p_actor_auth_user_id, p_actor_location_scope,
    p_actor_name, p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('venue', p_venue, 'category', p_category, 'accountCode', p_account_code, 'accountName', p_account_name, 'taxCode', nullif(p_tax_code, ''), 'taxName', nullif(p_tax_name, '')),
    case when v_before.id is null then '{}'::jsonb else jsonb_build_object('venue', v_before.venue, 'category', v_before.category, 'accountCode', v_before.account_code, 'accountName', v_before.account_name, 'taxCode', v_before.tax_code, 'taxName', v_before.tax_name) end,
    array['accountCode', 'accountName', 'taxCode', 'taxName', 'approval'],
    v_mapping.id::text, p_venue, p_venue || ':' || p_category,
    'xero-account-mapping', 'success', 'xero-settings'
  );
  return v_mapping;
end;
$$;

revoke all on function public.approve_xero_account_mapping_atomic(text,text,text,text,text,text,text,text,text,numeric,uuid,uuid,text,text,text[]) from public, anon, authenticated;
grant execute on function public.approve_xero_account_mapping_atomic(text,text,text,text,text,text,text,text,text,numeric,uuid,uuid,text,text,text[]) to service_role;
