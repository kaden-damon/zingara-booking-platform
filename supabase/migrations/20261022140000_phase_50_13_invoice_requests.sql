-- Phase 50.13: accepted quotation handover to Accounts and reminder routing.

alter table public.xero_documents
  add column if not exists invoice_requested_at timestamptz,
  add column if not exists invoice_requested_by_staff_profile_id uuid references public.staff_profiles(id),
  add column if not exists invoice_requested_version integer;

alter table public.xero_documents
  drop constraint if exists xero_invoice_request_complete,
  add constraint xero_invoice_request_complete check (
    (invoice_requested_at is null and invoice_requested_by_staff_profile_id is null and invoice_requested_version is null)
    or
    (invoice_requested_at is not null and invoice_requested_by_staff_profile_id is not null and invoice_requested_version is not null)
  ),
  drop constraint if exists xero_invoice_request_quote_only,
  add constraint xero_invoice_request_quote_only check (
    invoice_requested_at is null or kind = 'quote'
  );

create index if not exists xero_documents_invoice_request_queue_idx
  on public.xero_documents(invoice_requested_at asc, id asc)
  where kind = 'quote' and status = 'accepted' and invoice_requested_at is not null;

create table if not exists public.xero_quote_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.xero_documents(id),
  document_version integer not null,
  recipient text not null,
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  attempt_count integer not null default 1,
  last_error text,
  provider_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id, document_version)
);

alter table public.xero_quote_email_deliveries enable row level security;
revoke all on public.xero_quote_email_deliveries from public, anon, authenticated;
grant select, insert, update on public.xero_quote_email_deliveries to service_role;

create or replace function public.claim_xero_quote_email_delivery(
  p_document_id uuid,
  p_expected_version integer,
  p_recipient text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.xero_documents%rowtype;
  v_delivery_id uuid;
begin
  select * into v_quote
  from public.xero_documents
  where id = p_document_id
  for update;

  if v_quote.id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_quote.kind <> 'quote'
    or v_quote.version <> p_expected_version
    or v_quote.status not in ('draft','revised','issued','sent')
    or v_quote.accepted_at is not null then
    raise exception 'QUOTE_NOT_SENDABLE';
  end if;
  if lower(coalesce(v_quote.customer_email, '')) <> lower(trim(p_recipient)) then
    raise exception 'QUOTE_RECIPIENT_CHANGED';
  end if;

  insert into public.xero_quote_email_deliveries(
    document_id, document_version, recipient
  ) values (
    v_quote.id, v_quote.version, trim(p_recipient)
  )
  on conflict(document_id, document_version) do update
  set status = 'processing',
      recipient = excluded.recipient,
      attempt_count = public.xero_quote_email_deliveries.attempt_count + 1,
      last_error = null,
      updated_at = clock_timestamp()
  where public.xero_quote_email_deliveries.status = 'failed'
  returning id into v_delivery_id;

  return v_delivery_id;
end;
$$;

create or replace function public.complete_xero_quote_email_delivery(
  p_delivery_id uuid,
  p_status text,
  p_error_message text,
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
declare
  v_delivery public.xero_quote_email_deliveries%rowtype;
  v_quote public.xero_documents%rowtype;
  v_before_status text;
begin
  if p_status not in ('sent','failed') then raise exception 'INVALID_DELIVERY_STATUS'; end if;

  select * into v_delivery
  from public.xero_quote_email_deliveries
  where id = p_delivery_id
  for update;
  if v_delivery.id is null or v_delivery.status <> 'processing' then
    raise exception 'DELIVERY_NOT_ACTIVE';
  end if;

  update public.xero_quote_email_deliveries
  set status = p_status,
      last_error = case when p_status = 'failed' then left(p_error_message, 1000) else null end,
      provider_accepted_at = case when p_status = 'sent' then clock_timestamp() else null end,
      updated_at = clock_timestamp()
  where id = v_delivery.id;

  select * into v_quote
  from public.xero_documents
  where id = v_delivery.document_id
  for update;

  if p_status = 'sent' then
    if v_quote.version <> v_delivery.document_version
      or v_quote.status not in ('draft','revised','issued','sent')
      or v_quote.accepted_at is not null then
      raise exception 'QUOTE_CHANGED_DURING_DELIVERY';
    end if;
    v_before_status := v_quote.status;
    update public.xero_documents
    set status = 'sent', updated_at = clock_timestamp(), updated_by_staff_profile_id = p_actor_staff_profile_id
    where id = v_quote.id
    returning * into v_quote;

    insert into public.audit_events(
      action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,
      actor_staff_profile_id,after_values,before_values,changed_fields,
      entity_id,entity_location,entity_reference,entity_type,outcome,source_area
    ) values (
      'xero_quote_email_provider_accepted',p_actor_auth_user_id,p_actor_location_scope,
      p_actor_name,p_actor_role,p_actor_staff_profile_id,
      jsonb_build_object('status','sent','version',v_quote.version,'recipient',v_delivery.recipient),
      jsonb_build_object('status',v_before_status),array['status'],v_quote.id::text,
      v_quote.venue,v_quote.local_reference,'accounting-document','success','xero-foundation'
    );
  end if;

  return v_quote;
end;
$$;

revoke all on function public.claim_xero_quote_email_delivery(uuid,integer,text)
  from public, anon, authenticated;
revoke all on function public.complete_xero_quote_email_delivery(uuid,text,text,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.claim_xero_quote_email_delivery(uuid,integer,text)
  to service_role;
grant execute on function public.complete_xero_quote_email_delivery(uuid,text,text,uuid,uuid,text,text,text[])
  to service_role;

create or replace function public.request_xero_invoice_atomic(
  p_document_id uuid,
  p_expected_version integer,
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
declare
  v_quote public.xero_documents%rowtype;
begin
  select * into v_quote
  from public.xero_documents
  where id = p_document_id
  for update;

  if v_quote.id is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  if v_quote.kind <> 'quote'
    or v_quote.status <> 'accepted'
    or v_quote.version <> p_expected_version
    or v_quote.accepted_version <> v_quote.version then
    raise exception 'QUOTE_NOT_ELIGIBLE';
  end if;
  if exists (
    select 1 from public.xero_documents
    where source_quote_id = v_quote.id and kind = 'invoice'
  ) then
    raise exception 'INVOICE_ALREADY_EXISTS';
  end if;
  if v_quote.invoice_requested_at is not null then
    raise exception 'INVOICE_ALREADY_REQUESTED';
  end if;

  update public.xero_documents
  set invoice_requested_at = clock_timestamp(),
      invoice_requested_by_staff_profile_id = p_actor_staff_profile_id,
      invoice_requested_version = v_quote.version,
      updated_at = clock_timestamp(),
      updated_by_staff_profile_id = p_actor_staff_profile_id
  where id = v_quote.id
  returning * into v_quote;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_invoice_requested', p_actor_auth_user_id, p_actor_location_scope,
    p_actor_name, p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object(
      'invoiceRequestedAt', v_quote.invoice_requested_at,
      'invoiceRequestedVersion', v_quote.invoice_requested_version,
      'quoteReference', v_quote.local_reference
    ),
    jsonb_build_object('status', 'accepted'),
    array['invoiceRequestedAt','invoiceRequestedVersion'],
    v_quote.id::text, v_quote.venue, v_quote.local_reference,
    'accounting-document', 'success', 'xero-foundation'
  );

  return v_quote;
end;
$$;

create or replace function public.convert_xero_quote_to_invoice_draft_atomic(
  p_document_id uuid,p_expected_version integer,p_actor_auth_user_id uuid,p_actor_staff_profile_id uuid,p_actor_name text,p_actor_role text,p_actor_location_scope text[]
)
returns public.xero_documents language plpgsql security definer set search_path=public as $$
declare v_quote public.xero_documents%rowtype; v_invoice public.xero_documents%rowtype;
begin
  select * into v_quote from public.xero_documents where id=p_document_id for update;
  if v_quote.id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_quote.kind <> 'quote' or v_quote.status <> 'accepted' or v_quote.version <> p_expected_version or v_quote.accepted_version <> v_quote.version then raise exception 'QUOTE_NOT_ACCEPTED'; end if;
  if v_quote.invoice_requested_at is null or v_quote.invoice_requested_version <> v_quote.accepted_version then raise exception 'INVOICE_NOT_REQUESTED'; end if;
  if exists(select 1 from public.xero_documents where source_quote_id=v_quote.id and kind='invoice') then raise exception 'INVOICE_ALREADY_EXISTS'; end if;
  insert into public.xero_documents(kind,source_quote_id,source_booking_id,source_booking_reference,source_corporate_request_id,company_id,contact_customer_id,venue,status,version,currency_code,line_amount_type,customer_name,customer_email,billing_address,account_number,document_date,performance_date,performance_time,seating_summary,guest_count,customer_notes,internal_notes,payment_terms,lines,subtotal_cents,tax_cents,total_cents,sync_status,created_by_staff_profile_id,updated_by_staff_profile_id)
  values('invoice',v_quote.id,v_quote.source_booking_id,v_quote.source_booking_reference,v_quote.source_corporate_request_id,v_quote.company_id,v_quote.contact_customer_id,v_quote.venue,'draft',1,v_quote.currency_code,v_quote.line_amount_type,v_quote.customer_name,v_quote.customer_email,v_quote.billing_address,v_quote.account_number,current_date,v_quote.performance_date,v_quote.performance_time,v_quote.seating_summary,v_quote.guest_count,v_quote.customer_notes,'Converted from '||v_quote.local_reference,v_quote.payment_terms,v_quote.lines,v_quote.subtotal_cents,v_quote.tax_cents,v_quote.total_cents,'local_only',p_actor_staff_profile_id,p_actor_staff_profile_id) returning * into v_invoice;
  insert into public.xero_document_versions(document_id,version,snapshot,created_by_staff_profile_id) values(v_invoice.id,1,to_jsonb(v_invoice),p_actor_staff_profile_id);
  update public.xero_documents set status='converted',updated_at=now(),updated_by_staff_profile_id=p_actor_staff_profile_id where id=v_quote.id;
  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_location,entity_reference,entity_type,outcome,source_area)
  values('xero_quote_converted_to_invoice_draft',p_actor_auth_user_id,p_actor_location_scope,p_actor_name,p_actor_role,p_actor_staff_profile_id,jsonb_build_object('invoiceDraftReference',v_invoice.local_reference,'quoteReference',v_quote.local_reference,'invoiceRequestAt',v_quote.invoice_requested_at),jsonb_build_object('quoteStatus','accepted'),array['quoteStatus','invoiceDraftReference'],v_invoice.id::text,v_invoice.venue,v_invoice.local_reference,'accounting-document','success','xero-foundation');
  return v_invoice;
end; $$;

revoke all on function public.request_xero_invoice_atomic(uuid,integer,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.request_xero_invoice_atomic(uuid,integer,uuid,uuid,text,text,text[])
  to service_role;

alter table public.management_email_notification_routes
  drop constraint if exists management_email_notification_routes_key_check,
  add constraint management_email_notification_routes_key_check check (
    notification_key in ('corporate-enquiry','new-review-alert','invoice-request-reminders')
  );

do $$
declare
  v_tristan uuid := '1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d';
  v_rachelle uuid := '3ea8ff16-d914-477b-95fc-23380e71019a';
  v_wagheeda uuid := '6ae026bc-8815-4fea-b56c-b2103eb0c093';
  v_verified integer;
begin
  select count(*) into v_verified
  from public.staff_profiles
  where id in (v_tristan, v_rachelle, v_wagheeda)
    and active = true
    and nullif(trim(email), '') is not null;

  if v_verified <> 3 then
    raise exception 'Authoritative Tristan, Rachelle and Wagheeda staff profiles are required for invoice request reminders';
  end if;

  insert into public.management_email_notification_routes(
    notification_key, enabled, to_staff_profile_ids, cc_staff_profile_ids
  ) values (
    'invoice-request-reminders', false,
    array[v_tristan, v_rachelle, v_wagheeda], '{}'
  )
  on conflict (notification_key) do nothing;
end;
$$;

comment on column public.xero_documents.invoice_requested_at is
  'Timestamp of the durable Sales-to-Accounts handover for the accepted quotation version.';
comment on column public.xero_documents.invoice_requested_version is
  'Exact immutable accepted quotation version requested for invoicing.';

create table if not exists public.xero_banking_documents (
  id uuid primary key default gen_random_uuid(), version integer not null unique,
  storage_path text not null unique, original_filename text not null,
  mime_type text not null check (mime_type='application/pdf'),
  file_size bigint not null check (file_size>0 and file_size<=8388608),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_staff_profile_id uuid not null references public.staff_profiles(id),
  uploaded_at timestamptz not null default now()
);
create table if not exists public.xero_active_banking_document (
  singleton boolean primary key default true check(singleton),
  document_id uuid not null references public.xero_banking_documents(id),
  activated_by_staff_profile_id uuid not null references public.staff_profiles(id),
  activated_at timestamptz not null default now()
);
alter table public.xero_banking_documents enable row level security;
alter table public.xero_active_banking_document enable row level security;
revoke all on public.xero_banking_documents,public.xero_active_banking_document from public,anon,authenticated;
grant select,insert on public.xero_banking_documents to service_role;
grant select,insert,update on public.xero_active_banking_document to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('xero-banking-confirmations','xero-banking-confirmations',false,8388608,array['application/pdf']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.activate_xero_banking_document(
  p_storage_path text,p_original_filename text,p_file_size bigint,p_sha256 text,
  p_actor_auth_user_id uuid,p_actor_staff_profile_id uuid,p_actor_name text,p_actor_role text,p_actor_location_scope text[]
) returns public.xero_banking_documents language plpgsql security definer set search_path=public as $$
declare v_document public.xero_banking_documents%rowtype; v_version integer;
begin
  if p_actor_staff_profile_id not in ('e8598359-54a0-4e1f-a635-1ec8ae02cb78'::uuid,'6ae026bc-8815-4fea-b56c-b2103eb0c093'::uuid) then raise exception 'BANKING_DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.staff_profiles where id=p_actor_staff_profile_id and active=true for update;
  if not found then raise exception 'STAFF_NOT_ACTIVE'; end if;
  select coalesce(max(version),0)+1 into v_version from public.xero_banking_documents;
  insert into public.xero_banking_documents(version,storage_path,original_filename,mime_type,file_size,sha256,uploaded_by_staff_profile_id)
  values(v_version,p_storage_path,p_original_filename,'application/pdf',p_file_size,p_sha256,p_actor_staff_profile_id) returning * into v_document;
  insert into public.xero_active_banking_document(singleton,document_id,activated_by_staff_profile_id)
  values(true,v_document.id,p_actor_staff_profile_id)
  on conflict(singleton) do update set document_id=excluded.document_id,activated_by_staff_profile_id=excluded.activated_by_staff_profile_id,activated_at=clock_timestamp();
  insert into public.audit_events(action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,actor_staff_profile_id,after_values,before_values,changed_fields,entity_id,entity_reference,entity_type,outcome,source_area)
  values('xero_banking_confirmation_activated',p_actor_auth_user_id,p_actor_location_scope,p_actor_name,p_actor_role,p_actor_staff_profile_id,jsonb_build_object('documentId',v_document.id,'version',v_document.version,'sha256',v_document.sha256),'{}'::jsonb,array['activeBankingDocument'],v_document.id::text,'banking-confirmation-v'||v_document.version,'accounting-document','success','xero-foundation');
  return v_document;
end; $$;

create table if not exists public.xero_quote_acceptance_links (
  id uuid primary key default gen_random_uuid(), token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  document_id uuid not null references public.xero_documents(id), document_version integer not null,
  banking_document_id uuid not null references public.xero_banking_documents(id),
  sales_staff_profile_id uuid not null references public.staff_profiles(id),
  customer_email_normalized text not null, total_cents bigint not null, currency_code text not null,
  snapshot jsonb not null, status text not null default 'active' check(status in ('active','accepted','revoked')),
  expires_at timestamptz not null, created_at timestamptz not null default now(), accepted_at timestamptz, acceptance_metadata jsonb
);
create index if not exists xero_quote_acceptance_links_lookup_idx on public.xero_quote_acceptance_links(token_hash,status);
alter table public.xero_quote_acceptance_links enable row level security;
revoke all on public.xero_quote_acceptance_links from public,anon,authenticated;
grant select,insert,update on public.xero_quote_acceptance_links to service_role;
alter table public.xero_quote_email_deliveries
  add column if not exists acceptance_link_id uuid references public.xero_quote_acceptance_links(id),
  add column if not exists banking_document_id uuid references public.xero_banking_documents(id);

create or replace function public.create_xero_quote_acceptance_link(
  p_document_id uuid,p_expected_version integer,p_token_hash text,p_banking_document_id uuid,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_quote public.xero_documents%rowtype; v_snapshot jsonb; v_link_id uuid;
begin
  select * into v_quote from public.xero_documents where id=p_document_id for update;
  if v_quote.id is null or v_quote.kind<>'quote' or v_quote.version<>p_expected_version or v_quote.status not in ('draft','revised','issued','sent') or v_quote.accepted_at is not null then raise exception 'QUOTE_NOT_SENDABLE'; end if;
  if not exists(select 1 from public.xero_active_banking_document where singleton=true and document_id=p_banking_document_id) then raise exception 'BANKING_DOCUMENT_NOT_ACTIVE'; end if;
  select snapshot into v_snapshot from public.xero_document_versions where document_id=v_quote.id and version=v_quote.version;
  if v_snapshot is null then raise exception 'QUOTE_SNAPSHOT_MISSING'; end if;
  update public.xero_quote_acceptance_links set status='revoked' where document_id=v_quote.id and status='active';
  insert into public.xero_quote_acceptance_links(token_hash,document_id,document_version,banking_document_id,sales_staff_profile_id,customer_email_normalized,total_cents,currency_code,snapshot,expires_at)
  values(p_token_hash,v_quote.id,v_quote.version,p_banking_document_id,v_quote.created_by_staff_profile_id,lower(trim(v_quote.customer_email)),v_quote.total_cents,v_quote.currency_code,v_snapshot,p_expires_at) returning id into v_link_id;
  return v_link_id;
end; $$;

create or replace function public.accept_xero_quote_by_token_atomic(p_token_hash text,p_metadata jsonb)
returns public.xero_documents language plpgsql security definer set search_path=public as $$
declare v_link public.xero_quote_acceptance_links%rowtype; v_quote public.xero_documents%rowtype;
begin
  select * into v_link from public.xero_quote_acceptance_links where token_hash=p_token_hash for update;
  if v_link.id is null then raise exception 'LINK_NOT_FOUND'; end if;
  select * into v_quote from public.xero_documents where id=v_link.document_id for update;
  if v_link.status='accepted' and v_quote.accepted_version=v_link.document_version then return v_quote; end if;
  if v_link.status<>'active' or v_link.expires_at<=now() or v_quote.version<>v_link.document_version or v_quote.status<>'sent' or v_quote.accepted_at is not null or v_quote.total_cents<>v_link.total_cents or v_quote.currency_code<>v_link.currency_code then raise exception 'LINK_NOT_ACCEPTABLE'; end if;
  update public.xero_documents set accepted_at=clock_timestamp(),accepted_by='Customer online acceptance',acceptance_evidence='Secure exact-version customer acceptance',accepted_version=version,status='accepted',updated_at=clock_timestamp() where id=v_quote.id returning * into v_quote;
  update public.xero_quote_acceptance_links set status='accepted',accepted_at=clock_timestamp(),acceptance_metadata=coalesce(p_metadata,'{}'::jsonb) where id=v_link.id;
  update public.xero_quote_acceptance_links set status='revoked' where document_id=v_quote.id and id<>v_link.id and status='active';
  insert into public.audit_events(action,actor_name,actor_role,after_values,before_values,changed_fields,entity_id,entity_location,entity_reference,entity_type,outcome,source_area)
  values('xero_quote_customer_accepted','Customer','Customer',jsonb_build_object('status','accepted','version',v_link.document_version,'totalCents',v_link.total_cents,'currency',v_link.currency_code,'snapshot',v_link.snapshot,'acceptanceLinkId',v_link.id,'metadata',coalesce(p_metadata,'{}'::jsonb)),jsonb_build_object('status','sent'),array['status','acceptedAt','acceptedVersion'],v_quote.id::text,v_quote.venue,v_quote.local_reference,'accounting-document','success','xero-foundation');
  return v_quote;
end; $$;

create or replace function public.revoke_stale_xero_quote_acceptance_links() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.version<>old.version or new.accepted_at is not null or new.status not in ('draft','revised','issued','sent') then
    update public.xero_quote_acceptance_links set status='revoked' where document_id=new.id and status='active';
  end if;
  return new;
end; $$;
drop trigger if exists xero_documents_revoke_stale_acceptance_links on public.xero_documents;
create trigger xero_documents_revoke_stale_acceptance_links after update on public.xero_documents for each row execute function public.revoke_stale_xero_quote_acceptance_links();

revoke all on function public.activate_xero_banking_document(text,text,bigint,text,uuid,uuid,text,text,text[]) from public,anon,authenticated;
revoke all on function public.create_xero_quote_acceptance_link(uuid,integer,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.accept_xero_quote_by_token_atomic(text,jsonb) from public,anon,authenticated;
grant execute on function public.activate_xero_banking_document(text,text,bigint,text,uuid,uuid,text,text,text[]) to service_role;
grant execute on function public.create_xero_quote_acceptance_link(uuid,integer,text,uuid,timestamptz) to service_role;
grant execute on function public.accept_xero_quote_by_token_atomic(text,jsonb) to service_role;
