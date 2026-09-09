-- Phase 41.1S: guarded, idempotent recovery of the lost Nando's Corporate booking.
-- The function is deliberately specific to the reviewed records and is unavailable
-- to browser roles. It stages the replacement booking, swaps capacity atomically,
-- and leaves no externally visible capacity gap.
create or replace function public.recover_nandos_corporate_booking_atomic(
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_actor_role text;
  v_booking_id uuid;
  v_booking_reference constant text := 'ZNG-ND22GC';
  v_cancelled_duplicate public.bookings%rowtype;
  v_capacity integer;
  v_customer public.customers%rowtype;
  v_existing public.bookings%rowtype;
  v_hold public.bookings%rowtype;
  v_hold_ids uuid[] := array[
    '67cbb570-d6d8-463a-bead-0c2751ca7bf6'::uuid,
    '1d1ddb34-04eb-4396-af6c-952089adc601'::uuid
  ];
  v_hold_meta jsonb;
  v_hold_pax integer;
  v_now timestamptz := clock_timestamp();
  v_other_active_pax integer;
  v_payment_id uuid;
  v_recovery_key constant text := 'phase-41.1s-nandos-corp-mtlk49mw-343';
  v_show public.shows%rowtype;
  v_booking_meta jsonb;
begin
  select staff.*
    into v_actor
    from public.staff_profiles staff
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and exists (
       select 1
         from public.role_permissions rp
         join public.permissions permission on permission.id = rp.permission_id
        where rp.role_id = staff.role_id
          and permission.key = 'bookings:manage'
     );
  if v_actor.id is null then
    raise exception 'NANDOS_RECOVERY_PERMISSION_REQUIRED';
  end if;
  select role.name into v_actor_role
    from public.roles role
   where role.id = v_actor.role_id;

  perform pg_advisory_xact_lock(hashtextextended(
    '42d46e9a-7de3-4a40-829d-d0b3afe902c2:golden-circle', 0
  ));
  perform pg_advisory_xact_lock(hashtext(v_recovery_key));

  select * into v_show
    from public.shows
   where id = '42d46e9a-7de3-4a40-829d-d0b3afe902c2'::uuid
   for update;
  if v_show.id is null
     or v_show.venue <> 'johannesburg'
     or v_show.date <> date '2026-10-11'
     or v_show.time <> time '17:00' then
    raise exception 'NANDOS_RECOVERY_SHOW_CHANGED';
  end if;

  select * into v_customer
    from public.customers
   where id = 'b1cab7c7-7f7b-49a0-9930-9ee9a462257d'::uuid
     and lower(email) = 'timikas@nandosgroup.com'
   for update;
  if v_customer.id is null then
    raise exception 'NANDOS_RECOVERY_CUSTOMER_CHANGED';
  end if;
  if (select count(*) from public.customers where lower(email) = 'timikas@nandosgroup.com') <> 1 then
    raise exception 'NANDOS_RECOVERY_CUSTOMER_AMBIGUOUS';
  end if;

  select * into v_existing
    from public.bookings
   where booking_reference = v_booking_reference
      or (notes like '__zingara_booking_meta__:%' and notes like '%' || v_recovery_key || '%')
   order by created_at
   limit 1
   for update;
  if v_existing.id is not null then
    if v_existing.booking_reference <> v_booking_reference
       or v_existing.customer_id <> v_customer.id
       or v_existing.show_id <> v_show.id
       or v_existing.booking_source <> 'corporate-direct'
       or v_existing.booking_origin <> 'corporate'
       or v_existing.guest_count <> 22
       or public.normalize_booking_capacity_zone(v_existing.section) <> 'golden-circle'
       or v_existing.total_amount <> 50490
       or v_existing.amount_paid <> 0
       or v_existing.balance_outstanding <> 50490
       or v_existing.booking_status::text <> 'pending_payment'
       or v_existing.archived_at is not null then
      raise exception 'NANDOS_RECOVERY_IDEMPOTENCY_CONFLICT';
    end if;
    if exists (
      select 1 from public.bookings
       where id = any(v_hold_ids)
         and archived_at is null
         and booking_status::text in ('new','pending_payment','confirmed','checked_in')
    ) then
      raise exception 'NANDOS_RECOVERY_PARTIAL_STATE';
    end if;
    return jsonb_build_object(
      'bookingId', v_existing.id,
      'bookingReference', v_existing.booking_reference,
      'customerId', v_existing.customer_id,
      'status', 'already_complete'
    );
  end if;

  perform 1
    from public.bookings
   where id = any(v_hold_ids)
   order by id
   for update;
  select coalesce(sum(guest_count), 0)::integer, count(*)
    into v_hold_pax, v_capacity
    from public.bookings
   where id = any(v_hold_ids)
     and show_id = v_show.id
     and customer_id = v_customer.id
     and booking_reference in ('ZNG-GH3FEY', 'ZNG-MLZQA4')
     and booking_source = 'admin'
     and booking_origin = 'admin_staff'
     and public.normalize_booking_capacity_zone(section) = 'golden-circle'
     and booking_status::text = 'pending_payment'
     and payment_status::text = 'pending_payment'
     and amount_paid = 0
     and table_id is null
     and archived_at is null;
  if v_capacity <> 2 or v_hold_pax <> 22 then
    raise exception 'NANDOS_RECOVERY_HOLDS_CHANGED';
  end if;
  if exists (
    select 1
      from public.payments payment
     where payment.booking_id = any(v_hold_ids)
       and (payment.payment_status::text <> 'pending_payment'
         or payment.provider_transaction_id is not null
         or payment.amount <> case
           when payment.booking_id = '67cbb570-d6d8-463a-bead-0c2751ca7bf6'::uuid then 20790
           when payment.booking_id = '1d1ddb34-04eb-4396-af6c-952089adc601'::uuid then 17325
           else -1
         end)
  ) or (select count(*) from public.payments where booking_id = any(v_hold_ids)) <> 2 then
    raise exception 'NANDOS_RECOVERY_HOLD_PAYMENT_CHANGED';
  end if;
  if exists (select 1 from public.tickets where booking_id = any(v_hold_ids))
     or exists (select 1 from public.booking_payment_links where booking_id = any(v_hold_ids))
     or exists (select 1 from public.communications where booking_id = any(v_hold_ids))
     or exists (select 1 from public.show_tables where booking_id = any(v_hold_ids)) then
    raise exception 'NANDOS_RECOVERY_HOLD_DEPENDENCY_CHANGED';
  end if;

  select * into v_cancelled_duplicate
    from public.bookings
   where id = '7716da41-4c0c-4fb0-8473-06808b19eb4d'::uuid
     and booking_reference = 'ZNG-GV4CWT'
     and booking_status::text = 'cancelled'
     and amount_paid = 0
   for update;
  if v_cancelled_duplicate.id is null or exists (
    select 1 from public.payments
     where booking_id = v_cancelled_duplicate.id
       and provider_transaction_id is not null
  ) then
    raise exception 'NANDOS_RECOVERY_CANCELLED_DUPLICATE_CHANGED';
  end if;

  v_capacity := public.booking_capacity_zone_limit('golden-circle');
  if v_capacity <> 155 then
    raise exception 'NANDOS_RECOVERY_CAPACITY_CONFIGURATION_CHANGED';
  end if;
  select coalesce(sum(public.booking_zone_entitlement_pax(
    booking.zone_entitlements, booking.section, booking.guest_count, 'golden-circle'
  )), 0)::integer
    into v_other_active_pax
    from public.bookings booking
   where booking.show_id = v_show.id
     and booking.id <> all(v_hold_ids)
     and booking.archived_at is null
     and booking.booking_status::text in ('new','pending_payment','confirmed','checked_in');
  if v_other_active_pax + 22 > v_capacity then
    raise exception 'NANDOS_RECOVERY_CAPACITY_CHANGED';
  end if;

  if not exists (
    select 1 from public.venue_settings
     where (settings #>> '{zonePricing,golden-circle,price}')::numeric = 1540
       and (settings #>> '{zonePricing,golden-circle,depositAmount}')::numeric = 550
  ) then
    raise exception 'NANDOS_RECOVERY_PRICING_CONFIGURATION_CHANGED';
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'barTab', 11000,
      'capacity', v_capacity,
      'customerId', v_customer.id,
      'depositRequired', 12100,
      'holdPax', v_hold_pax,
      'otherActiveGoldenCirclePax', v_other_active_pax,
      'status', 'ready',
      'ticketObligation', 33880,
      'totalObligation', 50490
    );
  end if;

  v_booking_id := gen_random_uuid();
  v_booking_meta := jsonb_build_object(
    'reference', v_booking_reference,
    'showId', v_show.id,
    'zoneId', 'golden-circle',
    'zoneTitle', 'Golden Circle',
    'tableId', '',
    'tableNumber', '',
    'partySize', 22,
    'bookingDate', '2026-10-11 17:00',
    'addons', jsonb_build_array(jsonb_build_object(
      'id', 'custom-nandos-bar-tab',
      'kind', 'custom',
      'name', 'Pre-authorised Bar Tab',
      'description', 'Authoritative original enquiry requirement: R500 per guest.',
      'pricingType', 'priced',
      'quantity', 22,
      'unitPrice', 500,
      'price', 11000
    )),
    'addonsTotal', 11000,
    'subtotalPrice', 44880,
    'discountAmount', 0,
    'serviceFeeAmount', 5610,
    'totalPrice', 50490,
    'pricePerPerson', 1540,
    'agreedPriceSource', 'standard-zone',
    'reservationTableClaims', '[]'::jsonb,
    'paymentOption', 'deposit',
    'paymentStatus', 'pending-payment',
    'depositPercentage', 23.96514161220044,
    'amountPaid', 0,
    'balanceDue', 50490,
    'source', 'corporate-direct',
    'customer', jsonb_build_object(
      'email', v_customer.email,
      'name', concat_ws(' ', v_customer.first_name, v_customer.surname),
      'phone', v_customer.mobile
    ),
    'status', 'pending-payment',
    'lifecycleHistory', jsonb_build_array(
      jsonb_build_object(
        'id', v_booking_reference || '-created',
        'toStatus', 'new',
        'note', 'Recovered from reviewed Corporate source evidence',
        'createdAt', v_now
      ),
      jsonb_build_object(
        'id', v_booking_reference || '-pending-payment',
        'fromStatus', 'new',
        'toStatus', 'pending-payment',
        'note', 'Awaiting separate R12,100 deposit; no checkout initiated',
        'createdAt', v_now
      )
    ),
    'operationalNotes', E'Company: Nando''s Limited\nHistorical requirement: Arrival Drinks (unavailable for new selection; preserved for operations only)\nDietary requirements: Vegan, Vegetarian, Gluten Free, Strict Halaal\nPre-authorised bar tab: R500 pp (22 guests; R11,000 total)\nOriginal enquiry reference: CORP-MTLK49MW-343\nOriginal enquiry record is absent; no surviving deletion audit and no attribution made.',
    'cancellationReason', '',
    'refundNotes', '',
    'communicationHistory', '[]'::jsonb,
    'createdAt', v_now,
    'bookingOrigin', 'corporate',
    'createdByStaffId', v_actor.id,
    'pricingProvenance', jsonb_build_object(
      'agreedPricePerPerson', 1540,
      'depositPerPerson', 550,
      'paymentModel', 'deposit',
      'source', 'standard-zone'
    ),
    'recoveryKey', v_recovery_key,
    'lostCorporateEnquiryReference', 'CORP-MTLK49MW-343',
    'capacityReplacedFrom', jsonb_build_array('ZNG-GH3FEY', 'ZNG-MLZQA4')
  );

  -- Stage without consuming capacity, then swap both holds and activate before
  -- commit. Other transactions observe either the old 22 pax or the new 22 pax.
  insert into public.bookings (
    id, customer_id, show_id, table_id, corporate_request_id,
    booking_reference, booking_source, company_name, guest_count,
    booking_status, payment_status, section, service_fee, subtotal_amount,
    discount_amount, addons_total, total_amount, amount_paid,
    balance_outstanding, notes, dietary_requirements, created_at, updated_at,
    booking_origin, created_by_staff_id, provenance_recorded_at
  ) values (
    v_booking_id, v_customer.id, v_show.id, null, null,
    v_booking_reference, 'corporate-direct', 'Nando''s Limited', 22,
    'cancelled', 'pending_payment', 'Golden Circle', 5610, 44880,
    0, 11000, 50490, 0,
    50490, '__zingara_booking_meta__:' || v_booking_meta::text,
    'Vegan; Vegetarian; Gluten Free; Strict Halaal', v_now, v_now,
    'corporate', v_actor.id, v_now
  );

  for v_hold in
    select * from public.bookings where id = any(v_hold_ids) order by booking_reference for update
  loop
    v_hold_meta := substring(v_hold.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    v_hold_meta := v_hold_meta || jsonb_build_object(
      'status', 'cancelled',
      'cancellationReason', 'Temporary capacity hold replaced by Corporate booking',
      'cancelledAt', v_now,
      'archivedAt', v_now,
      'supersededByBookingReference', v_booking_reference
    );
    update public.bookings
       set booking_status = 'cancelled',
           payment_status = 'cancelled',
           notes = '__zingara_booking_meta__:' || v_hold_meta::text,
           archived_at = v_now,
           archived_by = p_actor_auth_user_id,
           archive_reason = 'Temporary capacity hold replaced by Corporate booking',
           updated_at = v_now
     where id = v_hold.id;
    insert into public.booking_lifecycle_events (
      booking_id, from_status, to_status, note, reason, changed_by, created_at
    ) values (
      v_hold.id, 'pending_payment', 'cancelled',
      'Temporary capacity hold replaced by Corporate booking ' || v_booking_reference,
      'Temporary capacity hold replaced by Corporate booking',
      p_actor_auth_user_id, v_now
    );
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, source_area
    ) values (
      'booking.temporary-capacity-hold-superseded', p_actor_auth_user_id,
      coalesce(v_actor.venue_scope, '{}'::text[]), v_actor.full_name, v_actor_role,
      v_actor.id,
      jsonb_build_object('archived_at', v_now, 'booking_status', 'cancelled', 'superseded_by', v_booking_reference),
      jsonb_build_object('archived_at', v_hold.archived_at, 'booking_status', v_hold.booking_status, 'pax', v_hold.guest_count),
      array['booking_status','payment_status','archived_at','archive_reason'],
      v_hold.id::text, v_hold.booking_reference, 'booking', 'success',
      'Temporary capacity hold replaced by Corporate booking',
      'Phase 41.1S Controlled Recovery'
    );
  end loop;

  update public.bookings
     set booking_status = 'pending_payment', updated_at = v_now
   where id = v_booking_id;

  insert into public.payments (
    amount, booking_id, method, notes, payment_status, payment_type,
    processed_at, reference, transaction_fee_amount, provider_gross_amount
  ) values (
    12100, v_booking_id, 'platform',
    'Separate Corporate deposit requirement: R550 x 22. Checkout not initiated.',
    'pending_payment', 'deposit', v_now, v_booking_reference, 0, null
  ) returning id into v_payment_id;

  insert into public.booking_lifecycle_events (
    booking_id, from_status, to_status, note, changed_by, created_at
  ) values
    (v_booking_id, null, 'new', 'Recovered from reviewed Corporate source evidence', p_actor_auth_user_id, v_now),
    (v_booking_id, 'new', 'pending_payment', 'Awaiting separate R12,100 deposit; no checkout initiated', p_actor_auth_user_id, v_now);

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, source_area
  ) values (
    'booking.corporate-recovered-from-lost-enquiry', p_actor_auth_user_id,
    coalesce(v_actor.venue_scope, '{}'::text[]), v_actor.full_name, v_actor_role,
    v_actor.id,
    jsonb_build_object(
      'addons_total', 11000, 'amount_paid', 0, 'balance_outstanding', 50490,
      'bar_tab_per_person', 500, 'booking_status', 'pending_payment',
      'capacity_replaced_from', jsonb_build_array('ZNG-GH3FEY','ZNG-MLZQA4'),
      'customer_id', v_customer.id, 'deposit_required', 12100,
      'dietary_requirements', jsonb_build_array('Vegan','Vegetarian','Gluten Free','Strict Halaal'),
      'guest_count', 22, 'historical_arrival_drinks_preserved', true,
      'lost_enquiry_reference', 'CORP-MTLK49MW-343',
      'payment_id', v_payment_id, 'provider_transaction_id', null,
      'section', 'Golden Circle', 'service_fee', 5610,
      'subtotal_amount', 44880, 'ticket_obligation', 33880,
      'total_amount', 50490
    ),
    '{}'::jsonb,
    array['booking','capacity_entitlement','financials','provenance'],
    v_booking_id::text, v_booking_reference, 'booking', 'success',
    'User-approved recovery. Original enquiry row is absent; no surviving deletion audit and no historical deletion attribution made.',
    'Phase 41.1S Controlled Recovery'
  );

  return jsonb_build_object(
    'bookingId', v_booking_id,
    'bookingReference', v_booking_reference,
    'customerId', v_customer.id,
    'depositRequired', 12100,
    'holdPaxReplaced', 22,
    'paymentId', v_payment_id,
    'status', 'recovered',
    'totalObligation', 50490
  );
end;
$$;

revoke all on function public.recover_nandos_corporate_booking_atomic(uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.recover_nandos_corporate_booking_atomic(uuid,uuid,boolean)
  to service_role;
