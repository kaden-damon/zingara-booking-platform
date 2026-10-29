create sequence if not exists public.zingara_credit_note_number_seq start 1000;

create table if not exists public.xero_credit_notes (
  id uuid primary key default gen_random_uuid(),
  local_reference text not null unique default (
    'ZC-' || lpad(nextval('public.zingara_credit_note_number_seq')::text, 6, '0')
  ),
  idempotency_key uuid not null unique,
  original_invoice_document_id uuid not null references public.xero_documents(id) on delete restrict,
  source_booking_id uuid not null references public.bookings(id) on delete restrict,
  source_booking_reference text not null,
  refund_id uuid references public.payment_refunds(id) on delete restrict,
  venue text not null check (venue in ('cape-town','johannesburg')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'draft'
    check (status in ('draft','review_ready','pending','synced','action_required','voided')),
  version integer not null default 1 check (version > 0),
  currency_code text not null default 'ZAR' check (currency_code = 'ZAR'),
  line_amount_type text not null check (line_amount_type in ('exclusive','inclusive','no-tax')),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  total_cents bigint not null check (total_cents > 0),
  xero_tenant_id text,
  xero_credit_note_id text,
  xero_credit_note_number text,
  xero_status text,
  sync_status text not null default 'local_only'
    check (sync_status in ('local_only','pending','syncing','synced','error','action_required')),
  reconciled_at timestamptz,
  reconciliation_evidence jsonb,
  created_by_staff_profile_id uuid not null references public.staff_profiles(id),
  updated_by_staff_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((sync_status = 'synced') = (xero_credit_note_id is not null))
);

create index if not exists xero_credit_notes_booking_created_idx
  on public.xero_credit_notes(source_booking_id, created_at desc);
create index if not exists xero_credit_notes_invoice_status_idx
  on public.xero_credit_notes(original_invoice_document_id, status, created_at);
create unique index if not exists xero_credit_notes_xero_identity_uidx
  on public.xero_credit_notes(xero_tenant_id, xero_credit_note_id)
  where xero_credit_note_id is not null;
create unique index if not exists xero_credit_notes_refund_uidx
  on public.xero_credit_notes(refund_id)
  where refund_id is not null and status <> 'voided';

alter table public.xero_credit_notes enable row level security;
revoke all on public.xero_credit_notes from public, anon, authenticated;
grant select, insert, update on public.xero_credit_notes to service_role;
grant usage, select on sequence public.zingara_credit_note_number_seq to service_role;

create or replace function public.create_xero_credit_note_draft_atomic(
  p_original_invoice_document_id uuid,
  p_idempotency_key uuid,
  p_refund_id uuid,
  p_reason text,
  p_line_amount_type text,
  p_lines jsonb,
  p_subtotal_cents bigint,
  p_tax_cents bigint,
  p_total_cents bigint,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.xero_credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.xero_credit_notes%rowtype;
  v_invoice public.xero_documents%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_previously_credited bigint;
begin
  if p_actor_staff_profile_id not in (
    '1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d'::uuid,
    '3ea8ff16-d914-477b-95fc-23380e71019a'::uuid
  ) then
    raise exception 'XERO_CREDIT_NOTE_NOT_AUTHORISED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3
     or char_length(trim(coalesce(p_reason, ''))) > 1000 then
    raise exception 'XERO_CREDIT_NOTE_REASON_REQUIRED';
  end if;

  select * into v_credit
  from public.xero_credit_notes
  where idempotency_key = p_idempotency_key;
  if v_credit.id is not null then
    if v_credit.original_invoice_document_id <> p_original_invoice_document_id
       or v_credit.created_by_staff_profile_id <> p_actor_staff_profile_id then
      raise exception 'XERO_CREDIT_NOTE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_credit;
  end if;
  if p_total_cents <= 0
     or p_subtotal_cents < 0
     or p_tax_cents < 0
     or p_line_amount_type not in ('exclusive','inclusive','no-tax')
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'XERO_CREDIT_NOTE_TOTAL_INVALID';
  end if;

  select * into v_invoice
  from public.xero_documents
  where id = p_original_invoice_document_id
  for update;
  if v_invoice.id is null
     or v_invoice.kind <> 'invoice'
     or v_invoice.source_booking_id is null
     or v_invoice.xero_document_id is null
     or lower(coalesce(v_invoice.xero_status, '')) in ('deleted','voided')
     or v_invoice.total_cents <= 0
     or v_invoice.line_amount_type <> p_line_amount_type then
    raise exception 'XERO_ORIGINAL_INVOICE_NOT_CREDITABLE';
  end if;

  if p_refund_id is not null then
    select * into v_refund
    from public.payment_refunds
    where id = p_refund_id
    for share;
    if v_refund.id is null
       or v_refund.booking_id <> v_invoice.source_booking_id
       or v_refund.refund_status not in ('accepted','reconciliation_required','processing') then
      raise exception 'XERO_REFUND_EVIDENCE_INVALID';
    end if;
  end if;

  select coalesce(sum(total_cents), 0)::bigint into v_previously_credited
  from public.xero_credit_notes
  where original_invoice_document_id = v_invoice.id
    and status <> 'voided';
  if p_total_cents > v_invoice.total_cents - v_previously_credited then
    raise exception 'XERO_CREDIT_EXCEEDS_REMAINING_VALUE';
  end if;

  insert into public.xero_credit_notes(
    idempotency_key, original_invoice_document_id, source_booking_id, source_booking_reference,
    refund_id, venue, reason, line_amount_type, lines, subtotal_cents, tax_cents,
    total_cents, created_by_staff_profile_id, updated_by_staff_profile_id
  ) values (
    p_idempotency_key, v_invoice.id, v_invoice.source_booking_id, v_invoice.source_booking_reference,
    p_refund_id, v_invoice.venue, trim(p_reason), p_line_amount_type, p_lines,
    p_subtotal_cents, p_tax_cents, p_total_cents,
    p_actor_staff_profile_id, p_actor_staff_profile_id
  ) returning * into v_credit;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_credit_note_draft_created', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'originalInvoiceDocumentId', v_invoice.id,
      'originalInvoiceReference', coalesce(v_invoice.xero_document_number, v_invoice.local_reference),
      'reason', v_credit.reason,
      'refundId', v_credit.refund_id,
      'totalCents', v_credit.total_cents
    ),
    '{}'::jsonb,
    array['status','reason','totalCents'],
    v_credit.id::text, v_credit.venue, v_credit.local_reference,
    'accounting-credit-note', 'success', 'xero-credit-notes'
  );
  return v_credit;
end;
$$;

revoke all on function public.create_xero_credit_note_draft_atomic(uuid,uuid,uuid,text,text,jsonb,bigint,bigint,bigint,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.create_xero_credit_note_draft_atomic(uuid,uuid,uuid,text,text,jsonb,bigint,bigint,bigint,uuid,uuid,text,text,text[])
  to service_role;

comment on table public.xero_credit_notes is
  'Local credit-note drafts linked to one authoritative Xero invoice and optional refund evidence. Creation never initiates a refund.';
comment on function public.create_xero_credit_note_draft_atomic(uuid,uuid,uuid,text,text,jsonb,bigint,bigint,bigint,uuid,uuid,text,text,text[]) is
  'Creates one permissioned credit-note draft while atomically enforcing the remaining invoice value.';
