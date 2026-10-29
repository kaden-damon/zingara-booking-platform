create or replace function public.reallocate_norman_deposit_atomic(
  p_idempotency_key uuid,
  p_approval_reason text,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.payment_reallocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.bookings%rowtype;
  v_target public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_existing public.payment_reallocations%rowtype;
  v_transfer public.payment_reallocations%rowtype;
  v_source_paid numeric(12,2);
  v_target_paid numeric(12,2);
  v_source_balance numeric(12,2);
  v_target_balance numeric(12,2);
  v_source_status public.payment_status;
  v_target_status public.payment_status;
  v_before jsonb;
  v_after jsonb;
  v_prefix constant text := '__zingara_booking_meta__:';
begin
  if not exists (
       select 1
       from public.staff_profiles staff
       join public.roles role on role.id = staff.role_id
       where staff.id = p_actor_staff_profile_id
         and staff.user_id = p_actor_auth_user_id
         and staff.active
         and (
           (
             staff.id = '3ac09b59-fc3f-4c6d-9bb3-8dd47a077188'::uuid
             and staff.user_id = 'ff96887e-bed8-43ec-884d-0ef8634e9f12'::uuid
             and role.name in ('Super Admin', 'Box Office Manager', 'Venue Manager')
           )
           or (
             role.name = 'Super Admin'
             and exists (
               select 1
               from public.platform_owner_bindings owner
               where owner.staff_profile_id = staff.id
                 and owner.auth_user_id = staff.user_id
                 and owner.authority = 'platform-owner'
             )
           )
         )
     ) then
    raise exception 'NORMAN_TRANSFER_MANAGEMENT_APPROVAL_REQUIRED';
  end if;

  if trim(coalesce(p_approval_reason, '')) <>
     'Management-approved transfer of existing deposit to replacement booking.' then
    raise exception 'NORMAN_TRANSFER_REASON_INVALID';
  end if;

  select * into v_existing
  from public.payment_reallocations
  where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payment_id <> '79a9090b-49d5-41f6-b1ca-e2bfcc96d75d'::uuid
       or v_existing.approved_by_staff_profile_id <> p_actor_staff_profile_id then
      raise exception 'NORMAN_TRANSFER_IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ZNG-XD6ABJ', 0));
  perform pg_advisory_xact_lock(hashtextextended('ZNG-759ZR8', 0));

  select * into v_source from public.bookings
  where booking_reference = 'ZNG-XD6ABJ' for update;
  select * into v_target from public.bookings
  where booking_reference = 'ZNG-759ZR8' for update;
  select * into v_payment from public.payments
  where id = '79a9090b-49d5-41f6-b1ca-e2bfcc96d75d'::uuid for update;

  if v_source.id is null or v_target.id is null or v_payment.id is null
     or v_source.booking_status <> 'cancelled'
     or v_target.booking_status = 'cancelled'
     or v_target.archived_at is not null
     or v_source.customer_id is distinct from v_target.customer_id
     or v_payment.booking_id <> v_source.id
     or v_payment.provider_transaction_id <> '335149581'
     or round(v_payment.amount, 2) <> 4400.00
     or v_payment.payment_status not in ('deposit_paid', 'fully_paid') then
    raise exception 'NORMAN_TRANSFER_AUTHORITATIVE_STATE_CHANGED';
  end if;

  if exists (
       select 1 from public.payment_refunds
       where payment_id = v_payment.id
         and refund_status not in ('failed', 'cancelled')
     ) or exists (
       select 1 from public.manual_payment_reversals
       where payment_id = v_payment.id
     ) then
    raise exception 'NORMAN_TRANSFER_PAYMENT_NOT_AVAILABLE';
  end if;

  if exists (
       select 1 from public.payment_reallocations where payment_id = v_payment.id
     ) then
    raise exception 'NORMAN_TRANSFER_ALREADY_COMPLETED';
  end if;

  if exists (
       select 1
       from public.xero_documents document
       where document.source_booking_id in (v_source.id, v_target.id)
         and (document.xero_document_id is not null or document.sync_status <> 'local_only')
     ) or exists (
       select 1
       from public.xero_sync_outbox outbox
       join public.xero_documents document on document.id = outbox.document_id
       where document.source_booking_id in (v_source.id, v_target.id)
         and outbox.status in ('pending', 'processing', 'completed')
     ) then
    raise exception 'NORMAN_TRANSFER_XERO_RECONCILIATION_REQUIRED';
  end if;

  v_before := jsonb_build_object(
    'payment', jsonb_build_object(
      'id', v_payment.id,
      'bookingId', v_payment.booking_id,
      'reference', v_payment.reference,
      'amount', v_payment.amount,
      'paymentStatus', v_payment.payment_status,
      'processedAt', v_payment.processed_at,
      'providerTransactionId', v_payment.provider_transaction_id
    ),
    'source', jsonb_build_object(
      'bookingReference', v_source.booking_reference,
      'bookingStatus', v_source.booking_status,
      'paymentStatus', v_source.payment_status,
      'amountPaid', v_source.amount_paid,
      'balanceOutstanding', v_source.balance_outstanding
    ),
    'target', jsonb_build_object(
      'bookingReference', v_target.booking_reference,
      'bookingStatus', v_target.booking_status,
      'paymentStatus', v_target.payment_status,
      'amountPaid', v_target.amount_paid,
      'balanceOutstanding', v_target.balance_outstanding
    )
  );

  update public.payments
  set booking_id = v_target.id,
      notes = concat_ws(E'\n', nullif(notes, ''),
        'Management-approved reallocation from ZNG-XD6ABJ to ZNG-759ZR8.')
  where id = v_payment.id;

  select coalesce(sum(amount), 0) into v_source_paid
  from public.payments
  where booking_id = v_source.id
    and payment_status in ('deposit_paid', 'fully_paid');
  select coalesce(sum(amount), 0) into v_target_paid
  from public.payments
  where booking_id = v_target.id
    and payment_status in ('deposit_paid', 'fully_paid');

  v_source_paid := round(v_source_paid, 2);
  v_target_paid := round(v_target_paid, 2);
  v_source_balance := greatest(round(v_source.total_amount - v_source_paid, 2), 0);
  v_target_balance := greatest(round(v_target.total_amount - v_target_paid, 2), 0);
  v_source_status := case
    when v_source_paid <= 0 then 'pending_payment'::public.payment_status
    when v_source_balance <= 0 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status end;
  v_target_status := case
    when v_target_paid <= 0 then 'pending_payment'::public.payment_status
    when v_target_balance <= 0 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status end;

  update public.bookings
  set amount_paid = v_source_paid,
      balance_outstanding = v_source_balance,
      payment_status = v_source_status,
      notes = case when notes like v_prefix || '%' then
        v_prefix || ((substring(notes from length(v_prefix) + 1)::jsonb) ||
          jsonb_build_object(
            'amountPaid', v_source_paid,
            'balanceDue', v_source_balance,
            'paymentStatus', replace(v_source_status::text, '_', '-')
          ))::text
        else notes end,
      updated_at = clock_timestamp()
  where id = v_source.id;

  update public.bookings
  set amount_paid = v_target_paid,
      balance_outstanding = v_target_balance,
      payment_status = v_target_status,
      notes = case when notes like v_prefix || '%' then
        v_prefix || ((substring(notes from length(v_prefix) + 1)::jsonb) ||
          jsonb_build_object(
            'amountPaid', v_target_paid,
            'balanceDue', v_target_balance,
            'paymentStatus', replace(v_target_status::text, '_', '-')
          ))::text
        else notes end,
      updated_at = clock_timestamp()
  where id = v_target.id;

  v_after := jsonb_build_object(
    'payment', jsonb_build_object(
      'id', v_payment.id,
      'bookingId', v_target.id,
      'reference', v_payment.reference,
      'amount', v_payment.amount,
      'paymentStatus', v_payment.payment_status,
      'processedAt', v_payment.processed_at,
      'providerTransactionId', v_payment.provider_transaction_id
    ),
    'source', jsonb_build_object(
      'bookingReference', v_source.booking_reference,
      'bookingStatus', v_source.booking_status,
      'paymentStatus', v_source_status,
      'amountPaid', v_source_paid,
      'balanceOutstanding', v_source_balance
    ),
    'target', jsonb_build_object(
      'bookingReference', v_target.booking_reference,
      'bookingStatus', v_target.booking_status,
      'paymentStatus', v_target_status,
      'amountPaid', v_target_paid,
      'balanceOutstanding', v_target_balance
    )
  );

  insert into public.payment_reallocations(
    idempotency_key, payment_id, from_booking_id, to_booking_id, amount,
    provider_transaction_id, approval_reason, approved_by_staff_profile_id,
    approved_by_auth_user_id, before_values, after_values
  ) values (
    p_idempotency_key, v_payment.id, v_source.id, v_target.id, v_payment.amount,
    v_payment.provider_transaction_id, trim(p_approval_reason),
    p_actor_staff_profile_id, p_actor_auth_user_id, v_before, v_after
  ) returning * into v_transfer;

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, source_area
  ) values (
    'payment.management-reallocation', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id, v_after, v_before,
    array['booking_id','amount_paid','balance_outstanding','payment_status'],
    v_payment.id::text, 'cape-town', v_payment.provider_transaction_id,
    'payment', 'success', trim(p_approval_reason), 'booking-payment-reallocation'
  );

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, source_area
  ) values
  (
    'booking.payment-reallocation-out', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id, v_after->'source', v_before->'source',
    array['amount_paid','balance_outstanding','payment_status'],
    v_source.id::text, 'cape-town', v_source.booking_reference,
    'booking', 'success', trim(p_approval_reason), 'booking-payment-reallocation'
  ),
  (
    'booking.payment-reallocation-in', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id, v_after->'target', v_before->'target',
    array['amount_paid','balance_outstanding','payment_status'],
    v_target.id::text, 'cape-town', v_target.booking_reference,
    'booking', 'success', trim(p_approval_reason), 'booking-payment-reallocation'
  );

  return v_transfer;
end;
$$;

revoke all on function public.reallocate_norman_deposit_atomic(uuid,text,uuid,uuid,text,text,text[])
  from public, anon, authenticated;
grant execute on function public.reallocate_norman_deposit_atomic(uuid,text,uuid,uuid,text,text,text[])
  to service_role;

comment on function public.reallocate_norman_deposit_atomic(uuid,text,uuid,uuid,text,text,text[]) is
  'One-time Fatima or bound Platform Owner approved atomic reallocation of PayFast transaction 335149581; no refund or provider write.';
