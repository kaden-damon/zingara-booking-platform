-- Phase 41.2X-P0-D: make authorised manual full settlement one atomic,
-- retry-safe operation with actor-attributed evidence.
create or replace function public.mark_booking_paid_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_reason text,
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
  v_existing_audit_id uuid;
  v_link_count integer := 0;
  v_new_booking_status public.booking_status;
  v_now timestamptz := clock_timestamp();
  v_outstanding numeric(10,2);
  v_payment public.payments%rowtype;
  v_payment_id uuid;
  v_payment_type public.payment_type;
  v_show public.shows%rowtype;
  v_ticket_count integer := 0;
  v_ticket_status public.ticket_status;
  v_venue text;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_updated_at is null
     or nullif(trim(p_reason), '') is null
     or length(trim(p_reason)) < 3
     or length(trim(p_reason)) > 500
     or nullif(trim(p_idempotency_key), '') is null
     or length(trim(p_idempotency_key)) > 128
     or nullif(trim(p_ticket_code), '') is null then
    raise exception 'MARK_PAID_INPUT_INVALID';
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
     and permission.key = 'bookings:manage';

  if v_actor_name is null then
    raise exception 'MARK_PAID_PERMISSION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));

  select *
    into v_booking
    from public.bookings
   where booking_reference = upper(trim(p_booking_reference))
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  select id
    into v_existing_audit_id
    from public.audit_events
   where action = 'booking.payment-recorded'
     and entity_id = v_booking.id::text
     and request_id = trim(p_idempotency_key)
     and outcome = 'success'
   limit 1;

  if v_existing_audit_id is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'idempotent', true,
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'updated_at', v_booking.updated_at
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'completed', 'refunded', 'no_show')
     or v_booking.payment_status::text in ('cancelled', 'comp_vip', 'refunded') then
    raise exception 'MARK_PAID_NOT_ALLOWED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null then
    raise exception 'SHOW_NOT_FOUND';
  end if;

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
  ) then
    raise exception 'SHOW_OUTSIDE_STAFF_SCOPE';
  end if;

  v_outstanding := greatest(
    round(coalesce(v_booking.total_amount, 0) - coalesce(v_booking.amount_paid, 0), 2),
    0
  );

  if v_outstanding <= 0.01
     or v_booking.payment_status::text = 'fully_paid' then
    raise exception 'BOOKING_ALREADY_PAID';
  end if;

  v_payment_type := case
    when coalesce(v_booking.amount_paid, 0) > 0 then 'balance'::public.payment_type
    else 'full_payment'::public.payment_type
  end;
  v_new_booking_status := case
    when v_booking.booking_status::text in ('new', 'pending_payment')
      then 'confirmed'::public.booking_status
    else v_booking.booking_status
  end;
  v_ticket_status := case
    when v_new_booking_status::text = 'checked_in' then 'checked_in'::public.ticket_status
    else 'valid'::public.ticket_status
  end;

  select *
    into v_payment
    from public.payments
   where booking_id = v_booking.id
     and payment_status = 'pending_payment'
     and provider_transaction_id is null
   order by created_at desc
   limit 1
   for update;

  if v_payment.id is null then
    insert into public.payments (
      amount, booking_id, method, notes, payment_status, payment_type,
      processed_at, processed_by, provider_gross_amount,
      provider_transaction_id, reference, transaction_fee_amount
    ) values (
      v_outstanding,
      v_booking.id,
      'manual',
      format('Authorised manual full settlement by %s: %s', v_actor_name, trim(p_reason)),
      'fully_paid',
      v_payment_type,
      v_now,
      p_actor_auth_user_id,
      null,
      null,
      v_booking.booking_reference,
      null
    ) returning id into v_payment_id;
  else
    update public.payments
       set amount = v_outstanding,
           method = 'manual',
           notes = format('Authorised manual full settlement by %s: %s', v_actor_name, trim(p_reason)),
           payment_status = 'fully_paid',
           payment_type = v_payment_type,
           processed_at = v_now,
           processed_by = p_actor_auth_user_id,
           provider_gross_amount = null,
           provider_transaction_id = null,
           reference = v_booking.booking_reference,
           transaction_fee_amount = null
     where id = v_payment.id
     returning id into v_payment_id;
  end if;

  update public.bookings
     set amount_paid = round(coalesce(v_booking.total_amount, 0), 2),
         balance_outstanding = 0,
         booking_status = v_new_booking_status,
         payment_status = 'fully_paid',
         updated_at = v_now
   where id = v_booking.id;

  update public.booking_payment_links
     set revoked_at = v_now,
         status = 'revoked',
         updated_at = v_now
   where booking_id = v_booking.id
     and status = 'active';
  get diagnostics v_link_count = row_count;

  update public.tickets
     set ticket_status = case
           when ticket_status in ('cancelled', 'refunded', 'void', 'checked_in')
             then ticket_status
           else v_ticket_status
         end,
         updated_at = v_now
   where booking_id = v_booking.id;
  get diagnostics v_ticket_count = row_count;

  if v_ticket_count = 0 then
    insert into public.tickets (
      booking_id, issued_at, qr_payload, ticket_code, ticket_status, ticket_url, updated_at
    ) values (
      v_booking.id,
      v_now,
      trim(p_ticket_code),
      trim(p_ticket_code),
      v_ticket_status,
      nullif(trim(p_ticket_url), ''),
      v_now
    );
    v_ticket_count := 1;
  end if;

  insert into public.booking_lifecycle_events (
    booking_id, changed_by, created_at, from_status, note, reason, to_status
  ) values (
    v_booking.id,
    p_actor_auth_user_id,
    v_now,
    v_booking.booking_status,
    format('Manual full payment recorded by %s.', v_actor_name),
    trim(p_reason),
    v_new_booking_status
  );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.payment-recorded',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'amount_paid', round(coalesce(v_booking.total_amount, 0), 2),
      'balance_outstanding', 0,
      'booking_status', v_new_booking_status,
      'manual_payment_amount', v_outstanding,
      'payment_id', v_payment_id,
      'payment_links_revoked', v_link_count,
      'payment_status', 'fully_paid',
      'tickets_updated', v_ticket_count
    ),
    jsonb_build_object(
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status
    ),
    array['amount_paid', 'balance_outstanding', 'booking_status', 'payment_status'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    trim(p_reason),
    trim(p_idempotency_key),
    'Booking Details · Mark Paid',
    p_user_agent
  );

  return jsonb_build_object(
    'status', 'processed',
    'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'booking_status', v_new_booking_status,
    'payment_status', 'fully_paid',
    'payment_id', v_payment_id,
    'manual_payment_amount', v_outstanding,
    'total_amount', round(coalesce(v_booking.total_amount, 0), 2),
    'amount_paid', round(coalesce(v_booking.total_amount, 0), 2),
    'balance_outstanding', 0,
    'payment_links_revoked', v_link_count,
    'tickets_updated', v_ticket_count,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.mark_booking_paid_atomic(
  text, timestamptz, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.mark_booking_paid_atomic(
  text, timestamptz, text, text, text, text, uuid, uuid, text
) to service_role;

comment on function public.mark_booking_paid_atomic(
  text, timestamptz, text, text, text, text, uuid, uuid, text
) is 'Atomically records actor-attributed manual full settlement, booking aggregates, lifecycle, links, tickets and immutable audit evidence.';
