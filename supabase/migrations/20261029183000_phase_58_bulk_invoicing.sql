create table if not exists public.xero_bulk_invoice_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by_staff_profile_id uuid not null references public.staff_profiles(id),
  date_from date not null,
  date_to date not null,
  status text not null default 'preparing'
    check (status in ('preparing','drafts_ready','partially_failed','posting','completed','failed')),
  selected_count integer not null check (selected_count between 1 and 50),
  ready_count integer not null default 0,
  blocked_count integer not null default 0,
  failed_count integer not null default 0,
  posted_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (date_to >= date_from)
);

create table if not exists public.xero_bulk_invoice_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.xero_bulk_invoice_batches(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  document_id uuid references public.xero_documents(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued','preparing','draft_ready','blocked','failed','posting','posted')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, booking_id)
);

create index if not exists xero_bulk_invoice_batches_staff_created_idx
  on public.xero_bulk_invoice_batches(requested_by_staff_profile_id, created_at desc);
create index if not exists xero_bulk_invoice_items_batch_status_idx
  on public.xero_bulk_invoice_items(batch_id, status, created_at);
create index if not exists xero_bulk_invoice_items_document_idx
  on public.xero_bulk_invoice_items(document_id)
  where document_id is not null;

alter table public.xero_bulk_invoice_batches enable row level security;
alter table public.xero_bulk_invoice_items enable row level security;
revoke all on public.xero_bulk_invoice_batches, public.xero_bulk_invoice_items
  from public, anon, authenticated;
grant select, insert, update on public.xero_bulk_invoice_batches, public.xero_bulk_invoice_items
  to service_role;

comment on table public.xero_bulk_invoice_batches is
  'Durable, bounded Accounts batches for preparing one local invoice draft per booking.';
comment on table public.xero_bulk_invoice_items is
  'Per-booking progress for bulk invoice draft preparation and separately authorised posting.';

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
  v_booking public.bookings%rowtype;
  v_item public.xero_sync_outbox%rowtype;
  v_is_bulk boolean := false;
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
     or v_document.sync_status <> 'local_only'
     or v_document.created_at < v_connection.live_sync_activated_at then
    raise exception 'XERO_INVOICE_NOT_ELIGIBLE';
  end if;

  if v_document.source_quote_id is not null then
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
  else
    if v_document.source_booking_id is null then
      raise exception 'XERO_BOOKING_INVOICE_NOT_LINKED';
    end if;
    select * into v_booking
    from public.bookings
    where id = v_document.source_booking_id
    for share;
    select exists(
      select 1 from public.xero_bulk_invoice_items
      where document_id = v_document.id and status in ('draft_ready','posting')
    ) into v_is_bulk;
    if v_booking.id is null
       or v_booking.archived_at is not null
       or v_booking.booking_status not in ('new','pending_payment','confirmed','checked_in','completed')
       or round(v_booking.total_amount * 100)::bigint <> v_document.total_cents
       or (not v_is_bulk and (
         v_booking.booking_status <> 'confirmed'
         or v_booking.payment_status <> 'fully_paid'
         or round(v_booking.amount_paid * 100)::bigint <> v_document.total_cents
         or round(v_booking.balance_outstanding * 100)::bigint <> 0
       )) then
      raise exception 'XERO_BOOKING_INVOICE_NOT_VERIFIED';
    end if;
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
      'scope', case when v_document.source_quote_id is not null
        then 'future-requested-invoices-only'
        when v_is_bulk then 'approved-bulk-booking-invoice'
        else 'approved-direct-booking-invoice' end
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
  'Atomically queues one verified accepted-quote, direct paid-booking, or approved bulk-booking invoice.';
