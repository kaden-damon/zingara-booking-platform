-- Phase 50.4G: immutable activation boundary for future, manually approved invoices.

alter table public.xero_connections
  add column if not exists live_sync_activated_at timestamptz;

comment on column public.xero_connections.live_sync_activated_at is
  'Immutable first live-sync activation boundary. Documents created before this time are never released automatically.';

create or replace function public.activate_xero_connection_atomic(
  p_connection_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.xero_connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.xero_connections%rowtype;
  v_was_active boolean;
begin
  select * into v_connection
  from public.xero_connections
  where id = p_connection_id
  for update;

  if v_connection.id is null or v_connection.tenant_id is null then
    raise exception 'XERO_CONNECTION_NOT_READY';
  end if;

  v_was_active := v_connection.status = 'connected' and v_connection.sync_paused = false;

  update public.xero_connections
  set status = 'connected',
      sync_paused = false,
      live_sync_activated_at = coalesce(live_sync_activated_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where id = v_connection.id
  returning * into v_connection;

  if not v_was_active then
    insert into public.audit_events(
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_location, entity_reference, entity_type, outcome, source_area
    ) values (
      'xero_live_sync_activated', p_actor_auth_user_id, p_actor_location_scope,
      p_actor_name, p_actor_role, p_actor_staff_profile_id,
      jsonb_build_object(
        'status', v_connection.status,
        'syncPaused', v_connection.sync_paused,
        'liveSyncActivatedAt', v_connection.live_sync_activated_at,
        'scope', 'future-requested-invoices-only'
      ),
      jsonb_build_object('status', 'sync_paused', 'syncPaused', true),
      array['status', 'syncPaused', 'liveSyncActivatedAt'],
      v_connection.id::text, 'all', v_connection.tenant_name,
      'xero-connection', 'success', 'xero-settings'
    );
  end if;

  return v_connection;
end;
$$;

revoke all on function public.activate_xero_connection_atomic(uuid,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.activate_xero_connection_atomic(uuid,uuid,uuid,text,text,text[])
  to service_role;

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
      and o.operation='document.sync'
      and c.status='connected' and c.sync_paused=false
      and c.live_sync_activated_at is not null
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

revoke all on function public.claim_xero_sync_outbox(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_xero_sync_outbox(text,integer,integer)
  to service_role;

comment on function public.claim_xero_sync_outbox(text,integer,integer) is
  'Claims bounded future document sync only. Payment, refund, credit-note and historical work remains excluded from initial activation.';

create or replace function public.queue_xero_invoice_sync_atomic(
  p_document_id uuid,
  p_expected_version integer,
  p_tenant_id text,
  p_idempotency_key text,
  p_payload jsonb,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.xero_sync_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.xero_connections%rowtype;
  v_document public.xero_documents%rowtype;
  v_quote public.xero_documents%rowtype;
  v_item public.xero_sync_outbox%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_staff_profile_id not in (
    '1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d'::uuid,
    '3ea8ff16-d914-477b-95fc-23380e71019a'::uuid
  ) then
    raise exception 'XERO_INVOICE_CONVERTER_NOT_AUTHORISED';
  end if;

  select * into v_connection
  from public.xero_connections
  where tenant_id = p_tenant_id
  for update;
  if v_connection.id is null
     or v_connection.status <> 'connected'
     or v_connection.sync_paused
     or v_connection.live_sync_activated_at is null then
    raise exception 'XERO_LIVE_SYNC_NOT_READY';
  end if;

  select * into v_document
  from public.xero_documents
  where id = p_document_id
  for update;
  if v_document.id is null
     or v_document.kind <> 'invoice'
     or v_document.status not in ('draft', 'revised')
     or v_document.version <> p_expected_version
     or v_document.source_quote_id is null
     or v_document.xero_document_id is not null
     or v_document.sync_status <> 'local_only'
     or v_document.created_at < v_connection.live_sync_activated_at then
    raise exception 'XERO_INVOICE_NOT_ELIGIBLE';
  end if;

  select * into v_quote
  from public.xero_documents
  where id = v_document.source_quote_id
  for share;
  if v_quote.id is null
     or v_quote.kind <> 'quote'
     or v_quote.status <> 'converted'
     or v_quote.invoice_requested_at is null
     or v_quote.accepted_version is null
     or v_quote.invoice_requested_version <> v_quote.accepted_version then
    raise exception 'XERO_INVOICE_REQUEST_NOT_VERIFIED';
  end if;

  insert into public.xero_sync_outbox(
    document_id, idempotency_key, operation, payload, status, tenant_id, updated_at
  ) values (
    v_document.id, p_idempotency_key, 'document.sync', p_payload, 'pending',
    p_tenant_id, v_now
  )
  returning * into v_item;

  update public.xero_documents
  set sync_status = 'pending', xero_tenant_id = p_tenant_id, updated_at = v_now
  where id = v_document.id and version = v_document.version;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_invoice_sync_queued', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'syncStatus', 'pending',
      'tenantId', p_tenant_id,
      'scope', 'future-requested-invoices-only'
    ),
    jsonb_build_object('syncStatus', v_document.sync_status),
    array['syncStatus', 'xeroTenantId'],
    v_document.id::text, v_document.venue, v_document.local_reference,
    'accounting-document', 'success', 'xero-live-sync'
  );

  return v_item;
end;
$$;

revoke all on function public.queue_xero_invoice_sync_atomic(uuid,integer,text,text,jsonb,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.queue_xero_invoice_sync_atomic(uuid,integer,text,text,jsonb,uuid,uuid,text,text,text[])
  to service_role;

comment on function public.queue_xero_invoice_sync_atomic(uuid,integer,text,text,jsonb,uuid,uuid,text,text,text[]) is
  'Atomically queues one future, requested invoice conversion by the two authorised Accounts identities.';

create or replace function public.complete_xero_document_sync_atomic(
  p_outbox_id uuid,
  p_worker_id text,
  p_provider_resource_id text,
  p_provider_resource_number text,
  p_provider_status text
)
returns public.xero_sync_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.xero_sync_outbox%rowtype;
  v_document public.xero_documents%rowtype;
  v_expected_version integer;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_item
  from public.xero_sync_outbox
  where id = p_outbox_id
  for update;

  if v_item.id is null or v_item.status <> 'processing' or v_item.lease_owner is distinct from p_worker_id then
    raise exception 'XERO_SYNC_LEASE_CHANGED';
  end if;
  if v_item.operation <> 'document.sync' or v_item.document_id is null then
    raise exception 'XERO_SYNC_OPERATION_NOT_ALLOWED';
  end if;
  if nullif(p_provider_resource_id, '') is null then
    raise exception 'XERO_PROVIDER_ID_REQUIRED';
  end if;

  v_expected_version := nullif(v_item.payload->>'documentVersion', '')::integer;
  update public.xero_documents
  set sync_status = 'synced',
      updated_at = v_now,
      xero_document_id = p_provider_resource_id,
      xero_document_number = nullif(p_provider_resource_number, ''),
      xero_status = nullif(p_provider_status, '')
  where id = v_item.document_id
    and version = v_expected_version
    and xero_document_id is null
  returning * into v_document;

  if v_document.id is null then
    raise exception 'XERO_DOCUMENT_VERSION_CHANGED';
  end if;

  update public.xero_sync_outbox
  set completed_at = v_now,
      lease_expires_at = null,
      lease_owner = null,
      provider_resource_id = p_provider_resource_id,
      provider_resource_number = nullif(p_provider_resource_number, ''),
      provider_status = nullif(p_provider_status, ''),
      status = 'succeeded',
      updated_at = v_now
  where id = v_item.id
  returning * into v_item;

  insert into public.audit_events(
    action, actor_location_scope, actor_name, actor_role, after_values,
    before_values, changed_fields, entity_id, entity_location,
    entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_invoice_synced', '{}'::text[], 'Xero sync worker', 'system',
    jsonb_build_object(
      'syncStatus', 'synced',
      'xeroDocumentId', p_provider_resource_id,
      'xeroDocumentNumber', nullif(p_provider_resource_number, ''),
      'xeroStatus', nullif(p_provider_status, '')
    ),
    jsonb_build_object('syncStatus', 'pending'),
    array['syncStatus', 'xeroDocumentId', 'xeroDocumentNumber', 'xeroStatus'],
    v_document.id::text, v_document.venue, v_document.local_reference,
    'accounting-document', 'success', 'xero-live-sync'
  );

  return v_item;
end;
$$;

revoke all on function public.complete_xero_document_sync_atomic(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.complete_xero_document_sync_atomic(uuid,text,text,text,text)
  to service_role;

comment on function public.complete_xero_document_sync_atomic(uuid,text,text,text,text) is
  'Atomically records a provider-created Xero invoice and its immutable Zingara identity before completing the outbox item.';
