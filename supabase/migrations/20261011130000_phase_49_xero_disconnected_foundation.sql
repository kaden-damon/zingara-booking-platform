create sequence if not exists public.zingara_quote_number_seq start 1000;
create sequence if not exists public.zingara_invoice_draft_number_seq start 1000;

create table if not exists public.xero_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id text unique,
  tenant_name text,
  status text not null default 'not_connected' check (status in ('not_connected','connected','action_required','sync_paused','error')),
  sync_paused boolean not null default true,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  connected_by_staff_profile_id uuid references public.staff_profiles(id),
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint xero_connection_requires_tenant check (status = 'not_connected' or (tenant_id is not null and tenant_name is not null))
);

create table if not exists public.xero_account_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  category text not null,
  account_code text,
  tax_code text,
  tracking_category_id text,
  tracking_option_id text,
  approved_at timestamptz,
  approved_by_staff_profile_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, category)
);

create table if not exists public.xero_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quote','invoice')),
  local_reference text not null unique,
  source_booking_id uuid references public.bookings(id),
  source_booking_reference text,
  source_corporate_request_id uuid references public.corporate_requests(id),
  source_quote_id uuid references public.xero_documents(id),
  company_id uuid references public.companies(id),
  contact_customer_id uuid references public.customers(id),
  venue text check (venue is null or venue in ('cape-town','johannesburg')),
  status text not null default 'draft' check (status in ('draft','revised','issued','sent','accepted','declined','expired','superseded','converted','voided')),
  version integer not null default 1 check (version > 0),
  currency_code text not null default 'ZAR',
  line_amount_type text not null check (line_amount_type in ('exclusive','inclusive','no-tax')),
  customer_name text not null,
  customer_email text,
  billing_address text,
  account_number text,
  document_date date not null,
  valid_until date,
  performance_date date,
  performance_time time,
  seating_summary text,
  guest_count integer check (guest_count is null or guest_count >= 0),
  customer_notes text,
  internal_notes text,
  payment_terms text,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  accepted_at timestamptz,
  accepted_by text,
  acceptance_evidence text,
  accepted_version integer,
  xero_tenant_id text,
  xero_contact_id text,
  xero_document_id text,
  xero_document_number text,
  xero_status text,
  sync_status text not null default 'local_only' check (sync_status in ('local_only','paused','pending','syncing','synced','error','action_required')),
  created_by_staff_profile_id uuid not null references public.staff_profiles(id),
  updated_by_staff_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xero_acceptance_complete check ((accepted_at is null and accepted_by is null and accepted_version is null) or (accepted_at is not null and accepted_by is not null and accepted_version is not null)),
  constraint xero_issued_invoice_authority check (kind <> 'invoice' or status in ('draft','revised') or xero_document_id is not null)
);

create index if not exists xero_documents_created_idx on public.xero_documents(created_at desc, id desc);
create index if not exists xero_documents_booking_idx on public.xero_documents(source_booking_id, created_at desc);
create index if not exists xero_documents_venue_idx on public.xero_documents(venue, created_at desc);
create unique index if not exists xero_documents_one_invoice_per_quote_idx on public.xero_documents(source_quote_id) where kind = 'invoice' and source_quote_id is not null;

create table if not exists public.xero_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.xero_documents(id),
  version integer not null,
  snapshot jsonb not null,
  created_by_staff_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create or replace function public.assign_xero_local_document_reference()
returns trigger language plpgsql set search_path = public as $$
begin
  if nullif(new.local_reference, '') is null then
    new.local_reference := case
      when new.kind = 'quote' then 'ZQ-' || lpad(nextval('public.zingara_quote_number_seq')::text, 6, '0')
      else 'ZD-' || lpad(nextval('public.zingara_invoice_draft_number_seq')::text, 6, '0')
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists xero_documents_assign_local_reference on public.xero_documents;
create trigger xero_documents_assign_local_reference before insert on public.xero_documents for each row execute function public.assign_xero_local_document_reference();

create or replace function public.create_xero_document_draft_atomic(
  p_document jsonb,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.xero_documents
language plpgsql
security definer
set search_path = public
as $$
declare v_document public.xero_documents%rowtype;
begin
  insert into public.xero_documents (
    account_number,billing_address,company_id,contact_customer_id,created_by_staff_profile_id,
    currency_code,customer_email,customer_name,customer_notes,document_date,guest_count,
    internal_notes,kind,line_amount_type,lines,payment_terms,performance_date,performance_time,
    seating_summary,source_booking_id,source_booking_reference,source_corporate_request_id,status,
    subtotal_cents,sync_status,tax_cents,total_cents,updated_by_staff_profile_id,valid_until,venue
  ) values (
    nullif(p_document->>'account_number',''),nullif(p_document->>'billing_address',''),nullif(p_document->>'company_id','')::uuid,
    nullif(p_document->>'contact_customer_id','')::uuid,p_actor_staff_profile_id,'ZAR',nullif(p_document->>'customer_email',''),
    p_document->>'customer_name',nullif(p_document->>'customer_notes',''),(p_document->>'document_date')::date,
    nullif(p_document->>'guest_count','')::integer,nullif(p_document->>'internal_notes',''),p_document->>'kind',
    p_document->>'line_amount_type',p_document->'lines',nullif(p_document->>'payment_terms',''),
    nullif(p_document->>'performance_date','')::date,nullif(p_document->>'performance_time','')::time,
    nullif(p_document->>'seating_summary',''),nullif(p_document->>'source_booking_id','')::uuid,
    nullif(p_document->>'source_booking_reference',''),nullif(p_document->>'source_corporate_request_id','')::uuid,
    'draft',(p_document->>'subtotal_cents')::bigint,'local_only',(p_document->>'tax_cents')::bigint,
    (p_document->>'total_cents')::bigint,p_actor_staff_profile_id,nullif(p_document->>'valid_until','')::date,
    p_document->>'venue'
  ) returning * into v_document;

  insert into public.xero_document_versions(document_id,version,snapshot,created_by_staff_profile_id)
  values(v_document.id,1,to_jsonb(v_document),p_actor_staff_profile_id);

  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_location,entity_reference,entity_type,outcome,source_area)
  values('xero_'||v_document.kind||'_draft_created',p_actor_auth_user_id,p_actor_location_scope,p_actor_name,p_actor_role,p_actor_staff_profile_id,jsonb_build_object('kind',v_document.kind,'status','draft','totalCents',v_document.total_cents),'{}'::jsonb,array['kind','status','totalCents'],v_document.id::text,v_document.venue,v_document.local_reference,'accounting-document','success','xero-foundation');
  return v_document;
end;
$$;

create or replace function public.accept_xero_quote_atomic(
  p_document_id uuid,p_expected_version integer,p_accepted_by text,p_evidence text,
  p_actor_auth_user_id uuid,p_actor_staff_profile_id uuid,p_actor_name text,p_actor_role text,p_actor_location_scope text[]
)
returns public.xero_documents language plpgsql security definer set search_path=public as $$
declare v_document public.xero_documents%rowtype; v_before_status text;
begin
  select * into v_document from public.xero_documents where id=p_document_id for update;
  if v_document.id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_document.kind <> 'quote' or v_document.version <> p_expected_version or v_document.accepted_at is not null or v_document.status not in ('draft','revised','issued','sent') then raise exception 'DOCUMENT_CHANGED'; end if;
  v_before_status := v_document.status;
  update public.xero_documents set accepted_at=now(),accepted_by=p_accepted_by,acceptance_evidence=p_evidence,accepted_version=version,status='accepted',updated_at=now(),updated_by_staff_profile_id=p_actor_staff_profile_id where id=v_document.id returning * into v_document;
  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_location,entity_reference,entity_type,outcome,source_area)
  values('xero_quote_accepted',p_actor_auth_user_id,p_actor_location_scope,p_actor_name,p_actor_role,p_actor_staff_profile_id,jsonb_build_object('status','accepted','version',v_document.version,'acceptedBy',p_accepted_by),jsonb_build_object('status',v_before_status),array['status','acceptedAt','acceptedBy'],v_document.id::text,v_document.venue,v_document.local_reference,'accounting-document','success','xero-foundation');
  return v_document;
end; $$;

create or replace function public.convert_xero_quote_to_invoice_draft_atomic(
  p_document_id uuid,p_expected_version integer,p_actor_auth_user_id uuid,p_actor_staff_profile_id uuid,p_actor_name text,p_actor_role text,p_actor_location_scope text[]
)
returns public.xero_documents language plpgsql security definer set search_path=public as $$
declare v_quote public.xero_documents%rowtype; v_invoice public.xero_documents%rowtype;
begin
  select * into v_quote from public.xero_documents where id=p_document_id for update;
  if v_quote.id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_quote.kind <> 'quote' or v_quote.status <> 'accepted' or v_quote.version <> p_expected_version or v_quote.accepted_version <> v_quote.version then raise exception 'QUOTE_NOT_ACCEPTED'; end if;
  if exists(select 1 from public.xero_documents where source_quote_id=v_quote.id and kind='invoice') then raise exception 'INVOICE_ALREADY_EXISTS'; end if;
  insert into public.xero_documents(kind,source_quote_id,source_booking_id,source_booking_reference,source_corporate_request_id,company_id,contact_customer_id,venue,status,version,currency_code,line_amount_type,customer_name,customer_email,billing_address,account_number,document_date,performance_date,performance_time,seating_summary,guest_count,customer_notes,internal_notes,payment_terms,lines,subtotal_cents,tax_cents,total_cents,sync_status,created_by_staff_profile_id,updated_by_staff_profile_id)
  values('invoice',v_quote.id,v_quote.source_booking_id,v_quote.source_booking_reference,v_quote.source_corporate_request_id,v_quote.company_id,v_quote.contact_customer_id,v_quote.venue,'draft',1,v_quote.currency_code,v_quote.line_amount_type,v_quote.customer_name,v_quote.customer_email,v_quote.billing_address,v_quote.account_number,current_date,v_quote.performance_date,v_quote.performance_time,v_quote.seating_summary,v_quote.guest_count,v_quote.customer_notes,'Converted from '||v_quote.local_reference,v_quote.payment_terms,v_quote.lines,v_quote.subtotal_cents,v_quote.tax_cents,v_quote.total_cents,'local_only',p_actor_staff_profile_id,p_actor_staff_profile_id) returning * into v_invoice;
  insert into public.xero_document_versions(document_id,version,snapshot,created_by_staff_profile_id) values(v_invoice.id,1,to_jsonb(v_invoice),p_actor_staff_profile_id);
  update public.xero_documents set status='converted',updated_at=now(),updated_by_staff_profile_id=p_actor_staff_profile_id where id=v_quote.id;
  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_location,entity_reference,entity_type,outcome,source_area)
  values('xero_quote_converted_to_invoice_draft',p_actor_auth_user_id,p_actor_location_scope,p_actor_name,p_actor_role,p_actor_staff_profile_id,jsonb_build_object('invoiceDraftReference',v_invoice.local_reference,'quoteReference',v_quote.local_reference),jsonb_build_object('quoteStatus','accepted'),array['quoteStatus','invoiceDraftReference'],v_invoice.id::text,v_invoice.venue,v_invoice.local_reference,'accounting-document','success','xero-foundation');
  return v_invoice;
end; $$;

create table if not exists public.xero_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  document_id uuid references public.xero_documents(id),
  operation text not null,
  idempotency_key text not null unique,
  dependency_key text,
  payload jsonb not null,
  status text not null default 'paused' check (status in ('paused','pending','processing','succeeded','failed','blocked')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists xero_sync_outbox_queue_idx on public.xero_sync_outbox(status, next_attempt_at, created_at);

create table if not exists public.xero_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  event_key text not null unique,
  event_type text not null,
  resource_id text,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create or replace function public.prevent_xero_document_version_mutation()
returns trigger language plpgsql as $$ begin raise exception 'Xero document versions are append-only'; end; $$;
drop trigger if exists xero_document_versions_no_update on public.xero_document_versions;
create trigger xero_document_versions_no_update before update or delete on public.xero_document_versions for each row execute function public.prevent_xero_document_version_mutation();

alter table public.xero_connections enable row level security;
alter table public.xero_account_mappings enable row level security;
alter table public.xero_documents enable row level security;
alter table public.xero_document_versions enable row level security;
alter table public.xero_sync_outbox enable row level security;
alter table public.xero_webhook_receipts enable row level security;
revoke all on public.xero_connections, public.xero_account_mappings, public.xero_documents, public.xero_document_versions, public.xero_sync_outbox, public.xero_webhook_receipts from public, anon, authenticated;
grant select, insert, update on public.xero_connections, public.xero_account_mappings, public.xero_documents, public.xero_sync_outbox, public.xero_webhook_receipts to service_role;
grant select, insert on public.xero_document_versions to service_role;
grant usage, select on sequence public.zingara_quote_number_seq to service_role;
grant usage, select on sequence public.zingara_invoice_draft_number_seq to service_role;
revoke all on function public.create_xero_document_draft_atomic(jsonb,uuid,uuid,text,text,text[]) from public, anon, authenticated;
revoke all on function public.accept_xero_quote_atomic(uuid,integer,text,text,uuid,uuid,text,text,text[]) from public, anon, authenticated;
revoke all on function public.convert_xero_quote_to_invoice_draft_atomic(uuid,integer,uuid,uuid,text,text,text[]) from public, anon, authenticated;
grant execute on function public.create_xero_document_draft_atomic(jsonb,uuid,uuid,text,text,text[]) to service_role;
grant execute on function public.accept_xero_quote_atomic(uuid,integer,text,text,uuid,uuid,text,text,text[]) to service_role;
grant execute on function public.convert_xero_quote_to_invoice_draft_atomic(uuid,integer,uuid,uuid,text,text,text[]) to service_role;

comment on table public.xero_connections is 'Server-only Xero connection metadata. Live sync remains paused until Accounts approves tenant and mappings.';
comment on table public.xero_documents is 'Operational quote and local invoice draft snapshots. Issued accounting invoices require a Xero document identity.';
comment on table public.xero_sync_outbox is 'Durable, idempotent outbound accounting work. Rows are paused by default.';
