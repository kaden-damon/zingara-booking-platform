-- P0: restore the conflated Kelly Robinson and Melanie Dineplan reservations.
-- The function is deliberately allowlisted to the reviewed source identities and
-- performs no customer communication, ticket creation, or table fabrication.

create or replace function public.restore_kelly_dineplan_booking_atomic(
  p_expected_updated_at timestamptz,
  p_staff_profile_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_auth_user_id uuid;
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_after_middle record;
  v_after_royal record;
  v_before_middle record;
  v_before_royal record;
  v_existing_audit uuid;
  v_existing_evidence public.legacy_booking_payment_evidence%rowtype;
  v_existing_payment public.payments%rowtype;
  v_kelly public.bookings%rowtype;
  v_kelly_customer public.customers%rowtype;
  v_kelly_meta jsonb;
  v_melanie_id uuid := gen_random_uuid();
  v_melanie_meta jsonb;
  v_melanie_reference constant text := 'DP-JHB-2C13118E212C';
  v_required_extra integer;
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
begin
  if p_expected_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128 then
    raise exception 'KELLY_RESTORATION_INPUT_INVALID';
  end if;

  select staff.user_id, staff.venue_scope, staff.full_name, role.name
    into v_actor_auth_user_id, v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
   where staff.id = p_staff_profile_id
     and staff.active
     and lower(role.name) = 'super admin'
     and ('all' = any(coalesce(staff.venue_scope, '{}'::text[]))
       or 'johannesburg' = any(coalesce(staff.venue_scope, '{}'::text[])));

  if v_actor_auth_user_id is null then
    raise exception 'ACTIVE_JOHANNESBURG_SUPER_ADMIN_REQUIRED';
  end if;

  select audit.id into v_existing_audit
    from public.audit_events audit
   where audit.action = 'booking.dineplan-identity-restored'
     and audit.entity_reference = 'DP-NK9BQC'
     and audit.request_id = trim(p_request_id)
     and audit.outcome = 'success'
   limit 1;
  if v_existing_audit is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'idempotent', true,
      'kelly_reference', 'DP-NK9BQC',
      'melanie_reference', v_melanie_reference
    );
  end if;

  perform pg_advisory_xact_lock(hashtext('DP-NK9BQC'));
  perform pg_advisory_xact_lock(hashtext(v_melanie_reference));

  select * into v_kelly
    from public.bookings
   where id = '53145f64-7ac8-42a1-8386-64da357dc6cf'::uuid
     and booking_reference = 'DP-NK9BQC'
   for update;
  if v_kelly.id is null then raise exception 'KELLY_BOOKING_NOT_FOUND'; end if;
  if v_kelly.updated_at is distinct from p_expected_updated_at then
    raise exception 'KELLY_BOOKING_REVISION_CHANGED';
  end if;
  if v_kelly.customer_id <> 'c56e0348-c093-4015-aa21-e517dfd75c91'::uuid
     or v_kelly.show_id <> '1deee6a6-5615-4995-9ad7-1c8678935f30'::uuid
     or v_kelly.table_id <> '05bedd18-996e-4170-ae2d-e1ffe18a077b'::uuid
     or v_kelly.guest_count <> 18
     or v_kelly.section <> 'Royal Balcony'
     or v_kelly.booking_status::text <> 'confirmed'
     or v_kelly.payment_status::text <> 'comp_vip'
     or v_kelly.total_amount <> 23760
     or v_kelly.amount_paid <> 22440
     or v_kelly.balance_outstanding <> 0
     or v_kelly.booking_origin <> 'data_import' then
    raise exception 'KELLY_CONFLATED_STATE_CHANGED';
  end if;

  if exists (select 1 from public.bookings where booking_reference = v_melanie_reference) then
    raise exception 'MELANIE_RECOVERY_REFERENCE_ALREADY_EXISTS';
  end if;

  select * into v_show
    from public.shows
   where id = v_kelly.show_id
     and date = date '2026-10-17'
     and venue = 'johannesburg'
   for update;
  if v_show.id is null then raise exception 'KELLY_SHOW_CHANGED'; end if;

  select * into v_table
    from public.show_tables
   where id = v_kelly.table_id
     and show_id = v_kelly.show_id
     and table_code = '800+801'
     and booking_id = v_kelly.id
     and status::text = 'booked'
   for update;
  if v_table.id is null then raise exception 'MELANIE_TABLE_CLAIM_CHANGED'; end if;

  select * into v_existing_evidence
    from public.legacy_booking_payment_evidence
   where booking_id = v_kelly.id
     and source_checksum = '3878aa384d1b867c85a32b24d0e8d983441b1bd588b9a8ab6be26a2bc4fcc5c0'
     and source_row_number = 1521
     and source_row_fingerprint = '2c13118e212ca9240c71536325feebac19437cc9e689a293c86836a9f0c63b9a'
     and source_payment_amount = 25410
     and source_ticket_amount = 23760
     and full_card_amount = 22440
     and complimentary
     and complimentary_amount = 1320
     and ticket_gratuity_amount = 2970
   for update;
  if v_existing_evidence.id is null then
    raise exception 'MELANIE_FINANCIAL_EVIDENCE_CHANGED';
  end if;

  if (select count(*) from public.tickets where booking_id = v_kelly.id) <> 1
     or not exists (
       select 1 from public.tickets
        where booking_id = v_kelly.id
          and ticket_code = 'DP-NK9BQC-01'
          and qr_payload = 'DP-NK9BQC-01'
     ) then
    raise exception 'KELLY_TICKET_IDENTITY_CHANGED';
  end if;

  select * into v_existing_payment
    from public.payments
   where id = 'c516a63f-953b-41e8-8a29-e13c75f247e3'::uuid
     and booking_id = v_kelly.id
     and payment_type::text = 'comp'
     and payment_status::text = 'comp_vip'
     and amount = 0
     and provider_transaction_id is null
   for update;
  if v_existing_payment.id is null
     or (select count(*) from public.payments where booking_id = v_kelly.id) <> 1 then
    raise exception 'CONFLATED_PAYMENT_PLACEHOLDER_CHANGED';
  end if;

  if exists (select 1 from public.communications where booking_id = v_kelly.id)
     or exists (select 1 from public.review_invitations where booking_id = v_kelly.id)
     or exists (select 1 from public.guest_reviews where booking_id = v_kelly.id) then
    raise exception 'KELLY_CUSTOMER_WORKFLOW_REQUIRES_REVIEW';
  end if;

  select * into v_kelly_customer
    from public.customers
   where id = 'b54e9505-6cc1-43e2-86d0-0ce4ecf561ac'::uuid
     and lower(trim(first_name)) = 'kelly'
     and lower(trim(surname)) = 'robinson'
   for update;
  if v_kelly_customer.id is null then raise exception 'KELLY_CUSTOMER_CHANGED'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_kelly.show_id::text || ':middle-ring', 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_kelly.show_id::text || ':royal-balcony', 0)
  );
  select * into v_before_middle
    from public.booking_capacity_zone_state(v_kelly.show_id, 'middle-ring');
  select * into v_before_royal
    from public.booking_capacity_zone_state(v_kelly.show_id, 'royal-balcony');
  if v_before_middle.effective_operational_capacity is null
     or v_before_royal.effective_operational_capacity is null then
    raise exception 'KELLY_CAPACITY_STATE_UNAVAILABLE';
  end if;

  v_required_extra := greatest(
    v_before_middle.active_entitlement_pax + 18 -
      v_before_middle.effective_operational_capacity,
    0
  );
  if v_required_extra > 16 then
    raise exception 'KELLY_EXTRA_SEATING_REAPPROVAL_REQUIRED|%|16', v_required_extra;
  end if;

  if v_required_extra > 0 then
    insert into public.show_zone_operational_capacity_adjustments (
      show_id, zone_id, seats, booking_id, booking_reference,
      approved_maximum, request_id, actor_name, reason
    ) values (
      v_kelly.show_id,
      'middle-ring',
      v_required_extra,
      v_kelly.id,
      v_kelly.booking_reference,
      16,
      trim(p_request_id) || ':middle-ring',
      v_actor_name,
      'Management-authorised Kelly Robinson Dineplan restoration'
    );
  end if;

  v_kelly_meta := jsonb_build_object(
    'addons', '[]'::jsonb,
    'addonsTotal', 0,
    'amountPaid', 23760,
    'balanceDue', 0,
    'bookingDate', '2026-10-17',
    'bookingOrigin', 'data_import',
    'communicationHistory', '[]'::jsonb,
    'createdAt', '2026-07-23 10:31:58',
    'createdByStaffId', p_staff_profile_id,
    'createdByStaffName', v_actor_name,
    'customer', jsonb_build_object('email', '', 'name', 'Kelly Robinson', 'phone', ''),
    'customerId', v_kelly_customer.id,
    'discountAmount', 0,
    'lifecycleHistory', '[]'::jsonb,
    'operationalNotes', 'INV-1113 Paid in Full (R26,730.00), Tickets (R23,760.00), Gratuity (R2,970.00)\r\n2 Gluten Free\r\n1 Vegan | Legacy Dineplan ref: nk9bqc | Legacy source table: 310, 311, 312 | Legacy Total Balance: R0.00 | Legacy Booking Status: Dep. Paid | Restored from reviewed source evidence; floor assignment required',
    'partySize', 18,
    'paymentOption', 'full',
    'paymentStatus', 'fully-paid',
    'pricePerPerson', 1320,
    'reference', 'DP-NK9BQC',
    'refundNotes', '',
    'serviceFeeAmount', 0,
    'showId', v_kelly.show_id,
    'source', 'corporate-direct',
    'status', 'confirmed',
    'subtotalPrice', 23760,
    'supabaseBookingId', v_kelly.id,
    'tableId', 'requires-floor-assignment',
    'tableNumber', 'Requires floor assignment',
    'ticketCode', 'DP-NK9BQC-01',
    'ticketIssuedAt', '2026-08-17T07:30:16.696258+00:00',
    'totalPrice', 23760,
    'zoneId', 'middle-ring',
    'zoneTitle', 'Middle Ring'
  );

  update public.bookings
     set customer_id = v_kelly_customer.id,
         table_id = null,
         company_name = 'Tyrone Pharmacy',
         booking_source = 'corporate-direct',
         guest_count = 18,
         booking_status = 'confirmed',
         payment_status = 'fully_paid',
         section = 'Middle Ring',
         service_fee = 0,
         subtotal_amount = 23760,
         discount_amount = 0,
         addons_total = 0,
         total_amount = 23760,
         amount_paid = 23760,
         balance_outstanding = 0,
         notes = '__zingara_booking_meta__:' || v_kelly_meta::text,
         dietary_requirements = '2 Gluten Free; 1 Vegan',
         updated_at = clock_timestamp()
   where id = v_kelly.id;

  v_melanie_meta := jsonb_build_object(
    'addons', '[]'::jsonb,
    'addonsTotal', 0,
    'amountPaid', 22440,
    'balanceDue', 0,
    'bookingDate', '2026-10-17',
    'bookingOrigin', 'data_import',
    'communicationHistory', '[]'::jsonb,
    'createdAt', '2026-09-02T08:55:52.664039+00:00',
    'createdByStaffId', p_staff_profile_id,
    'createdByStaffName', v_actor_name,
    'customer', jsonb_build_object('email', '', 'name', 'Melanie Samsung Diecto', 'phone', ''),
    'customerId', v_kelly.customer_id,
    'discountAmount', 0,
    'importSource', jsonb_build_object(
      'checksum', v_existing_evidence.source_checksum,
      'fingerprint', v_existing_evidence.source_row_fingerprint,
      'row', v_existing_evidence.source_row_number,
      'sheet', 'Sheet1',
      'sourcePayment', '25410.00',
      'sourcePaymentNotes', '',
      'sourceTable', '',
      'workbook', v_existing_evidence.source_document
    ),
    'lifecycleHistory', '[]'::jsonb,
    'operationalNotes', 'Final Dineplan source: Dineplan Bookings JHB All bookings.xlsx / Sheet1 row 1521 | Source fingerprint: 2c13118e212ca9240c71536325feebac19437cc9e689a293c86836a9f0c63b9a | Existing table assignment preserved',
    'partySize', 18,
    'paymentOption', 'full',
    'paymentStatus', 'comp-vip',
    'pricePerPerson', 1320,
    'reference', v_melanie_reference,
    'refundNotes', '',
    'serviceFeeAmount', 0,
    'showId', v_kelly.show_id,
    'source', 'corporate-direct',
    'status', 'confirmed',
    'subtotalPrice', 23760,
    'supabaseBookingId', v_melanie_id,
    'tableId', v_table.id,
    'tableNumber', v_table.table_code,
    'totalPrice', 23760,
    'zoneId', 'royal-balcony',
    'zoneTitle', 'Royal Balcony'
  );

  insert into public.bookings (
    id, customer_id, show_id, table_id, corporate_request_id,
    booking_reference, booking_source, company_name, guest_count,
    booking_status, payment_status, section, service_fee, subtotal_amount,
    discount_amount, addons_total, total_amount, amount_paid,
    balance_outstanding, notes, dietary_requirements, created_at, updated_at,
    booking_origin, created_by_staff_id, provenance_recorded_at
  ) values (
    v_melanie_id,
    v_kelly.customer_id,
    v_kelly.show_id,
    null,
    null,
    v_melanie_reference,
    'corporate-direct',
    null,
    18,
    'confirmed',
    'comp_vip',
    'Royal Balcony',
    0,
    23760,
    0,
    0,
    23760,
    22440,
    0,
    '__zingara_booking_meta__:' || v_melanie_meta::text,
    null,
    v_existing_evidence.recorded_at,
    clock_timestamp(),
    'data_import',
    p_staff_profile_id,
    clock_timestamp()
  );

  update public.show_tables
     set booking_id = v_melanie_id,
         status = 'booked',
         updated_at = clock_timestamp()
   where id = v_table.id
     and booking_id = v_kelly.id;
  if not found then raise exception 'MELANIE_TABLE_TRANSFER_FAILED'; end if;

  update public.bookings
     set table_id = v_table.id,
         updated_at = clock_timestamp()
   where id = v_melanie_id;

  update public.legacy_booking_payment_evidence
     set booking_id = v_melanie_id
   where id = v_existing_evidence.id
     and booking_id = v_kelly.id;
  if not found then raise exception 'MELANIE_EVIDENCE_TRANSFER_FAILED'; end if;

  update public.payments
     set booking_id = v_melanie_id,
         reference = v_melanie_reference
   where id = v_existing_payment.id
     and booking_id = v_kelly.id;
  if not found then raise exception 'MELANIE_PAYMENT_PLACEHOLDER_TRANSFER_FAILED'; end if;

  insert into public.legacy_booking_payment_evidence (
    booking_id, source_system, source_document, source_checksum,
    source_row_number, source_row_fingerprint, source_payment_amount,
    source_ticket_amount, full_card_amount, pre_paid_card_amount,
    pre_paid_eft_amount, full_eft_amount, complimentary,
    complimentary_amount, ticket_gratuity_amount, bar_tab_paid_amount,
    bar_gratuity_amount, halaal_meals_amount, kosher_meals_amount,
    classification_reason, match_basis, reconciliation_note,
    recorded_by_staff_id
  ) values (
    v_kelly.id,
    'dineplan',
    'reservations_1Oct2026-31Oct2026.csv',
    '94e27b72b827afe022b939be1724cdb154eaa2291a86b37d75549f2c1fd94726',
    39,
    '71b7c0ddd243262bf7da711b2496be799160a73fa3669cb83844702260255fc5',
    26730,
    23760,
    23760,
    0,
    0,
    0,
    false,
    0,
    2970,
    0,
    0,
    0,
    0,
    'Reviewed Dineplan invoice states paid in full; ticket value excludes gratuity.',
    array[
      'exact Dineplan reference nk9bqc',
      'exact show date 2026-10-17',
      'exact 18 guests',
      'exact Middle Ring entitlement',
      'Tyrone Pharmacy and INV-1113'
    ]::text[],
    'INV-1113: R23,760 ticket value paid in full; R2,970 gratuity remains separate from booking receipts.',
    p_staff_profile_id
  );

  update public.customers
     set preferences = jsonb_set(
           coalesce(preferences, '{}'::jsonb),
           '{customerKey}',
           to_jsonb('melanie samsung diecto'::text),
           true
         ),
         updated_at = clock_timestamp()
   where id = v_kelly.customer_id
     and preferences ->> 'customerKey' = 'kelly robinson';
  if not found then raise exception 'MELANIE_CUSTOMER_IDENTITY_CHANGED'; end if;

  insert into public.booking_lifecycle_events (
    booking_id, changed_by, from_status, to_status, note, reason
  ) values
  (
    v_kelly.id,
    v_actor_auth_user_id,
    'confirmed',
    'confirmed',
    'Restored Kelly Robinson / Tyrone Pharmacy to the original 18-guest Middle Ring Dineplan reservation. Existing ticket identity retained; floor assignment required.',
    'Management-authorised correction of a cross-row Dineplan reconciliation.'
  ),
  (
    v_melanie_id,
    v_actor_auth_user_id,
    null,
    'confirmed',
    'Recovered the distinct Melanie / Samsung Diecto 18-guest Royal Balcony source row. Existing financial evidence and table claim retained.',
    'Management-authorised correction of a cross-row Dineplan reconciliation.'
  );

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area
  ) values
  (
    'booking.dineplan-identity-restored',
    v_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_staff_profile_id,
    jsonb_build_object(
      'customer_id', v_kelly_customer.id,
      'customer', 'Kelly Robinson',
      'company', 'Tyrone Pharmacy',
      'section', 'Middle Ring',
      'guest_count', 18,
      'table_id', null,
      'payment_status', 'fully_paid',
      'total_amount', 23760,
      'amount_paid', 23760,
      'balance_outstanding', 0,
      'ticket_code', 'DP-NK9BQC-01'
    ),
    jsonb_build_object(
      'customer_id', v_kelly.customer_id,
      'customer', 'Melanie Samsung Diecto',
      'section', v_kelly.section,
      'guest_count', v_kelly.guest_count,
      'table_id', v_kelly.table_id,
      'payment_status', v_kelly.payment_status,
      'total_amount', v_kelly.total_amount,
      'amount_paid', v_kelly.amount_paid,
      'balance_outstanding', v_kelly.balance_outstanding
    ),
    array[
      'customer_id', 'company_name', 'section', 'table_id',
      'payment_status', 'amount_paid', 'legacy_payment_evidence'
    ],
    v_kelly.id::text,
    v_kelly.booking_reference,
    'booking',
    'success',
    'Corrected cross-row Dineplan identity contamination; preserved the original booking and ticket identity.',
    trim(p_request_id),
    'Dineplan Import Recovery'
  ),
  (
    'booking.dineplan-distinct-row-recovered',
    v_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_staff_profile_id,
    jsonb_build_object(
      'booking_id', v_melanie_id,
      'booking_reference', v_melanie_reference,
      'customer_id', v_kelly.customer_id,
      'customer', 'Melanie Samsung Diecto',
      'section', 'Royal Balcony',
      'guest_count', 18,
      'table_id', v_table.id,
      'payment_status', 'comp_vip',
      'total_amount', 23760,
      'amount_paid', 22440,
      'balance_outstanding', 0,
      'source_row_fingerprint', v_existing_evidence.source_row_fingerprint
    ),
    '{}'::jsonb,
    array['booking'],
    v_melanie_id::text,
    v_melanie_reference,
    'booking',
    'success',
    'Recovered the distinct source row previously overlaid onto DP-NK9BQC.',
    trim(p_request_id) || ':melanie',
    'Dineplan Import Recovery'
  );

  if v_required_extra > 0 then
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, request_id,
      source_area
    ) values (
      'show.zone-operational-capacity.approved-added',
      v_actor_auth_user_id,
      coalesce(v_actor_location_scope, '{}'::text[]),
      v_actor_name,
      v_actor_role,
      p_staff_profile_id,
      jsonb_build_object(
        'show_id', v_kelly.show_id,
        'zone_id', 'middle-ring',
        'temporary_capacity', v_before_middle.temporary_capacity + v_required_extra,
        'effective_capacity', v_before_middle.effective_operational_capacity + v_required_extra,
        'booking_reference', v_kelly.booking_reference
      ),
      jsonb_build_object(
        'show_id', v_kelly.show_id,
        'zone_id', 'middle-ring',
        'temporary_capacity', v_before_middle.temporary_capacity,
        'effective_capacity', v_before_middle.effective_operational_capacity
      ),
      array['temporary_operational_capacity'],
      v_kelly.show_id::text,
      v_kelly.booking_reference,
      'show',
      'success',
      'Management-authorised Kelly Robinson Dineplan restoration',
      trim(p_request_id) || ':capacity',
      'Dineplan Import Recovery'
    );
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area
  ) values (
    'customer.dineplan-identity-corrected',
    v_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_staff_profile_id,
    jsonb_build_object('customerKey', 'melanie samsung diecto'),
    jsonb_build_object('customerKey', 'kelly robinson'),
    array['preferences.customerKey'],
    v_kelly.customer_id::text,
    'Melanie Samsung Diecto',
    'customer',
    'success',
    'Removed the stale Kelly search key from the distinct Melanie customer.',
    trim(p_request_id) || ':customer',
    'Dineplan Import Recovery'
  );

  select * into v_after_middle
    from public.booking_capacity_zone_state(v_kelly.show_id, 'middle-ring');
  select * into v_after_royal
    from public.booking_capacity_zone_state(v_kelly.show_id, 'royal-balcony');
  if v_after_middle.active_entitlement_pax <> v_before_middle.active_entitlement_pax + 18
     or v_after_middle.active_entitlement_pax > v_after_middle.effective_operational_capacity
     or v_after_royal.active_entitlement_pax <> v_before_royal.active_entitlement_pax then
    raise exception 'KELLY_POST_RESTORATION_CAPACITY_MISMATCH';
  end if;

  if not exists (
       select 1 from public.bookings booking
        where booking.id = v_kelly.id
          and booking.booking_reference = 'DP-NK9BQC'
          and booking.customer_id = v_kelly_customer.id
          and booking.show_id = v_show.id
          and booking.guest_count = 18
          and booking.section = 'Middle Ring'
          and booking.table_id is null
          and booking.booking_status::text = 'confirmed'
          and booking.payment_status::text = 'fully_paid'
          and booking.total_amount = 23760
          and booking.amount_paid = 23760
          and booking.balance_outstanding = 0
     )
     or not exists (
       select 1 from public.tickets ticket
        where ticket.booking_id = v_kelly.id
          and ticket.ticket_code = 'DP-NK9BQC-01'
          and ticket.qr_payload = 'DP-NK9BQC-01'
     )
     or not exists (
       select 1 from public.legacy_booking_payment_evidence evidence
        where evidence.booking_id = v_kelly.id
          and evidence.source_row_fingerprint =
            '71b7c0ddd243262bf7da711b2496be799160a73fa3669cb83844702260255fc5'
          and evidence.source_ticket_amount = 23760
          and evidence.full_card_amount = 23760
     ) then
    raise exception 'KELLY_POST_RESTORATION_IDENTITY_MISMATCH';
  end if;

  if not exists (
       select 1 from public.bookings booking
        where booking.id = v_melanie_id
          and booking.booking_reference = v_melanie_reference
          and booking.customer_id = v_kelly.customer_id
          and booking.show_id = v_show.id
          and booking.guest_count = 18
          and booking.section = 'Royal Balcony'
          and booking.table_id = v_table.id
          and booking.booking_status::text = 'confirmed'
          and booking.payment_status::text = 'comp_vip'
          and booking.total_amount = 23760
          and booking.amount_paid = 22440
          and booking.balance_outstanding = 0
     )
     or not exists (
       select 1 from public.show_tables table_row
        where table_row.id = v_table.id
          and table_row.booking_id = v_melanie_id
          and table_row.status::text = 'booked'
     )
     or not exists (
       select 1 from public.legacy_booking_payment_evidence evidence
        where evidence.id = v_existing_evidence.id
          and evidence.booking_id = v_melanie_id
     )
     or not exists (
       select 1 from public.payments payment
        where payment.id = v_existing_payment.id
          and payment.booking_id = v_melanie_id
          and payment.reference = v_melanie_reference
     ) then
    raise exception 'MELANIE_POST_RECOVERY_IDENTITY_MISMATCH';
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'idempotent', false,
    'kelly_booking_id', v_kelly.id,
    'kelly_reference', v_kelly.booking_reference,
    'melanie_booking_id', v_melanie_id,
    'melanie_reference', v_melanie_reference,
    'approved_extra_added', v_required_extra,
    'middle_ring_before', v_before_middle.active_entitlement_pax,
    'middle_ring_after', v_after_middle.active_entitlement_pax,
    'middle_ring_operational_capacity_after', v_after_middle.effective_operational_capacity,
    'royal_balcony_before', v_before_royal.active_entitlement_pax,
    'royal_balcony_after', v_after_royal.active_entitlement_pax,
    'kelly_table_state', 'requires-floor-assignment',
    'customer_communications_sent', 0
  );
end;
$$;

revoke all on function public.restore_kelly_dineplan_booking_atomic(timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.restore_kelly_dineplan_booking_atomic(timestamptz, uuid, text)
  to service_role;

comment on function public.restore_kelly_dineplan_booking_atomic(timestamptz, uuid, text) is
  'Management-authorised, allowlisted and idempotent recovery of the conflated Kelly Robinson and Melanie Dineplan source rows.';
