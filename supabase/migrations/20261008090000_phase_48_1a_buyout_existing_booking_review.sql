-- Phase 48.1A: preserve pre-existing booking identities for manual Buyout-show relocation.
-- The existing bookings remain untouched; the Buyout remains a separate population.

create or replace function public.create_corporate_buyout_atomic(
  p_show_id uuid,
  p_company_id uuid,
  p_contact_customer_id uuid,
  p_package_id uuid,
  p_expected_guest_count integer,
  p_final_guest_count integer,
  p_additional_guest_rate numeric,
  p_maximum_guest_count integer,
  p_quote_valid_until timestamptz,
  p_hold_until timestamptz,
  p_payment_due_at timestamptz,
  p_terms_snapshot jsonb,
  p_booking_reference text,
  p_idempotency_key text,
  p_authorized_venues text[],
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_request_id text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_booking_count integer;
  v_active_guest_count integer;
  v_additional_amount numeric(12,2);
  v_additional_guests integer;
  v_booking public.bookings%rowtype;
  v_buyout public.corporate_buyouts%rowtype;
  v_company public.companies%rowtype;
  v_contact public.customers%rowtype;
  v_current_guest_count integer;
  v_existing public.corporate_buyouts%rowtype;
  v_package public.corporate_buyout_packages%rowtype;
  v_preexisting_bookings jsonb;
  v_reference text;
  v_show public.shows%rowtype;
  v_total numeric(12,2);
  v_total_operational_capacity integer;
  v_venue_key text;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'BUYOUT_IDEMPOTENCY_REQUIRED'; end if;
  if p_expected_guest_count is null or p_expected_guest_count <= 0 then raise exception 'BUYOUT_GUEST_COUNT_INVALID'; end if;
  if p_final_guest_count is not null and p_final_guest_count <= 0 then raise exception 'BUYOUT_GUEST_COUNT_INVALID'; end if;

  select buyout.* into v_existing
  from public.corporate_buyouts buyout
  where buyout.terms_snapshot ->> 'idempotencyKey' = trim(p_idempotency_key)
  limit 1;
  if found then
    return jsonb_build_object(
      'idempotent', true,
      'buyoutId', v_existing.id,
      'bookingId', v_existing.booking_id,
      'bookingReference', (select booking_reference from public.bookings where id = v_existing.booking_id)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('corporate-buyout:' || p_show_id::text, 0));

  select buyout.* into v_existing
  from public.corporate_buyouts buyout
  where buyout.terms_snapshot ->> 'idempotencyKey' = trim(p_idempotency_key)
  limit 1;
  if found then
    return jsonb_build_object(
      'idempotent', true,
      'buyoutId', v_existing.id,
      'bookingId', v_existing.booking_id,
      'bookingReference', (select booking_reference from public.bookings where id = v_existing.booking_id)
    );
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if not found then raise exception 'BUYOUT_SHOW_NOT_FOUND'; end if;
  if v_show.status::text <> 'active' then raise exception 'BUYOUT_SHOW_NOT_OPEN'; end if;

  v_venue_key := case
    when lower(v_show.venue) like '%johannesburg%' or lower(v_show.venue) = 'jhb' then 'johannesburg'
    when lower(v_show.venue) like '%cape town%' or lower(v_show.venue) = 'cpt' then 'cape-town'
    else lower(replace(v_show.venue, ' ', '-'))
  end;
  if not ('all' = any(coalesce(p_authorized_venues, '{}'::text[])))
     and not (v_venue_key = any(coalesce(p_authorized_venues, '{}'::text[]))) then
    raise exception 'BUYOUT_VENUE_NOT_ALLOWED';
  end if;

  if exists (
    select 1 from public.corporate_buyouts
    where show_id = p_show_id
      and state in ('provisional', 'awaiting_payment', 'fully_paid', 'confirmed')
  ) then raise exception 'BUYOUT_SHOW_ALREADY_OWNED'; end if;

  select
    count(*)::integer,
    coalesce(sum(guest_count), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bookingId', id,
          'bookingReference', booking_reference
        ) order by created_at, id
      ),
      '[]'::jsonb
    )
    into v_active_booking_count, v_active_guest_count, v_preexisting_bookings
  from public.bookings
  where show_id = p_show_id
    and archived_at is null
    and booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

  select * into v_package
  from public.corporate_buyout_packages
  where id = p_package_id and active
  for share;
  if not found then raise exception 'BUYOUT_PACKAGE_NOT_AVAILABLE'; end if;
  if p_maximum_guest_count is distinct from v_package.maximum_guest_count
     or p_additional_guest_rate is distinct from v_package.additional_guest_rate then
    raise exception 'BUYOUT_PACKAGE_CHANGED';
  end if;

  select * into v_company
  from public.companies
  where id = p_company_id and archived_at is null and merged_into_company_id is null
  for share;
  if not found then raise exception 'BUYOUT_COMPANY_NOT_AVAILABLE'; end if;

  select * into v_contact
  from public.customers
  where id = p_contact_customer_id
    and company_id = p_company_id
    and merged_into_customer_id is null
  for share;
  if not found then raise exception 'BUYOUT_CONTACT_NOT_LINKED'; end if;

  v_current_guest_count := coalesce(p_final_guest_count, p_expected_guest_count);
  v_additional_guests := greatest(v_current_guest_count - v_package.included_guest_count, 0);
  if v_additional_guests > 0 then
    if p_maximum_guest_count is null or p_additional_guest_rate is null then
      raise exception 'BUYOUT_EXTRA_TERMS_REQUIRED';
    end if;
    if v_current_guest_count > p_maximum_guest_count then raise exception 'BUYOUT_MAXIMUM_EXCEEDED'; end if;
  end if;
  v_additional_amount := round(v_additional_guests * coalesce(p_additional_guest_rate, 0), 2);
  v_total := v_package.total_amount + v_additional_amount;

  select coalesce(sum(public.booking_capacity_zone_effective_limit(p_show_id, zone_id)), 0)::integer
    into v_total_operational_capacity
  from unnest(array['golden-circle','middle-ring','royal-booths','royal-balcony']) zone_id;
  if v_current_guest_count > v_total_operational_capacity then
    raise exception 'BUYOUT_OPERATIONAL_CAPACITY_EXCEEDED';
  end if;

  v_reference := upper(trim(p_booking_reference));
  if v_reference !~ '^ZNG-[A-Z0-9]{6,12}$' or exists (
    select 1 from public.bookings where booking_reference = v_reference
  ) then raise exception 'BUYOUT_BOOKING_REFERENCE_INVALID'; end if;

  insert into public.bookings (
    customer_id, company_id, show_id, table_id, corporate_request_id,
    booking_reference, booking_source, booking_origin, created_by_staff_id,
    provenance_recorded_at, company_name, guest_count, booking_status,
    payment_status, section, zone_entitlements, service_fee, subtotal_amount,
    discount_amount, addons_total, total_amount, amount_paid,
    balance_outstanding, notes
  ) values (
    p_contact_customer_id, p_company_id, p_show_id, null, null,
    v_reference, 'corporate-direct', 'corporate', p_actor_staff_profile_id,
    now(), v_company.legal_name, v_current_guest_count, 'pending_payment',
    'pending_payment', 'Full Show Buyout', null, v_package.gratuity_amount,
    v_package.base_amount + v_package.vat_amount + v_additional_amount,
    0, 0, v_total, 0, v_total,
    '__zingara_booking_meta__:' || jsonb_build_object(
      'bookingOrigin', 'corporate',
      'commercialModel', 'fixed-buyout-package',
      'createdByStaffId', p_actor_staff_profile_id,
      'buyoutPackageCode', v_package.code,
      'buyoutPackageVersion', v_package.version,
      'ticketIssuanceDeferred', true
    )::text
  ) returning * into v_booking;

  insert into public.corporate_buyouts (
    booking_id, show_id, company_id, contact_customer_id, package_id,
    package_snapshot, terms_snapshot, state, expected_guest_count,
    current_guest_count, final_guest_count, included_guest_count,
    approved_additional_guest_count, additional_guest_rate,
    allocated_guest_count, unallocated_guest_count,
    commercial_base_amount, commercial_gratuity_amount,
    commercial_vat_amount, commercial_additional_guest_amount,
    commercial_total_amount, quote_valid_until, hold_until, payment_due_at,
    created_by_staff_profile_id, updated_by_staff_profile_id
  ) values (
    v_booking.id, p_show_id, p_company_id, p_contact_customer_id, v_package.id,
    jsonb_build_object(
      'code', v_package.code, 'version', v_package.version,
      'displayName', v_package.display_name, 'currency', v_package.currency,
      'baseAmount', v_package.base_amount, 'gratuityAmount', v_package.gratuity_amount,
      'vatAmount', v_package.vat_amount, 'totalAmount', v_package.total_amount,
      'includedGuestCount', v_package.included_guest_count,
      'inclusions', v_package.inclusions, 'exclusions', v_package.exclusions
    ),
    coalesce(p_terms_snapshot, '{}'::jsonb) || jsonb_build_object(
      'idempotencyKey', trim(p_idempotency_key),
      'preExistingBookingCount', v_active_booking_count,
      'preExistingGuestCount', v_active_guest_count,
      'preExistingBookings', v_preexisting_bookings
    ),
    'awaiting_payment', p_expected_guest_count, v_current_guest_count,
    p_final_guest_count, v_package.included_guest_count, v_additional_guests,
    case when v_additional_guests > 0 then p_additional_guest_rate else null end,
    0, v_current_guest_count, v_package.base_amount, v_package.gratuity_amount,
    v_package.vat_amount, v_additional_amount, v_total,
    p_quote_valid_until, p_hold_until, p_payment_due_at,
    p_actor_staff_profile_id, p_actor_staff_profile_id
  ) returning * into v_buyout;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, request_id, source_area, user_agent
  ) values (
    'corporate.buyout.created', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'booking_id', v_booking.id, 'booking_reference', v_reference,
      'show_id', p_show_id, 'company_id', p_company_id,
      'contact_customer_id', p_contact_customer_id,
      'package', v_buyout.package_snapshot, 'state', v_buyout.state,
      'expected_guest_count', p_expected_guest_count,
      'current_guest_count', v_current_guest_count,
      'final_guest_count', p_final_guest_count,
      'commercial_total_amount', v_total,
      'unallocated_guest_count', v_current_guest_count,
      'pre_existing_booking_count', v_active_booking_count,
      'pre_existing_guest_count', v_active_guest_count,
      'pre_existing_bookings', v_preexisting_bookings
    ), '{}',
    array['booking_id','show_id','company_id','package','state','guest_count','commercial_total_amount'],
    v_buyout.id::text, v_venue_key, v_reference, 'corporate_buyout',
    'success', case
      when v_active_booking_count > 0 then
        'Full Show Buyout created. Public booking is closed and existing bookings need review.'
      else
        'Full Show Buyout created. Public booking is closed for this performance.'
    end,
    p_request_id, 'Corporate Bookings', p_user_agent
  );

  return jsonb_build_object(
    'idempotent', false, 'buyoutId', v_buyout.id,
    'bookingId', v_booking.id, 'bookingReference', v_reference,
    'state', v_buyout.state, 'totalAmount', v_total
  );
end;
$$;
