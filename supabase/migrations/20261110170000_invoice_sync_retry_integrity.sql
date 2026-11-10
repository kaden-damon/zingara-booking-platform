create or replace function public.retry_xero_invoice_sync_atomic(
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
     or v_document.xero_document_id is not null
     or v_document.sync_status not in ('action_required', 'error') then
    raise exception 'XERO_INVOICE_RETRY_NOT_ELIGIBLE';
  end if;

  select * into v_item
  from public.xero_sync_outbox
  where document_id = v_document.id
    and idempotency_key = p_idempotency_key
    and operation = 'document.sync'
  for update;
  if v_item.id is null or v_item.status not in ('blocked', 'failed') then
    raise exception 'XERO_INVOICE_RETRY_NOT_AVAILABLE';
  end if;

  update public.xero_sync_outbox
  set payload = p_payload,
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = null,
      last_error = null,
      lease_expires_at = null,
      lease_owner = null,
      updated_at = v_now
  where id = v_item.id
  returning * into v_item;

  update public.xero_documents
  set sync_status = 'pending', xero_tenant_id = p_tenant_id, updated_at = v_now
  where id = v_document.id and version = v_document.version;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_invoice_sync_retried', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('syncStatus', 'pending', 'tenantId', p_tenant_id),
    jsonb_build_object('syncStatus', v_document.sync_status),
    array['syncStatus'], v_document.id::text, v_document.venue,
    v_document.local_reference, 'accounting-document', 'success', 'xero-live-sync'
  );

  return v_item;
end;
$$;

revoke all on function public.retry_xero_invoice_sync_atomic(uuid,integer,text,text,jsonb,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.retry_xero_invoice_sync_atomic(uuid,integer,text,text,jsonb,uuid,uuid,text,text,text[])
  to service_role;

comment on function public.retry_xero_invoice_sync_atomic(uuid,integer,text,text,jsonb,uuid,uuid,text,text,text[]) is
  'Atomically retries one blocked invoice with a rebuilt payload after an authorised Accounts action.';

update public.xero_documents as document
set sync_status = 'action_required', updated_at = clock_timestamp()
where document.sync_status = 'pending'
  and document.xero_document_id is null
  and exists (
    select 1
    from public.xero_sync_outbox as outbox
    where outbox.document_id = document.id
      and outbox.operation = 'document.sync'
      and outbox.status in ('blocked', 'failed')
  );
