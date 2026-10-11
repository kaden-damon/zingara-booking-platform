alter table public.xero_connections
  add column if not exists connection_id text,
  add column if not exists encrypted_access_token text,
  add column if not exists token_scope text,
  add column if not exists token_revision integer not null default 0,
  add column if not exists health_checked_at timestamptz,
  add column if not exists health_error text,
  add column if not exists organisation jsonb;

create unique index if not exists xero_connections_connection_id_idx on public.xero_connections(connection_id) where connection_id is not null;

create table if not exists public.xero_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  encrypted_code_verifier text not null,
  initiated_by_staff_profile_id uuid not null references public.staff_profiles(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.xero_contact_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  company_id uuid references public.companies(id),
  customer_id uuid references public.customers(id),
  xero_contact_id text not null,
  contact_number text not null,
  status text not null default 'active' check (status in ('active','conflict','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xero_contact_mapping_one_source check ((company_id is not null)::int + (customer_id is not null)::int = 1),
  unique (tenant_id, xero_contact_id),
  unique (tenant_id, contact_number)
);

create table if not exists public.xero_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  document_id uuid references public.xero_documents(id),
  category text not null check (category in ('matched','missing_local','missing_xero','amount_mismatch','status_mismatch','unallocated','mapping_conflict')),
  provider_resource_type text,
  provider_resource_id text,
  local_amount_cents bigint,
  provider_amount_cents bigint,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (tenant_id, category, provider_resource_type, provider_resource_id, document_id)
);

alter table public.xero_sync_outbox
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists max_attempts integer not null default 8,
  add column if not exists provider_resource_id text,
  add column if not exists provider_resource_number text,
  add column if not exists provider_status text,
  add column if not exists completed_at timestamptz;

alter table public.xero_documents
  add column if not exists xero_event_sequence bigint;

alter table public.xero_webhook_receipts
  add column if not exists event_sequence bigint,
  add column if not exists event_date_utc timestamptz,
  add column if not exists correlation jsonb not null default '{}'::jsonb;

create or replace function public.claim_xero_sync_outbox(p_worker_id text, p_limit integer default 10, p_lease_seconds integer default 90)
returns setof public.xero_sync_outbox
language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select o.id
    from public.xero_sync_outbox o
    join public.xero_connections c on c.tenant_id=o.tenant_id
    where o.status='pending'
      and c.status='connected' and c.sync_paused=false
      and coalesce(o.next_attempt_at,now()) <= now()
      and (o.lease_expires_at is null or o.lease_expires_at < now())
    order by o.created_at,o.id
    for update of o skip locked
    limit least(greatest(p_limit,1),25)
  )
  update public.xero_sync_outbox o set
    status='processing', lease_owner=p_worker_id,
    lease_expires_at=now()+make_interval(secs=>least(greatest(p_lease_seconds,30),300)),
    attempt_count=o.attempt_count+1, updated_at=now()
  from candidates c where o.id=c.id returning o.*;
end; $$;

alter table public.xero_oauth_states enable row level security;
alter table public.xero_contact_mappings enable row level security;
alter table public.xero_reconciliation_items enable row level security;
revoke all on public.xero_oauth_states, public.xero_contact_mappings, public.xero_reconciliation_items from public, anon, authenticated;
grant select, insert, update on public.xero_oauth_states, public.xero_contact_mappings, public.xero_reconciliation_items to service_role;
revoke all on function public.claim_xero_sync_outbox(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_xero_sync_outbox(text,integer,integer) to service_role;

comment on table public.xero_oauth_states is 'Short-lived, single-use OAuth state and encrypted PKCE verifier. Service role only.';
comment on table public.xero_contact_mappings is 'Stable local Company/customer to Xero Contact IDs. Never matched by name alone.';
comment on table public.xero_reconciliation_items is 'Bounded accounting differences. Never changes Zingara booking or payment truth.';
comment on function public.claim_xero_sync_outbox(text,integer,integer) is 'Claims bounded sync work only for explicitly connected and unpaused tenants.';
