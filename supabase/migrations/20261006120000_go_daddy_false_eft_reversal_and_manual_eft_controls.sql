-- P0: preserve manual-payment history while supporting linked reversals and
-- requiring structured settlement evidence for every future manual EFT.

create table if not exists public.manual_eft_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount_received numeric(10,2) not null check (amount_received > 0),
  received_on date not null,
  bank_reference text not null check (char_length(trim(bank_reference)) between 3 and 120),
  evidence_note text not null check (char_length(trim(evidence_note)) between 3 and 500),
  recorded_by_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  recorded_by_auth_user_id uuid references auth.users(id) on delete restrict,
  request_id text not null unique check (char_length(trim(request_id)) between 1 and 128),
  created_at timestamptz not null default now()
);

create unique index if not exists manual_eft_payment_evidence_bank_reference_uidx
  on public.manual_eft_payment_evidence (lower(trim(bank_reference)));
create index if not exists manual_eft_payment_evidence_booking_idx
  on public.manual_eft_payment_evidence (booking_id, created_at desc);

create table if not exists public.manual_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  reversal_amount numeric(10,2) not null check (reversal_amount > 0),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  original_payment_snapshot jsonb not null,
  reversed_by_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  reversed_by_auth_user_id uuid references auth.users(id) on delete restrict,
  request_id text not null unique check (char_length(trim(request_id)) between 1 and 128),
  created_at timestamptz not null default now()
);

create index if not exists manual_payment_reversals_booking_idx
  on public.manual_payment_reversals (booking_id, created_at desc);

create or replace function public.reject_immutable_financial_evidence_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'IMMUTABLE_FINANCIAL_EVIDENCE';
end;
$$;

drop trigger if exists manual_eft_payment_evidence_immutable on public.manual_eft_payment_evidence;
create trigger manual_eft_payment_evidence_immutable
before update or delete on public.manual_eft_payment_evidence
for each row execute function public.reject_immutable_financial_evidence_change();

drop trigger if exists manual_payment_reversals_immutable on public.manual_payment_reversals;
create trigger manual_payment_reversals_immutable
before update or delete on public.manual_payment_reversals
for each row execute function public.reject_immutable_financial_evidence_change();

alter table public.manual_eft_payment_evidence enable row level security;
alter table public.manual_payment_reversals enable row level security;
revoke all on table public.manual_eft_payment_evidence from public, anon, authenticated;
revoke all on table public.manual_payment_reversals from public, anon, authenticated;
grant select, insert on table public.manual_eft_payment_evidence to service_role;
grant select, insert on table public.manual_payment_reversals to service_role;

create or replace function public.record_manual_eft_payment_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_amount_received numeric,
  p_received_on date,
  p_bank_reference text,
  p_evidence_note text,
  p_confirmed boolean,
  p_idempotency_key text,
  p_ticket_code text,
  p_ticket_url text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_booking public.bookings%rowtype;
  v_evidence_id uuid;
  v_existing_audit public.audit_events%rowtype;
  v_is_expired_corporate boolean := false;
  v_link_count integer := 0;
  v_new_amount_paid numeric(10,2);
  v_new_balance numeric(10,2);
  v_new_booking_status public.booking_status;
  v_new_payment_status public.payment_status;
  v_now timestamptz := clock_timestamp();
  v_outstanding numeric(10,2);
  v_payment_id uuid;
  v_payment_type public.payment_type;
  v_show public.shows%rowtype;
  v_ticket_count integer := 0;
  v_ticket_status public.ticket_status;
  v_venue text;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_updated_at is null
     or p_amount_received is null
     or round(p_amount_received, 2) <= 0
     or p_received_on is null
     or p_received_on > (v_now at time zone 'Africa/Johannesburg')::date
     or nullif(trim(p_bank_reference), '') is null
     or length(trim(p_bank_reference)) < 3
     or length(trim(p_bank_reference)) > 120
     or nullif(trim(p_evidence_note), '') is null
     or length(trim(p_evidence_note)) < 3
     or length(trim(p_evidence_note)) > 500
     or p_confirmed is not true
     or nullif(trim(p_idempotency_key), '') is null
     or length(trim(p_idempotency_key)) > 128
     or nullif(trim(p_ticket_code), '') is null then
    raise exception 'MANUAL_EFT_INPUT_INVALID';
  end if;

  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and permission.key = 'bookings:reconcile';

  if v_actor_name is null then
    raise exception 'MANUAL_EFT_PERMISSION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));

  select * into v_booking
    from public.bookings
   where booking_reference = upper(trim(p_booking_reference))
   for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select * into v_existing_audit
    from public.audit_events
   where action = 'booking.payment-recorded'
     and entity_id = v_booking.id::text
     and request_id = trim(p_idempotency_key)
     and outcome = 'success'
   limit 1;
  if v_existing_audit.id is not null then
    return jsonb_build_object(
      'status', 'already_processed', 'idempotent', true,
      'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
      'booking_status', v_booking.booking_status, 'payment_status', v_booking.payment_status,
      'total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding, 'updated_at', v_booking.updated_at
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;

  v_is_expired_corporate := v_booking.booking_origin is not distinct from 'corporate'
    and v_booking.booking_source = 'corporate-direct'
    and v_booking.booking_status::text = 'cancelled'
    and v_booking.corporate_payment_expired_at is not null
    and exists (
      select 1 from public.audit_events expiry
       where expiry.entity_id = v_booking.id::text
         and expiry.action = 'corporate.payment_deadline.expired'
         and expiry.outcome = 'success'
    );

  if v_booking.archived_at is not null
     or (v_booking.booking_status::text in ('cancelled', 'completed', 'refunded', 'no_show')
         and not v_is_expired_corporate)
     or v_booking.payment_status::text in ('cancelled', 'comp_vip', 'refunded') then
    raise exception 'MANUAL_EFT_NOT_ALLOWED';
  end if;

  if exists (
    select 1 from public.payment_refunds refund
     where refund.booking_id = v_booking.id and refund.completed_at is not null
  ) then
    raise exception 'MANUAL_EFT_NOT_ALLOWED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  v_venue := case
    when lower(coalesce(v_show.venue, '')) like '%johannesburg%'
      or lower(coalesce(v_show.venue, '')) in ('jhb', 'joburg') then 'johannesburg'
    when lower(coalesce(v_show.venue, '')) like '%cape town%'
      or lower(coalesce(v_show.venue, '')) in ('cpt', 'cape-town', 'zingara') then 'cape-town'
    else replace(lower(trim(coalesce(v_show.venue, ''))), ' ', '-')
  end;
  if not (
    'all' = any(coalesce(v_actor_location_scope, '{}'::text[]))
    or v_venue = any(coalesce(v_actor_location_scope, '{}'::text[]))
  ) then raise exception 'SHOW_OUTSIDE_STAFF_SCOPE'; end if;

  if exists (
    select 1 from public.manual_eft_payment_evidence evidence
     where lower(trim(evidence.bank_reference)) = lower(trim(p_bank_reference))
  ) then raise exception 'MANUAL_EFT_REFERENCE_DUPLICATE'; end if;

  v_outstanding := greatest(round(coalesce(v_booking.total_amount, 0) - coalesce(v_booking.amount_paid, 0), 2), 0);
  if v_outstanding <= 0.01 or v_booking.payment_status::text = 'fully_paid' then
    raise exception 'BOOKING_ALREADY_PAID';
  end if;
  if round(p_amount_received, 2) > v_outstanding then
    raise exception 'MANUAL_EFT_EXCEEDS_OUTSTANDING';
  end if;

  v_new_amount_paid := round(coalesce(v_booking.amount_paid, 0) + p_amount_received, 2);
  v_new_balance := greatest(round(coalesce(v_booking.total_amount, 0) - v_new_amount_paid, 2), 0);
  v_new_payment_status := case when v_new_balance <= 0.01
    then 'fully_paid'::public.payment_status else 'deposit_paid'::public.payment_status end;
  v_payment_type := case
    when coalesce(v_booking.amount_paid, 0) > 0 then 'balance'::public.payment_type
    when v_new_payment_status = 'fully_paid' then 'full_payment'::public.payment_type
    else 'deposit'::public.payment_type
  end;
  v_new_booking_status := case
    when v_is_expired_corporate then v_booking.booking_status
    when v_booking.booking_status::text in ('new', 'pending_payment') then 'confirmed'::public.booking_status
    else v_booking.booking_status
  end;
  v_ticket_status := case when v_new_booking_status::text = 'checked_in'
    then 'checked_in'::public.ticket_status else 'valid'::public.ticket_status end;

  insert into public.payments (
    amount, booking_id, method, notes, payment_status, payment_type,
    processed_at, processed_by, provider_gross_amount,
    provider_transaction_id, reference, transaction_fee_amount
  ) values (
    round(p_amount_received, 2), v_booking.id, 'manual_eft',
    format('Manual EFT received %s; bank reference %s; recorded by %s; note: %s',
      p_received_on, trim(p_bank_reference), v_actor_name, trim(p_evidence_note)),
    v_new_payment_status, v_payment_type,
    (p_received_on::timestamp at time zone 'Africa/Johannesburg'),
    p_actor_auth_user_id,
    null, null, v_booking.booking_reference, null
  ) returning id into v_payment_id;

  insert into public.manual_eft_payment_evidence (
    payment_id, booking_id, amount_received, received_on, bank_reference,
    evidence_note, recorded_by_staff_profile_id, recorded_by_auth_user_id, request_id
  ) values (
    v_payment_id, v_booking.id, round(p_amount_received, 2), p_received_on,
    trim(p_bank_reference), trim(p_evidence_note), p_actor_staff_profile_id,
    p_actor_auth_user_id, trim(p_idempotency_key)
  ) returning id into v_evidence_id;

  update public.bookings
     set amount_paid = v_new_amount_paid,
         balance_outstanding = v_new_balance,
         booking_status = v_new_booking_status,
         payment_status = v_new_payment_status,
         corporate_payment_protected_at = case when v_is_expired_corporate
           then coalesce(corporate_payment_protected_at, v_now)
           else corporate_payment_protected_at end,
         updated_at = v_now
   where id = v_booking.id;

  update public.booking_payment_links
     set revoked_at = v_now, status = 'revoked', updated_at = v_now
   where booking_id = v_booking.id and status = 'active';
  get diagnostics v_link_count = row_count;

  if not v_is_expired_corporate then
    update public.tickets
       set ticket_status = case when ticket_status in ('cancelled','refunded','void','checked_in')
         then ticket_status else v_ticket_status end,
           updated_at = v_now
     where booking_id = v_booking.id;
    get diagnostics v_ticket_count = row_count;
    if v_ticket_count = 0 then
      insert into public.tickets (
        booking_id, issued_at, qr_payload, ticket_code, ticket_status, ticket_url, updated_at
      ) values (
        v_booking.id, v_now, trim(p_ticket_code), trim(p_ticket_code),
        v_ticket_status, nullif(trim(p_ticket_url), ''), v_now
      );
      v_ticket_count := 1;
    end if;

    insert into public.booking_lifecycle_events (
      booking_id, changed_by, created_at, from_status, note, reason, to_status
    ) values (
      v_booking.id, p_actor_auth_user_id, v_now, v_booking.booking_status,
      format('Manual EFT of %s recorded by %s.', round(p_amount_received, 2), v_actor_name),
      trim(p_evidence_note), v_new_booking_status
    );
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.payment-recorded', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'amount_paid', v_new_amount_paid, 'balance_outstanding', v_new_balance,
      'booking_status', v_new_booking_status, 'manual_payment_amount', round(p_amount_received, 2),
      'method', 'manual_eft', 'payment_id', v_payment_id, 'manual_eft_evidence_id', v_evidence_id,
      'received_on', p_received_on, 'bank_reference', trim(p_bank_reference),
      'payment_links_revoked', v_link_count, 'payment_status', v_new_payment_status,
      'tickets_updated', v_ticket_count
    ),
    jsonb_build_object(
      'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding,
      'booking_status', v_booking.booking_status, 'payment_status', v_booking.payment_status
    ),
    array['amount_paid','balance_outstanding','booking_status','payment_status'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    trim(p_evidence_note), trim(p_idempotency_key),
    'Booking Details · Record Manual EFT', p_user_agent
  );

  return jsonb_build_object(
    'status', 'processed', 'idempotent', false,
    'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
    'booking_status', v_new_booking_status, 'payment_status', v_new_payment_status,
    'payment_id', v_payment_id, 'manual_eft_evidence_id', v_evidence_id,
    'manual_payment_amount', round(p_amount_received, 2),
    'total_amount', round(coalesce(v_booking.total_amount, 0), 2),
    'amount_paid', v_new_amount_paid, 'balance_outstanding', v_new_balance,
    'payment_links_revoked', v_link_count, 'tickets_updated', v_ticket_count,
    'updated_at', v_now
  );
exception
  when unique_violation then
    raise exception 'MANUAL_EFT_REFERENCE_DUPLICATE';
end;
$$;

revoke all on function public.record_manual_eft_payment_atomic(
  text,timestamptz,numeric,date,text,text,boolean,text,text,text,uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.record_manual_eft_payment_atomic(
  text,timestamptz,numeric,date,text,text,boolean,text,text,text,uuid,uuid,text
) to service_role;

-- Retire the two unstructured service-role entry points. Historical definitions
-- remain in migrations, but future writes must use the evidence-backed RPC.
revoke execute on function public.mark_booking_paid_atomic(
  text,timestamptz,text,text,text,text,uuid,uuid,text
) from service_role;
revoke execute on function public.record_expired_corporate_payment_atomic(
  text,timestamptz,text,text,uuid,uuid,text
) from service_role;

create or replace function public.reverse_false_manual_payment_atomic(
  p_booking_reference text,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_idempotency_key text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_booking public.bookings%rowtype;
  v_existing public.manual_payment_reversals%rowtype;
  v_new_amount_paid numeric(10,2);
  v_new_balance numeric(10,2);
  v_new_payment_status public.payment_status;
  v_now timestamptz := clock_timestamp();
  v_payment public.payments%rowtype;
  v_reversal_id uuid;
  v_show public.shows%rowtype;
  v_venue text;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_payment_id is null or p_expected_updated_at is null
     or nullif(trim(p_reason), '') is null or length(trim(p_reason)) < 3
     or length(trim(p_reason)) > 500
     or nullif(trim(p_idempotency_key), '') is null
     or length(trim(p_idempotency_key)) > 128 then
    raise exception 'MANUAL_PAYMENT_REVERSAL_INPUT_INVALID';
  end if;

  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.permissions permission on permission.id = role_permission.permission_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active and permission.key = 'bookings:reconcile';
  if v_actor_name is null then raise exception 'MANUAL_EFT_PERMISSION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings
   where booking_reference = upper(trim(p_booking_reference)) for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select * into v_existing from public.manual_payment_reversals
   where payment_id = p_payment_id or request_id = trim(p_idempotency_key) limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'status','already_processed','idempotent',true,'reversal_id',v_existing.id,
      'booking_id',v_booking.id,'booking_reference',v_booking.booking_reference,
      'booking_status',v_booking.booking_status,'payment_status',v_booking.payment_status,
      'amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,
      'updated_at',v_booking.updated_at
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  select * into v_payment from public.payments
   where id = p_payment_id and booking_id = v_booking.id for update;
  if v_payment.id is null
     or v_payment.method not in ('manual','manual_eft')
     or v_payment.payment_status::text not in ('deposit_paid','fully_paid')
     or v_payment.provider_transaction_id is not null
     or v_payment.provider_gross_amount is not null
     or round(coalesce(v_payment.amount,0),2) <= 0
     or round(coalesce(v_booking.amount_paid,0),2) < round(v_payment.amount,2) then
    raise exception 'MANUAL_PAYMENT_REVERSAL_NOT_ALLOWED';
  end if;

  if not exists (
    select 1 from public.audit_events payment_audit
     where payment_audit.entity_id = v_booking.id::text
       and payment_audit.action = 'booking.payment-recorded'
       and payment_audit.outcome = 'success'
       and payment_audit.after_values ->> 'payment_id' = v_payment.id::text
  ) then raise exception 'MANUAL_PAYMENT_REVERSAL_NOT_ALLOWED'; end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  v_venue := case
    when lower(coalesce(v_show.venue,'')) like '%johannesburg%' or lower(coalesce(v_show.venue,'')) in ('jhb','joburg') then 'johannesburg'
    when lower(coalesce(v_show.venue,'')) like '%cape town%' or lower(coalesce(v_show.venue,'')) in ('cpt','cape-town','zingara') then 'cape-town'
    else replace(lower(trim(coalesce(v_show.venue,''))),' ','-') end;
  if not ('all'=any(coalesce(v_actor_location_scope,'{}'::text[])) or v_venue=any(coalesce(v_actor_location_scope,'{}'::text[]))) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  v_new_amount_paid := greatest(round(coalesce(v_booking.amount_paid,0) - v_payment.amount,2),0);
  v_new_balance := greatest(round(coalesce(v_booking.total_amount,0) - v_new_amount_paid,2),0);
  v_new_payment_status := case
    when v_new_amount_paid <= 0.01 then 'pending_payment'::public.payment_status
    when v_new_balance <= 0.01 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status end;

  insert into public.manual_payment_reversals (
    payment_id,booking_id,reversal_amount,reason,original_payment_snapshot,
    reversed_by_staff_profile_id,reversed_by_auth_user_id,request_id
  ) values (
    v_payment.id,v_booking.id,round(v_payment.amount,2),trim(p_reason),
    jsonb_build_object(
      'id',v_payment.id,'amount',v_payment.amount,'method',v_payment.method,
      'notes',v_payment.notes,'payment_status',v_payment.payment_status,
      'payment_type',v_payment.payment_type,'processed_at',v_payment.processed_at,
      'processed_by',v_payment.processed_by,'provider_gross_amount',v_payment.provider_gross_amount,
      'provider_transaction_id',v_payment.provider_transaction_id,'reference',v_payment.reference,
      'transaction_fee_amount',v_payment.transaction_fee_amount,'created_at',v_payment.created_at
    ),p_actor_staff_profile_id,p_actor_auth_user_id,trim(p_idempotency_key)
  ) returning id into v_reversal_id;

  -- Preserve every original receipt field; only its authoritative success state
  -- is cancelled so all existing financial readers stop counting false money.
  update public.payments set payment_status='cancelled' where id=v_payment.id;
  update public.bookings
     set amount_paid=v_new_amount_paid,balance_outstanding=v_new_balance,
         payment_status=v_new_payment_status,updated_at=v_now
   where id=v_booking.id;

  insert into public.audit_events (
    action,actor_auth_user_id,actor_location_scope,actor_name,actor_role,
    actor_staff_profile_id,after_values,before_values,changed_fields,
    entity_id,entity_reference,entity_type,outcome,reason,request_id,source_area,user_agent
  ) values (
    'booking.manual-payment-reversed',p_actor_auth_user_id,
    coalesce(v_actor_location_scope,'{}'::text[]),v_actor_name,v_actor_role,p_actor_staff_profile_id,
    jsonb_build_object(
      'amount_paid',v_new_amount_paid,'balance_outstanding',v_new_balance,
      'booking_status',v_booking.booking_status,'payment_status',v_new_payment_status,
      'original_payment_id',v_payment.id,'original_payment_preserved',true,
      'original_payment_status','cancelled','reversal_id',v_reversal_id,
      'reversal_amount',round(v_payment.amount,2)
    ),
    jsonb_build_object(
      'amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,
      'booking_status',v_booking.booking_status,'payment_status',v_booking.payment_status,
      'original_payment_id',v_payment.id,'original_payment_status',v_payment.payment_status
    ),
    array['amount_paid','balance_outstanding','payment_status','original_payment_status'],
    v_booking.id::text,v_booking.booking_reference,'booking','success',trim(p_reason),
    trim(p_idempotency_key),'Authorised Production Correction · False Manual EFT',p_user_agent
  );

  return jsonb_build_object(
    'status','processed','idempotent',false,'reversal_id',v_reversal_id,
    'booking_id',v_booking.id,'booking_reference',v_booking.booking_reference,
    'booking_status',v_booking.booking_status,'payment_status',v_new_payment_status,
    'amount_paid',v_new_amount_paid,'balance_outstanding',v_new_balance,
    'payment_id',v_payment.id,'payment_status_after','cancelled','updated_at',v_now
  );
end;
$$;

revoke all on function public.reverse_false_manual_payment_atomic(
  text,uuid,timestamptz,text,text,uuid,uuid,text
) from public,anon,authenticated;
grant execute on function public.reverse_false_manual_payment_atomic(
  text,uuid,timestamptz,text,text,uuid,uuid,text
) to service_role;
