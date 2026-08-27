-- Phase 39.6A: lock ambiguous PayFast outcomes and reconcile confirmed refunds
-- as one local transaction. Existing refund and business rows are not rewritten.

alter table public.payment_refunds
  drop constraint if exists payment_refunds_refund_status_check;

alter table public.payment_refunds
  add constraint payment_refunds_refund_status_check
  check (
    refund_status in (
      'processing',
      'accepted',
      'failed',
      'reconciliation_required'
    )
  );

drop index if exists public.payment_refunds_full_success_uidx;

create unique index payment_refunds_full_success_uidx
  on public.payment_refunds (booking_id)
  where refund_type = 'full'
    and refund_status in ('processing', 'accepted', 'reconciliation_required');

create or replace function public.reconcile_payfast_refund_atomic(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_response jsonb,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_reason text,
  p_request_id text,
  p_ip_address inet,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_payment public.payments%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_ticket_ids uuid[];
begin
  select *
    into v_refund
    from public.payment_refunds
   where id = p_refund_id
   for update;

  if v_refund.id is null then
    raise exception 'REFUND_NOT_FOUND';
  end if;

  if v_refund.refund_status = 'accepted' then
    return jsonb_build_object(
      'booking_id', v_refund.booking_id,
      'booking_reference', v_refund.booking_reference,
      'status', 'already_reconciled'
    );
  end if;

  if v_refund.refund_status not in ('processing', 'reconciliation_required') then
    raise exception 'REFUND_NOT_RECONCILABLE';
  end if;

  select *
    into v_booking
    from public.bookings
   where id = v_refund.booking_id
   for update;

  select *
    into v_payment
    from public.payments
   where id = v_refund.payment_id
   for update;

  if v_booking.id is null
     or v_payment.id is null
     or v_payment.booking_id <> v_booking.id
     or nullif(trim(v_payment.provider_transaction_id), '') is null
     or v_payment.provider_transaction_id <> v_refund.provider_payment_id
     or v_refund.refund_type <> 'full'
     or v_refund.refund_amount <= 0 then
    raise exception 'REFUND_RELATIONSHIP_INVALID';
  end if;

  update public.payment_refunds
     set completed_at = v_now,
         provider_response = coalesce(p_provider_response, '{}'::jsonb),
         provider_refund_id = nullif(trim(p_provider_refund_id), ''),
         refund_status = 'accepted',
         updated_at = v_now
   where id = v_refund.id;

  update public.bookings
     set balance_outstanding = 0,
         booking_status = 'refunded',
         payment_status = 'refunded',
         updated_at = v_now
   where id = v_booking.id;

  update public.payments
     set notes = concat_ws(
           E'\n',
           nullif(v_payment.notes, ''),
           format('PayFast refund processed: %s', p_reason),
           format('Original paid amount preserved: %s', to_char(v_payment.amount, 'FM999999990.00'))
         ),
         payment_status = 'refunded',
         payment_type = 'refund'
   where id = v_payment.id;

  update public.show_tables
     set booking_id = null,
         status = 'available',
         updated_at = v_now
   where booking_id = v_booking.id
     and status = 'booked';

  update public.tickets
     set ticket_status = 'refunded',
         updated_at = v_now
   where booking_id = v_booking.id;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_ticket_ids
    from public.tickets
   where booking_id = v_booking.id;

  insert into public.booking_lifecycle_events (
    booking_id,
    changed_by,
    from_status,
    note,
    reason,
    to_status
  ) values (
    v_booking.id,
    p_actor_staff_profile_id,
    v_booking.booking_status,
    p_reason,
    p_reason,
    'refunded'
  );

  insert into public.audit_events (
    action,
    actor_auth_user_id,
    actor_location_scope,
    actor_name,
    actor_role,
    actor_staff_profile_id,
    after_values,
    before_values,
    changed_fields,
    entity_id,
    entity_reference,
    entity_type,
    ip_address,
    outcome,
    reason,
    request_id,
    source_area,
    user_agent
  ) values (
    'booking.refund',
    p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]),
    p_actor_name,
    p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'amount', v_refund.refund_amount,
      'payment_status', 'refunded',
      'provider_result', 'accepted'
    ),
    jsonb_build_object(
      'amount', v_payment.amount,
      'payment_status', v_booking.payment_status
    ),
    array['payment_status', 'booking_status', 'refund_amount'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    p_ip_address,
    'success',
    p_reason,
    p_request_id,
    'Bookings',
    p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'status', 'reconciled',
    'ticket_ids', v_ticket_ids
  );
end
$$;

revoke all on function public.reconcile_payfast_refund_atomic(
  uuid, text, jsonb, uuid, uuid, text, text, text[], text, text, inet, text
) from public, anon, authenticated;

grant execute on function public.reconcile_payfast_refund_atomic(
  uuid, text, jsonb, uuid, uuid, text, text, text[], text, text, inet, text
) to service_role;
