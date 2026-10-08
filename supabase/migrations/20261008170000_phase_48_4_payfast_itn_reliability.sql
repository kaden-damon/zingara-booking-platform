-- Phase 48.4: durable PayFast ITN receipts and provider-evidence reconciliation.

create table if not exists public.payfast_itn_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_hash text not null unique,
  provider_transaction_id text,
  merchant_payment_id text,
  merchant_id text,
  payment_status text,
  amount_gross numeric(12,2),
  amount_fee numeric(12,2),
  amount_net numeric(12,2),
  request_ip inet,
  signature text,
  evidence jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1 check (attempt_count > 0),
  processing_status text not null default 'received'
    check (processing_status in ('received','processing','processed','rejected','retryable_failure')),
  signature_valid boolean,
  source_valid boolean,
  merchant_valid boolean,
  amount_valid boolean,
  server_validation_valid boolean,
  failure_code text,
  failure_detail text,
  payment_id uuid references public.payments(id) on delete set null,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists payfast_itn_receipts_provider_idx
  on public.payfast_itn_receipts (provider_transaction_id, last_received_at desc);
create index if not exists payfast_itn_receipts_attention_idx
  on public.payfast_itn_receipts (processing_status, last_received_at desc)
  where processing_status in ('received','processing','retryable_failure');

alter table public.payfast_itn_receipts enable row level security;
revoke all on table public.payfast_itn_receipts from public, anon, authenticated;
grant select, insert, update on table public.payfast_itn_receipts to service_role;

create or replace function public.record_payfast_itn_receipt(
  p_receipt_hash text,
  p_provider_transaction_id text,
  p_merchant_payment_id text,
  p_merchant_id text,
  p_payment_status text,
  p_amount_gross numeric,
  p_amount_fee numeric,
  p_amount_net numeric,
  p_request_ip inet,
  p_signature text,
  p_evidence jsonb
)
returns public.payfast_itn_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.payfast_itn_receipts%rowtype;
begin
  if nullif(trim(p_receipt_hash), '') is null then
    raise exception 'PAYFAST_RECEIPT_HASH_REQUIRED';
  end if;

  insert into public.payfast_itn_receipts (
    receipt_hash, provider_transaction_id, merchant_payment_id, merchant_id,
    payment_status, amount_gross, amount_fee, amount_net, request_ip,
    signature, evidence
  ) values (
    trim(p_receipt_hash), nullif(trim(p_provider_transaction_id), ''),
    nullif(trim(p_merchant_payment_id), ''), nullif(trim(p_merchant_id), ''),
    nullif(trim(p_payment_status), ''), p_amount_gross, p_amount_fee,
    p_amount_net, p_request_ip, nullif(trim(p_signature), ''),
    coalesce(p_evidence, '{}'::jsonb)
  )
  on conflict (receipt_hash) do update
    set attempt_count = public.payfast_itn_receipts.attempt_count + 1,
        last_received_at = clock_timestamp(),
        processing_status = case
          when public.payfast_itn_receipts.processing_status = 'processed'
            then 'processed'
          else 'received'
        end
  returning * into v_receipt;

  return v_receipt;
end;
$$;

create or replace function public.mark_payfast_itn_receipt(
  p_receipt_id uuid,
  p_processing_status text,
  p_signature_valid boolean default null,
  p_source_valid boolean default null,
  p_merchant_valid boolean default null,
  p_amount_valid boolean default null,
  p_server_validation_valid boolean default null,
  p_failure_code text default null,
  p_failure_detail text default null,
  p_payment_id uuid default null
)
returns public.payfast_itn_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.payfast_itn_receipts%rowtype;
begin
  if p_processing_status not in ('received','processing','processed','rejected','retryable_failure') then
    raise exception 'PAYFAST_RECEIPT_STATUS_INVALID';
  end if;

  update public.payfast_itn_receipts
     set processing_status = p_processing_status,
         signature_valid = coalesce(p_signature_valid, signature_valid),
         source_valid = coalesce(p_source_valid, source_valid),
         merchant_valid = coalesce(p_merchant_valid, merchant_valid),
         amount_valid = coalesce(p_amount_valid, amount_valid),
         server_validation_valid = coalesce(p_server_validation_valid, server_validation_valid),
         failure_code = nullif(trim(p_failure_code), ''),
         failure_detail = left(nullif(trim(p_failure_detail), ''), 500),
         payment_id = coalesce(p_payment_id, payment_id),
         processed_at = case when p_processing_status = 'processed' then clock_timestamp() else processed_at end,
         last_received_at = clock_timestamp()
   where id = p_receipt_id
   returning * into v_receipt;

  if v_receipt.id is null then
    raise exception 'PAYFAST_RECEIPT_NOT_FOUND';
  end if;
  return v_receipt;
end;
$$;

revoke all on function public.record_payfast_itn_receipt(text,text,text,text,text,numeric,numeric,numeric,inet,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_payfast_itn_receipt(text,text,text,text,text,numeric,numeric,numeric,inet,text,jsonb)
  to service_role;
revoke all on function public.mark_payfast_itn_receipt(uuid,text,boolean,boolean,boolean,boolean,boolean,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.mark_payfast_itn_receipt(uuid,text,boolean,boolean,boolean,boolean,boolean,text,text,uuid)
  to service_role;

create table if not exists public.payfast_reconciliation_imports (
  id uuid primary key default gen_random_uuid(),
  checksum text not null unique,
  original_filename text not null,
  row_count integer not null check (row_count >= 0),
  imported_by uuid references public.staff_profiles(id) on delete set null,
  imported_at timestamptz not null default now()
);

create table if not exists public.payfast_provider_events (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.payfast_reconciliation_imports(id) on delete set null,
  provider_transaction_id text not null,
  merchant_payment_id text not null,
  event_type text not null check (event_type in ('payment','reversal')),
  provider_status text not null,
  event_at timestamptz not null,
  booking_amount numeric(12,2) not null check (booking_amount >= 0),
  provider_gross_amount numeric(12,2) not null,
  transaction_fee_amount numeric(12,2) not null default 0 check (transaction_fee_amount >= 0),
  provider_processing_fee numeric(12,2) not null default 0,
  merchant_net_amount numeric(12,2) not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_transaction_id, event_type, event_at, provider_gross_amount)
);

create table if not exists public.payfast_reconciliation_actions (
  id uuid primary key default gen_random_uuid(),
  provider_event_id uuid not null references public.payfast_provider_events(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  booking_reference text,
  action_type text not null check (action_type in ('missing_local_payment','missing_provider_evidence','provider_reversal','amount_mismatch','duplicate_provider_id','late_payment','unresolved')),
  message text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (provider_event_id, action_type)
);

create index if not exists payfast_reconciliation_actions_open_idx
  on public.payfast_reconciliation_actions (status, created_at desc);

alter table public.payfast_reconciliation_imports enable row level security;
alter table public.payfast_provider_events enable row level security;
alter table public.payfast_reconciliation_actions enable row level security;
revoke all on table public.payfast_reconciliation_imports from public, anon, authenticated;
revoke all on table public.payfast_provider_events from public, anon, authenticated;
revoke all on table public.payfast_reconciliation_actions from public, anon, authenticated;
grant select, insert on table public.payfast_reconciliation_imports to service_role;
grant select, insert on table public.payfast_provider_events to service_role;
grant select, insert, update on table public.payfast_reconciliation_actions to service_role;

create or replace function public.restore_verified_booking_total_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_expected_total numeric,
  p_restored_total numeric,
  p_restored_subtotal numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_metadata jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings
   where booking_reference = upper(trim(p_booking_reference)) for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at
     or round(v_booking.total_amount,2) <> round(p_expected_total,2) then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if p_restored_total <= 0 or p_restored_subtotal < 0
     or round(p_restored_total - p_restored_subtotal,2) <> round(v_booking.total_amount - v_booking.subtotal_amount,2) then
    raise exception 'RESTORED_TOTAL_INVALID';
  end if;
  if v_booking.notes not like '__zingara_booking_meta__:%' then
    raise exception 'PRICING_SNAPSHOT_MISSING';
  end if;
  v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
  if round(coalesce((v_metadata ->> 'totalPrice')::numeric,-1),2) <> round(p_restored_total,2)
     or round(coalesce((v_metadata ->> 'subtotalPrice')::numeric,-1),2) <> round(p_restored_subtotal,2)
     or coalesce(v_metadata #>> '{pricingProvenance,source}','') = '' then
    raise exception 'PRICING_SNAPSHOT_MISMATCH';
  end if;

  update public.bookings
     set subtotal_amount = round(p_restored_subtotal,2),
         total_amount = round(p_restored_total,2),
         balance_outstanding = greatest(round(p_restored_total - amount_paid,2),0),
         payment_status = case when amount_paid <= 0 then 'pending_payment'::public.payment_status
           when amount_paid >= p_restored_total then 'fully_paid'::public.payment_status
           else 'deposit_paid'::public.payment_status end,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.audit_events (
    action,actor_name,actor_location_scope,entity_type,entity_reference,entity_id,
    outcome,source_area,reason,before_values,after_values,changed_fields
  ) values (
    'booking.payfast-total-restored','SYSTEM','{}'::text[],'booking',v_booking.booking_reference,
    v_booking.id::text,'success','PayFast reconciliation',trim(p_reason),
    jsonb_build_object('subtotal_amount',v_booking.subtotal_amount,'total_amount',v_booking.total_amount,'amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,'payment_status',v_booking.payment_status),
    jsonb_build_object('subtotal_amount',round(p_restored_subtotal,2),'total_amount',round(p_restored_total,2),'amount_paid',v_booking.amount_paid,'balance_outstanding',greatest(round(p_restored_total-v_booking.amount_paid,2),0)),
    array['subtotal_amount','total_amount','balance_outstanding','payment_status']
  );
  return jsonb_build_object('status','restored','booking_reference',v_booking.booking_reference,'updated_at',v_now);
end;
$$;

create or replace function public.reconcile_verified_payfast_payment_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_provider_transaction_id text,
  p_event_at timestamptz,
  p_booking_amount numeric,
  p_provider_gross_amount numeric,
  p_transaction_fee_amount numeric,
  p_provider_processing_fee numeric,
  p_merchant_net_amount numeric,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_core jsonb;
  v_event_id uuid;
  v_expected_gross numeric(12,2);
  v_metadata jsonb;
  v_notes text;
  v_payment public.payments%rowtype;
begin
  if nullif(trim(p_provider_transaction_id),'') is null or p_booking_amount <= 0
     or p_transaction_fee_amount < 0 or p_provider_gross_amount <= 0
     or round(p_booking_amount + p_transaction_fee_amount,2) <> round(p_provider_gross_amount,2) then
    raise exception 'PAYFAST_PROVIDER_EVIDENCE_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings
   where booking_reference = upper(trim(p_booking_reference)) for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;

  select * into v_payment from public.payments
   where provider_transaction_id = trim(p_provider_transaction_id) limit 1;
  if v_payment.id is not null then
    if v_payment.booking_id <> v_booking.id then raise exception 'PROVIDER_ID_ALREADY_USED'; end if;
    return jsonb_build_object('status','already_reconciled','payment_id',v_payment.id,'booking_id',v_booking.id);
  end if;

  select * into v_payment from public.payments
   where booking_id=v_booking.id and payment_status='pending_payment'
     and provider_transaction_id is null and round(amount,2)=round(p_booking_amount,2)
   order by created_at desc limit 1 for update;
  if v_payment.id is null then raise exception 'MATCHING_CHECKOUT_ATTEMPT_NOT_FOUND'; end if;
  v_expected_gross := coalesce(v_payment.provider_gross_amount,v_payment.amount);
  if round(v_expected_gross,2) <> round(p_provider_gross_amount,2)
     or round(coalesce(v_payment.transaction_fee_amount,0),2) <> round(p_transaction_fee_amount,2) then
    raise exception 'CHECKOUT_AMOUNT_MISMATCH';
  end if;
  if round(v_booking.amount_paid + p_booking_amount,2) > round(v_booking.total_amount,2) then
    raise exception 'PAYMENT_EXCEEDS_BOOKING_TOTAL';
  end if;

  v_notes := format('PayFast payment_status: COMPLETE\nPayFast transaction: %s\nGross: %s\nPayFast processor fee: %s\nNet: %s\nReconciled from verified provider history.',trim(p_provider_transaction_id),to_char(p_provider_gross_amount,'FM999999990.00'),to_char(p_provider_processing_fee,'FM999999990.00'),to_char(p_merchant_net_amount,'FM999999990.00'));
  v_core := public.confirm_payfast_payment_core(
    v_booking.booking_reference,trim(p_provider_transaction_id),round(p_booking_amount,2),
    case when v_booking.amount_paid+p_booking_amount >= v_booking.total_amount then 'fully_paid'::public.payment_status else 'deposit_paid'::public.payment_status end,
    case when v_booking.amount_paid > 0 then 'balance'::public.payment_type when v_booking.amount_paid+p_booking_amount >= v_booking.total_amount then 'full_payment'::public.payment_type else 'deposit'::public.payment_type end,
    v_notes,v_booking.notes,v_booking.amount_paid+p_booking_amount,greatest(v_booking.total_amount-v_booking.amount_paid-p_booking_amount,0)
  );
  if v_core ->> 'status' not in ('processed','already_confirmed') then
    raise exception 'PAYFAST_CORE_RECONCILIATION_FAILED: %',v_core::text;
  end if;

  update public.payments set provider_gross_amount=round(p_provider_gross_amount,2),
    transaction_fee_amount=round(p_transaction_fee_amount,2),processed_at=p_event_at,notes=v_notes
   where id=(v_core ->> 'payment_id')::uuid returning * into v_payment;

  select * into v_booking from public.bookings where id=v_booking.id for update;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata,'{paymentDate}',to_jsonb(p_event_at::text),true);
      v_metadata := jsonb_set(v_metadata,'{transactionReference}',to_jsonb(trim(p_provider_transaction_id)),true);
      v_metadata := jsonb_set(v_metadata,'{lastBookingAppliedAmount}',to_jsonb(round(p_booking_amount,2)),true);
      v_metadata := jsonb_set(v_metadata,'{lastProviderGrossAmount}',to_jsonb(round(p_provider_gross_amount,2)),true);
      v_metadata := jsonb_set(v_metadata,'{lastTransactionFeeAmount}',to_jsonb(round(p_transaction_fee_amount,2)),true);
      update public.bookings set notes='__zingara_booking_meta__:'||v_metadata::text where id=v_booking.id;
    exception when others then null;
    end;
  end if;

  insert into public.payfast_provider_events (provider_transaction_id,merchant_payment_id,event_type,provider_status,event_at,booking_amount,provider_gross_amount,transaction_fee_amount,provider_processing_fee,merchant_net_amount,evidence)
  values (trim(p_provider_transaction_id),v_booking.booking_reference,'payment','Funds Received',p_event_at,round(p_booking_amount,2),round(p_provider_gross_amount,2),round(p_transaction_fee_amount,2),round(p_provider_processing_fee,2),round(p_merchant_net_amount,2),coalesce(p_evidence,'{}'::jsonb))
  on conflict (provider_transaction_id,event_type,event_at,provider_gross_amount) do update set evidence=public.payfast_provider_events.evidence||excluded.evidence
  returning id into v_event_id;

  insert into public.audit_events (action,actor_name,actor_location_scope,entity_type,entity_reference,entity_id,outcome,source_area,reason,before_values,after_values,changed_fields)
  values ('booking.payfast-payment-reconciled','SYSTEM','{}'::text[],'booking',v_booking.booking_reference,v_booking.id::text,'success','PayFast reconciliation','Verified successful PayFast transaction was missing locally.',
    jsonb_build_object('provider_transaction_id',null,'amount_paid',v_booking.amount_paid-p_booking_amount,'balance_outstanding',v_booking.balance_outstanding+p_booking_amount),
    jsonb_build_object('provider_transaction_id',trim(p_provider_transaction_id),'amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,'provider_event_id',v_event_id),
    array['payment.provider_transaction_id','amount_paid','balance_outstanding','payment_status']);

  if coalesce(v_core ->> 'restoration_status','active') <> 'active' then
    insert into public.payfast_reconciliation_actions (provider_event_id,booking_id,booking_reference,action_type,message)
    values (v_event_id,v_booking.id,v_booking.booking_reference,'late_payment','Payment received but the booking still needs review.')
    on conflict (provider_event_id,action_type) do nothing;
  end if;
  return v_core || jsonb_build_object('provider_event_id',v_event_id,'payment_id',v_payment.id);
end;
$$;

create or replace function public.reconcile_verified_payfast_reversal_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_provider_transaction_id text,
  p_event_at timestamptz,
  p_provider_gross_amount numeric,
  p_provider_processing_fee numeric,
  p_merchant_net_amount numeric,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_event_id uuid;
  v_metadata jsonb;
  v_new_paid numeric(12,2);
  v_new_balance numeric(12,2);
  v_new_status public.payment_status;
  v_payment public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings where booking_reference=upper(trim(p_booking_reference)) for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  select * into v_payment from public.payments where provider_transaction_id=trim(p_provider_transaction_id) for update;
  if v_payment.id is null or v_payment.booking_id<>v_booking.id then raise exception 'PROVIDER_PAYMENT_NOT_FOUND'; end if;
  if round(abs(p_provider_gross_amount),2)<>round(coalesce(v_payment.provider_gross_amount,v_payment.amount),2) then raise exception 'REVERSAL_AMOUNT_MISMATCH'; end if;

  insert into public.payfast_provider_events (provider_transaction_id,merchant_payment_id,event_type,provider_status,event_at,booking_amount,provider_gross_amount,transaction_fee_amount,provider_processing_fee,merchant_net_amount,evidence)
  values (trim(p_provider_transaction_id),v_booking.booking_reference,'reversal','Funds Received (Reversal)',p_event_at,abs(v_payment.amount),p_provider_gross_amount,coalesce(v_payment.transaction_fee_amount,0),p_provider_processing_fee,p_merchant_net_amount,coalesce(p_evidence,'{}'::jsonb))
  on conflict (provider_transaction_id,event_type,event_at,provider_gross_amount) do update set evidence=public.payfast_provider_events.evidence||excluded.evidence
  returning id into v_event_id;

  if v_payment.payment_status='cancelled' then
    return jsonb_build_object('status','already_reconciled','booking_id',v_booking.id,'payment_id',v_payment.id,'provider_event_id',v_event_id);
  end if;
  update public.payments set payment_status='cancelled',
    notes=coalesce(notes,'')||format(E'\nPayFast provider reversal: %s\nReversal date: %s\nReconciled from verified provider history.',trim(p_provider_transaction_id),p_event_at::text)
   where id=v_payment.id;
  select coalesce(sum(amount),0) into v_new_paid from public.payments
   where booking_id=v_booking.id and payment_status in ('deposit_paid','fully_paid');
  v_new_balance:=greatest(round(v_booking.total_amount-v_new_paid,2),0);
  v_new_status:=case when v_new_paid<=0 then 'pending_payment'::public.payment_status when v_new_balance<=0 then 'fully_paid'::public.payment_status else 'deposit_paid'::public.payment_status end;
  update public.bookings set amount_paid=v_new_paid,balance_outstanding=v_new_balance,payment_status=v_new_status,updated_at=clock_timestamp() where id=v_booking.id;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata:=substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb;
      v_metadata:=jsonb_set(v_metadata,'{amountPaid}',to_jsonb(v_new_paid),true);
      v_metadata:=jsonb_set(v_metadata,'{balanceDue}',to_jsonb(v_new_balance),true);
      v_metadata:=jsonb_set(v_metadata,'{paymentStatus}',to_jsonb(case when v_new_paid<=0 then 'pending-payment' when v_new_balance<=0 then 'fully-paid' else 'deposit-paid' end),true);
      update public.bookings set notes='__zingara_booking_meta__:'||v_metadata::text where id=v_booking.id;
    exception when others then null;
    end;
  end if;
  insert into public.audit_events (action,actor_name,actor_location_scope,entity_type,entity_reference,entity_id,outcome,source_area,reason,before_values,after_values,changed_fields)
  values ('booking.payfast-reversal-reconciled','SYSTEM','{}'::text[],'booking',v_booking.booking_reference,v_booking.id::text,'success','PayFast reconciliation','Verified PayFast provider reversal.',
    jsonb_build_object('amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,'payment_status',v_booking.payment_status,'provider_transaction_id',v_payment.provider_transaction_id),
    jsonb_build_object('amount_paid',v_new_paid,'balance_outstanding',v_new_balance,'payment_status',v_new_status,'provider_transaction_id',v_payment.provider_transaction_id,'provider_event_id',v_event_id),
    array['payment.payment_status','amount_paid','balance_outstanding','payment_status']);
  insert into public.payfast_reconciliation_actions (provider_event_id,booking_id,booking_reference,action_type,message)
  values (v_event_id,v_booking.id,v_booking.booking_reference,'provider_reversal','Payment reversed — check booking.') on conflict (provider_event_id,action_type) do nothing;
  return jsonb_build_object('status','processed','booking_id',v_booking.id,'payment_id',v_payment.id,'provider_event_id',v_event_id,'amount_paid',v_new_paid,'balance_outstanding',v_new_balance,'booking_status',v_booking.booking_status);
end;
$$;

revoke all on function public.restore_verified_booking_total_atomic(text,timestamptz,numeric,numeric,numeric,text) from public,anon,authenticated;
revoke all on function public.reconcile_verified_payfast_payment_atomic(text,timestamptz,text,timestamptz,numeric,numeric,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.reconcile_verified_payfast_reversal_atomic(text,timestamptz,text,timestamptz,numeric,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.restore_verified_booking_total_atomic(text,timestamptz,numeric,numeric,numeric,text) to service_role;
grant execute on function public.reconcile_verified_payfast_payment_atomic(text,timestamptz,text,timestamptz,numeric,numeric,numeric,numeric,numeric,jsonb) to service_role;
grant execute on function public.reconcile_verified_payfast_reversal_atomic(text,timestamptz,text,timestamptz,numeric,numeric,numeric,jsonb) to service_role;

comment on table public.payfast_itn_receipts is 'Durable, service-only PayFast ITN receipt evidence. Raw customer fields are not retained.';
comment on table public.payfast_provider_events is 'Immutable provider payment and reversal evidence imported from authorised PayFast history.';
comment on table public.payfast_reconciliation_actions is 'Deduplicated operational review required by PayFast reconciliation evidence.';
