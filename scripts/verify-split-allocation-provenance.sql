-- Run only through the rollback-only verifier. All fixtures are synthetic.
create temporary table split_allocation_qa_results (case_name text primary key);
do $$
declare
  v_staff uuid;
  v_customer uuid;
  v_show uuid;
  v_payload jsonb;
  v_payment jsonb;
  v_allocations jsonb;
  v_entitlements jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_booking public.bookings%rowtype;
  v_case text;
  v_reference text;
  v_expected_failure boolean := current_setting('zingara.qa_expect_original', true) = 'true';
begin
  select staff.id into strict v_staff
  from public.staff_profiles staff
  where staff.active and exists (
    select 1 from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role_id = staff.role_id and p.key = 'bookings:manage'
  ) order by staff.id limit 1;

  insert into public.customers(first_name) values ('ROLLBACK ONLY split allocation QA')
    returning id into v_customer;
  insert into public.shows(name,date,time,venue,status)
    select 'ROLLBACK ONLY split allocation QA', '2099-11-19', '19:00', venue, 'sold_out'
    from public.shows order by created_at desc limit 1 returning id into v_show;

  foreach v_case in array array['pay-now','send-payment-link','multi-zone','corporate','all-comp']
  loop
    v_reference := 'QA-SPLIT-PROVENANCE-' || v_case;
    v_allocations := case when v_case = 'multi-zone' then
      '[{"zoneId":"golden-circle","paidPax":3,"complimentaryPax":1,"complimentaryCategory":"standard"},{"zoneId":"middle-ring","paidPax":3,"complimentaryPax":1,"complimentaryCategory":"media"}]'::jsonb
    when v_case = 'all-comp' then
      '[{"zoneId":"golden-circle","paidPax":0,"complimentaryPax":8,"complimentaryCategory":"standard"}]'::jsonb
    else '[{"zoneId":"golden-circle","paidPax":6,"complimentaryPax":2,"complimentaryCategory":"standard"}]'::jsonb end;
    v_entitlements := public.booking_guest_allocation_entitlements(v_allocations);
    v_payload := jsonb_build_object(
      'booking_reference',v_reference,'customer_id',v_customer,'guest_count',8,
      'booking_source',case when v_case='corporate' then 'corporate-direct' else 'admin' end,
      'booking_origin','admin_staff','created_by_staff_id',v_staff,
      'provenance_recorded_at','2026-11-01T00:00:00Z',
      'booking_status',case when v_case='all-comp' then 'confirmed' else 'pending_payment' end,
      'payment_status',case when v_case='all-comp' then 'fully_paid' else 'pending_payment' end,
      'subtotal_amount',case when v_case='all-comp' then 0 else 9240 end,
      'total_amount',case when v_case='all-comp' then 0 when v_case='corporate' then 10395 else 9240 end,
      'balance_outstanding',case when v_case='all-comp' then 0 when v_case='corporate' then 10395 else 9240 end,
      'amount_paid',0,'service_fee',case when v_case='corporate' then 1155 else 0 end,
      'notes','__zingara_booking_meta__:' || jsonb_build_object(
        'bookingOrigin','admin_staff','createdByStaffId',v_staff
      )::text
    );
    v_payment := jsonb_build_object('amount',0,'method','platform','payment_type','deposit',
      'payment_status',case when v_case='all-comp' then 'fully_paid' else 'pending_payment' end,
      'reference',v_reference,'notes',v_case);

    if v_expected_failure then
      begin
        perform public.reserve_staff_guest_allocations(v_show,v_payload,v_payment,v_entitlements,v_allocations);
        raise exception 'QA: expected provenance conflict was not raised';
      exception when raise_exception then
        if sqlerrm <> 'BOOKING_PROVENANCE_IMMUTABLE' then raise; end if;
      end;
      if exists(select 1 from public.bookings where booking_reference=v_reference)
        or exists(select 1 from public.payments where reference=v_reference)
        or exists(select 1 from public.audit_events where entity_reference=v_reference) then
        raise exception 'QA: rejected transaction left partial records';
      end if;
      insert into split_allocation_qa_results values(v_case || ': original conflict reproduced, rollback clean');
      continue;
    end if;

    v_result := public.reserve_staff_guest_allocations(v_show,v_payload,v_payment,v_entitlements,v_allocations);
    select * into strict v_booking from public.bookings where id=(v_result->>'booking_id')::uuid;
    if v_booking.guest_count <> 8 or v_booking.guest_allocations is distinct from v_allocations
      or v_booking.zone_entitlements is distinct from v_entitlements
      or v_booking.amount_paid <> 0
      or v_booking.total_amount <> (v_payload->>'total_amount')::numeric
      or v_booking.balance_outstanding <> v_booking.total_amount
      or v_booking.service_fee <> (v_payload->>'service_fee')::numeric
      or v_booking.provenance_recorded_at <> transaction_timestamp()
      or v_booking.created_by_staff_id <> v_staff or v_booking.booking_origin <> 'admin_staff' then
      raise exception 'QA: allocation, financial or provenance mismatch';
    end if;
    if (select count(*) from public.payments where booking_id=v_booking.id) <> 1
      or (select count(*) from public.audit_events where entity_reference=v_reference
          and action='booking.provenance-recorded') <> 1 then
      raise exception 'QA: missing or duplicate initial payment/provenance';
    end if;
    v_retry := public.reserve_staff_guest_allocations(v_show,v_payload,v_payment,v_entitlements,v_allocations);
    if v_retry->>'status' <> 'already_exists' or v_retry->>'booking_id' <> v_result->>'booking_id'
      or (select count(*) from public.payments where booking_id=v_booking.id) <> 1 then
      raise exception 'QA: retry duplicated booking or payment';
    end if;
    begin
      update public.bookings set provenance_recorded_at=clock_timestamp() where id=v_booking.id;
      raise exception 'QA: provenance mutation unexpectedly accepted';
    exception when raise_exception then
      if sqlerrm <> 'BOOKING_PROVENANCE_IMMUTABLE' then raise; end if;
    end;
    begin
      perform public.reserve_staff_guest_allocations(v_show,v_payload || '{"guest_count":9}',v_payment,
        '[{"zoneId":"golden-circle","pax":9}]',
        '[{"zoneId":"golden-circle","paidPax":7,"complimentaryPax":2,"complimentaryCategory":"standard"}]');
      raise exception 'QA: conflicting retry unexpectedly accepted';
    exception when raise_exception then
      if sqlerrm <> 'STAFF_GUEST_ALLOCATION_IDEMPOTENCY_CONFLICT' then raise; end if;
    end;
    insert into split_allocation_qa_results values(v_case || ': creation, totals, provenance, retry and conflicts passed');
  end loop;

  if not v_expected_failure then
    v_reference := 'QA-SPLIT-PROVENANCE-capacity';
    v_payload := v_payload || jsonb_build_object('booking_reference',v_reference,'guest_count',100000);
    v_allocations := '[{"zoneId":"golden-circle","paidPax":100000,"complimentaryPax":0}]';
    v_entitlements := public.booking_guest_allocation_entitlements(v_allocations);
    begin
      perform public.reserve_staff_guest_allocations(v_show,v_payload,v_payment,v_entitlements,v_allocations);
      raise exception 'QA: over-capacity unexpectedly accepted';
    exception when check_violation then
      if sqlerrm not like 'ZONE_CAPACITY_EXCEEDED%' then raise; end if;
    end;
    if exists(select 1 from public.bookings where booking_reference=v_reference) then
      raise exception 'QA: capacity rejection left a booking';
    end if;
    insert into split_allocation_qa_results values('sold-out internal capacity guard remains enforced');

    v_reference := 'QA-SPLIT-PROVENANCE-late-failure';
    v_payload := v_payload || jsonb_build_object('booking_reference',v_reference,'guest_count',100004);
    v_payment := v_payment || jsonb_build_object('reference',v_reference);
    v_allocations := '[{"zoneId":"golden-circle","paidPax":4,"complimentaryPax":0},{"zoneId":"middle-ring","paidPax":100000,"complimentaryPax":0}]';
    v_entitlements := public.booking_guest_allocation_entitlements(v_allocations);
    begin
      perform public.reserve_staff_guest_allocations(v_show,v_payload,v_payment,v_entitlements,v_allocations);
      raise exception 'QA: final allocation capacity rejection unexpectedly accepted';
    exception when check_violation then
      if sqlerrm not like 'ZONE_CAPACITY_EXCEEDED|middle-ring|%' then raise; end if;
    end;
    if exists(select 1 from public.bookings where booking_reference=v_reference)
      or exists(select 1 from public.payments where reference=v_reference)
      or exists(select 1 from public.audit_events where entity_reference=v_reference) then
      raise exception 'QA: final allocation failure left partial records';
    end if;
    insert into split_allocation_qa_results values('late allocation failure rolls back booking, payment and provenance audit');

    begin
      perform public.reserve_staff_guest_allocations(v_show,
        v_payload || jsonb_build_object('created_by_staff_id',gen_random_uuid()),
        v_payment,v_entitlements,v_allocations);
      raise exception 'QA: unauthorised actor unexpectedly accepted';
    exception when raise_exception then
      if sqlerrm <> 'STAFF_GUEST_ALLOCATION_PERMISSION_REQUIRED' then raise; end if;
    end;
    insert into split_allocation_qa_results values('staff authorisation remains enforced');

    begin
      perform public.reserve_public_booking_entitlement(v_show,
        v_payload || '{"booking_origin":"customer_public","booking_source":"online"}',v_payment);
      raise exception 'QA: public sold-out booking unexpectedly accepted';
    exception when raise_exception then
      if sqlerrm <> 'SHOW_NOT_AVAILABLE' then raise; end if;
    end;
    insert into split_allocation_qa_results values('public sold-out restriction remains enforced');
    set constraints all immediate;
    insert into split_allocation_qa_results values('deferred integrity constraints passed');
  end if;
end;
$$;
select jsonb_agg(case_name order by case_name) as passed from split_allocation_qa_results;
