-- P0 booking and payment-link integrity:
-- - reprice unpaid native guest reductions from their saved per-person basis;
-- - keep financial metadata synchronized; and
-- - revoke stale payment links in the same transaction as a financial change.

create or replace function public.reconcile_unpaid_native_guest_reduction_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_guest_count integer,
  p_reason text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id text,
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
  v_deposit_amount numeric := 0;
  v_deposit_percentage numeric := 100;
  v_deposit_per_person numeric;
  v_discounted_subtotal numeric;
  v_metadata jsonb := '{}'::jsonb;
  v_new_balance numeric;
  v_new_service_fee numeric := 0;
  v_new_subtotal numeric;
  v_new_total numeric;
  v_now timestamptz;
  v_payment_model text;
  v_pricing jsonb := '{}'::jsonb;
  v_pricing_source text;
  v_result jsonb;
  v_revoked_links integer := 0;
  v_unit_amount numeric;
  v_zone_id text;
begin
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

  if v_actor_name is null then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;

  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if p_guest_count is null or p_guest_count <= 0 then raise exception 'GUEST_COUNT_INVALID'; end if;
  if p_guest_count >= v_booking.guest_count then raise exception 'GUEST_COUNT_REDUCTION_REQUIRED'; end if;
  if round(coalesce(v_booking.amount_paid, 0), 2) <> 0
     or v_booking.payment_status::text <> 'pending_payment'
     or v_booking.booking_origin not in ('admin_staff', 'customer_public')
     or v_booking.booking_source not in ('admin', 'online') then
    raise exception 'UNPAID_NATIVE_REDUCTION_NOT_ALLOWED';
  end if;

  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then
      raise exception 'UNPAID_REDUCTION_PRICING_BASIS_REQUIRED';
    end;
  end if;

  v_pricing := coalesce(v_metadata -> 'pricingProvenance', '{}'::jsonb);
  v_pricing_source := coalesce(v_pricing ->> 'source', v_metadata ->> 'agreedPriceSource');
  v_payment_model := coalesce(v_pricing ->> 'paymentModel', v_metadata ->> 'paymentOption');
  v_zone_id := nullif(v_metadata ->> 'zoneId', '');
  v_unit_amount := coalesce(
    nullif(v_pricing ->> 'agreedPricePerPerson', '')::numeric,
    nullif(v_metadata ->> 'pricePerPerson', '')::numeric
  );

  if v_pricing_source not in ('standard-zone', 'friends-family', 'show-specific', 'temporary-table')
     or v_payment_model not in ('deposit', 'full')
     or v_unit_amount is null
     or v_unit_amount <= 0 then
    raise exception 'UNPAID_REDUCTION_PRICING_BASIS_REQUIRED';
  end if;

  v_deposit_per_person := nullif(v_pricing ->> 'depositPerPerson', '')::numeric;
  if v_deposit_per_person is null and v_zone_id is not null then
    select nullif(settings #>> array['zonePricing', v_zone_id, 'depositAmount'], '')::numeric
      into v_deposit_per_person
      from public.venue_settings
     where settings #>> array['zonePricing', v_zone_id, 'depositMode'] = 'fixed'
       and nullif(settings #>> array['zonePricing', v_zone_id, 'depositAmount'], '')::numeric >= 0
     order by updated_at desc nulls last
     limit 1;
  end if;
  if v_deposit_per_person is null
     and coalesce(nullif(v_metadata ->> 'partySize', '')::numeric, 0) > 0
     and coalesce(nullif(v_metadata ->> 'totalPrice', '')::numeric, 0) > 0
     and coalesce(nullif(v_metadata ->> 'depositPercentage', '')::numeric, 0) > 0 then
    v_deposit_per_person := round(
      (v_metadata ->> 'totalPrice')::numeric
      * (v_metadata ->> 'depositPercentage')::numeric / 100
      / (v_metadata ->> 'partySize')::numeric,
      2
    );
  end if;
  if v_deposit_per_person is null or v_deposit_per_person < 0 then
    raise exception 'UNPAID_REDUCTION_PRICING_BASIS_REQUIRED';
  end if;

  v_new_subtotal := round(
    p_guest_count * v_unit_amount
    + coalesce(v_booking.addons_total, 0),
    2
  );
  v_discounted_subtotal := greatest(
    round(v_new_subtotal - coalesce(v_booking.discount_amount, 0), 2),
    0
  );
  -- Native Standard and Friends & Family bookings pay gratuity at the venue.
  v_new_total := v_discounted_subtotal;
  v_new_balance := v_new_total;
  v_deposit_amount := least(
    v_new_total,
    round(p_guest_count * v_deposit_per_person, 2)
  );
  v_deposit_percentage := case
    when v_new_total > 0 then v_deposit_amount / v_new_total * 100
    else 100
  end;

  -- Reuse the established table, capacity, ticket and audit protections first.
  v_result := public.reconcile_booking_guest_count_financials_atomic(
    p_booking_reference,
    p_expected_updated_at,
    p_guest_count,
    p_reason,
    p_actor_staff_profile_id,
    p_actor_auth_user_id,
    p_request_id,
    p_user_agent
  );

  v_pricing := v_pricing || jsonb_build_object(
    'agreedPricePerPerson', round(v_unit_amount, 2),
    'authorizedByStaffId', coalesce(v_pricing ->> 'authorizedByStaffId', v_booking.created_by_staff_id::text),
    'depositPerPerson', round(v_deposit_per_person, 2),
    'paymentModel', v_payment_model,
    'source', v_pricing_source
  );
  v_metadata := jsonb_set(v_metadata, '{partySize}', to_jsonb(p_guest_count), true);
  v_metadata := jsonb_set(v_metadata, '{subtotalPrice}', to_jsonb(v_new_subtotal), true);
  v_metadata := jsonb_set(v_metadata, '{serviceFeeAmount}', to_jsonb(v_new_service_fee), true);
  v_metadata := jsonb_set(v_metadata, '{totalPrice}', to_jsonb(v_new_total), true);
  v_metadata := jsonb_set(v_metadata, '{balanceDue}', to_jsonb(v_new_balance), true);
  v_metadata := jsonb_set(v_metadata, '{amountPaid}', '0'::jsonb, true);
  v_metadata := jsonb_set(v_metadata, '{depositPercentage}', to_jsonb(v_deposit_percentage), true);
  v_metadata := jsonb_set(v_metadata, '{paymentStatus}', to_jsonb('pending-payment'::text), true);
  v_metadata := jsonb_set(v_metadata, '{gratuityPolicy}', to_jsonb('pay-at-venue'::text), true);
  v_metadata := jsonb_set(v_metadata, '{pricingProvenance}', v_pricing, true);

  v_now := clock_timestamp();
  update public.bookings
     set subtotal_amount = v_new_subtotal,
         service_fee = v_new_service_fee,
         total_amount = v_new_total,
         balance_outstanding = v_new_balance,
         notes = '__zingara_booking_meta__:' || v_metadata::text,
         updated_at = v_now
   where id = v_booking.id;

  with revoked as (
    update public.booking_payment_links
       set status = 'revoked', revoked_at = v_now, updated_at = v_now
     where booking_id = v_booking.id and status = 'active'
     returning id
  ) select count(*) into v_revoked_links from revoked;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.unpaid-guest-reduction-repriced', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'guest_count', p_guest_count,
      'subtotal_amount', v_new_subtotal,
      'service_fee', v_new_service_fee,
      'total_amount', v_new_total,
      'amount_paid', 0,
      'balance_outstanding', v_new_balance,
      'deposit_amount', v_deposit_amount,
      'payment_links_revoked', v_revoked_links
    ),
    jsonb_build_object(
      'guest_count', v_booking.guest_count,
      'subtotal_amount', v_booking.subtotal_amount,
      'service_fee', v_booking.service_fee,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding
    ),
    array['guest_count','subtotal_amount','service_fee','total_amount','balance_outstanding','notes','payment_links'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    trim(p_reason), p_request_id || ':unpaid-reprice', 'Bookings', p_user_agent
  );

  return v_result || jsonb_build_object(
    'subtotal_amount', v_new_subtotal,
    'service_fee', v_new_service_fee,
    'total_amount', v_new_total,
    'amount_paid', 0,
    'balance_outstanding', v_new_balance,
    'deposit_amount', v_deposit_amount,
    'payment_links_revoked', v_revoked_links,
    'updated_at', v_now
  );
end;
$$;

create or replace function public.reconcile_booking_financials_and_links_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_total_amount numeric,
  p_amount_paid numeric,
  p_reason text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_metadata jsonb := '{}'::jsonb;
  v_now timestamptz;
  v_result jsonb;
  v_revoked_links integer := 0;
begin
  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;

  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then
      v_metadata := '{}'::jsonb;
    end;
  end if;

  v_result := public.reconcile_booking_financials_atomic(
    p_booking_reference, p_expected_updated_at, p_total_amount, p_amount_paid,
    p_reason, p_actor_staff_profile_id, p_actor_auth_user_id, p_request_id,
    p_user_agent
  );

  select * into v_booking from public.bookings where id = v_booking.id for update;
  v_metadata := jsonb_set(v_metadata, '{subtotalPrice}', to_jsonb(v_booking.subtotal_amount), true);
  v_metadata := jsonb_set(v_metadata, '{totalPrice}', to_jsonb(v_booking.total_amount), true);
  v_metadata := jsonb_set(v_metadata, '{amountPaid}', to_jsonb(v_booking.amount_paid), true);
  v_metadata := jsonb_set(v_metadata, '{balanceDue}', to_jsonb(v_booking.balance_outstanding), true);
  v_metadata := jsonb_set(
    v_metadata,
    '{paymentStatus}',
    to_jsonb(case v_booking.payment_status::text
      when 'fully_paid' then 'fully-paid'
      when 'deposit_paid' then 'deposit-paid'
      else 'pending-payment'
    end),
    true
  );

  v_now := clock_timestamp();
  update public.bookings
     set notes = '__zingara_booking_meta__:' || v_metadata::text,
         updated_at = v_now
   where id = v_booking.id;

  with revoked as (
    update public.booking_payment_links
       set status = 'revoked', revoked_at = v_now, updated_at = v_now
     where booking_id = v_booking.id and status = 'active'
     returning id
  ) select count(*) into v_revoked_links from revoked;

  if v_revoked_links > 0 then
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, request_id,
      source_area, user_agent
    )
    select
      'booking.payment-links-invalidated', p_actor_auth_user_id,
      coalesce(staff.venue_scope, '{}'::text[]), staff.full_name, role.name,
      staff.id, jsonb_build_object('payment_links_revoked', v_revoked_links),
      jsonb_build_object('payment_links_revoked', 0), array['payment_links'],
      v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
      'Financial reconciliation changed the authoritative booking balance.',
      p_request_id || ':payment-links', 'Bookings', p_user_agent
      from public.staff_profiles staff
      join public.roles role on role.id = staff.role_id
     where staff.id = p_actor_staff_profile_id
       and staff.user_id = p_actor_auth_user_id
       and staff.active;
  end if;

  return v_result || jsonb_build_object(
    'payment_links_revoked', v_revoked_links,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.reconcile_unpaid_native_guest_reduction_atomic(
  text,timestamptz,integer,text,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.reconcile_unpaid_native_guest_reduction_atomic(
  text,timestamptz,integer,text,uuid,uuid,text,text
) to service_role;

revoke all on function public.reconcile_booking_financials_and_links_atomic(
  text,timestamptz,numeric,numeric,text,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.reconcile_booking_financials_and_links_atomic(
  text,timestamptz,numeric,numeric,text,uuid,uuid,text,text
) to service_role;

comment on function public.reconcile_unpaid_native_guest_reduction_atomic is
  'Reprices an unpaid native per-person booking reduction and atomically revokes stale payment links.';
comment on function public.reconcile_booking_financials_and_links_atomic is
  'Synchronizes booking metadata and revokes stale payment links with an authorised financial reconciliation.';

