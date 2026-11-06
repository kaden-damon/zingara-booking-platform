alter table public.corporate_buyout_packages
  add column if not exists venue_key text not null default 'all',
  add column if not exists description text not null default '';

update public.corporate_buyout_packages
set description = array_to_string(array(select jsonb_array_elements_text(inclusions)), ' · ')
where description = '' and jsonb_typeof(inclusions) = 'array';

alter table public.corporate_buyout_packages
  drop constraint if exists corporate_buyout_packages_venue_key_check;
alter table public.corporate_buyout_packages
  add constraint corporate_buyout_packages_venue_key_check
  check (venue_key in ('all', 'cape-town', 'johannesburg'));

alter table public.corporate_buyout_packages
  drop constraint if exists corporate_buyout_packages_code_version_key;
alter table public.corporate_buyout_packages
  add constraint corporate_buyout_packages_venue_code_version_key
  unique (venue_key, code, version);

drop index if exists public.corporate_buyout_packages_one_active_version;
drop index if exists public.corporate_buyout_packages_one_active_version_idx;
create unique index if not exists corporate_buyout_packages_one_active_venue_version
  on public.corporate_buyout_packages (venue_key, code)
  where active;

create or replace function public.save_corporate_buyout_package_version_atomic(
  p_venue_key text,
  p_code text,
  p_display_name text,
  p_description text,
  p_total_amount numeric,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_request_id text,
  p_user_agent text
)
returns public.corporate_buyout_packages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.corporate_buyout_packages%rowtype;
  v_previous public.corporate_buyout_packages%rowtype;
  v_result public.corporate_buyout_packages%rowtype;
  v_version integer;
  v_base numeric(12,2);
  v_gratuity numeric(12,2);
  v_vat numeric(12,2);
begin
  if p_venue_key not in ('cape-town', 'johannesburg') then
    raise exception 'BUYOUT_PACKAGE_VENUE_INVALID';
  end if;
  if nullif(trim(p_display_name), '') is null or length(trim(p_display_name)) > 120 then
    raise exception 'BUYOUT_PACKAGE_NAME_INVALID';
  end if;
  if length(trim(coalesce(p_description, ''))) > 1000 then
    raise exception 'BUYOUT_PACKAGE_DESCRIPTION_INVALID';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'BUYOUT_PACKAGE_PRICE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('buyout-package:' || p_venue_key || ':' || p_code, 0));

  select * into v_previous
  from public.corporate_buyout_packages
  where venue_key = p_venue_key and code = p_code and active
  for update;

  if found then
    v_source := v_previous;
  else
    select * into v_source
    from public.corporate_buyout_packages
    where venue_key = 'all' and code = p_code and active
    for share;
  end if;
  if not found then raise exception 'BUYOUT_PACKAGE_NOT_FOUND'; end if;

  v_base := round(p_total_amount * (v_source.base_amount / v_source.total_amount), 2);
  v_gratuity := round(p_total_amount * (v_source.gratuity_amount / v_source.total_amount), 2);
  v_vat := round(p_total_amount - v_base - v_gratuity, 2);
  select coalesce(max(version), 0) + 1 into v_version
  from public.corporate_buyout_packages
  where venue_key = p_venue_key and code = p_code;

  update public.corporate_buyout_packages
  set active = false, updated_at = now(), updated_by_staff_profile_id = p_actor_staff_profile_id
  where venue_key = p_venue_key and code = p_code and active;

  insert into public.corporate_buyout_packages (
    code, version, display_name, description, venue_key, currency,
    base_amount, gratuity_amount, vat_amount, total_amount,
    included_guest_count, maximum_guest_count, additional_guest_rate,
    quote_validity_hours, date_hold_hours, payment_due_hours,
    inclusions, exclusions, active, created_by_staff_profile_id,
    updated_by_staff_profile_id
  ) values (
    v_source.code, v_version, trim(p_display_name), trim(coalesce(p_description, '')),
    p_venue_key, v_source.currency, v_base, v_gratuity, v_vat,
    round(p_total_amount, 2), v_source.included_guest_count,
    v_source.maximum_guest_count, v_source.additional_guest_rate,
    v_source.quote_validity_hours, v_source.date_hold_hours,
    v_source.payment_due_hours, v_source.inclusions, v_source.exclusions,
    true, p_actor_staff_profile_id, p_actor_staff_profile_id
  ) returning * into v_result;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, request_id, source_area, user_agent
  ) values (
    'corporate.buyout-package.updated', p_actor_auth_user_id, p_actor_name,
    p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('id', v_result.id, 'version', v_result.version,
      'name', v_result.display_name, 'description', v_result.description,
      'totalAmount', v_result.total_amount, 'venueKey', v_result.venue_key),
    case when v_previous.id is null then '{}'::jsonb else
      jsonb_build_object('id', v_previous.id, 'version', v_previous.version,
        'name', v_previous.display_name, 'description', v_previous.description,
        'totalAmount', v_previous.total_amount, 'venueKey', v_previous.venue_key) end,
    array['display_name','description','total_amount','version'],
    v_result.id::text, p_venue_key, v_result.code,
    'corporate_buyout_package', 'success',
    'Venue-specific Buyout package configuration updated.',
    p_request_id, 'Venue Settings', p_user_agent
  );

  return v_result;
end;
$$;

create or replace function public.create_corporate_buyout_priced_atomic(
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
  p_custom_agreed_total_amount numeric,
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
  v_result jsonb;
  v_package public.corporate_buyout_packages%rowtype;
  v_buyout public.corporate_buyouts%rowtype;
  v_booking public.bookings%rowtype;
  v_show public.shows%rowtype;
  v_venue_key text;
  v_base numeric(12,2);
  v_gratuity numeric(12,2);
  v_vat numeric(12,2);
  v_total numeric(12,2);
  v_metadata jsonb;
begin
  select * into v_package from public.corporate_buyout_packages
  where id = p_package_id and active for share;
  if not found then raise exception 'BUYOUT_PACKAGE_NOT_AVAILABLE'; end if;
  select * into v_show from public.shows where id = p_show_id;
  if not found then raise exception 'BUYOUT_SHOW_NOT_FOUND'; end if;
  v_venue_key := case
    when lower(v_show.venue) like '%johannesburg%' or lower(v_show.venue) = 'jhb' then 'johannesburg'
    when lower(v_show.venue) like '%cape town%' or lower(v_show.venue) = 'cpt' then 'cape-town'
    else lower(replace(v_show.venue, ' ', '-'))
  end;
  if v_package.venue_key not in ('all', v_venue_key) then
    raise exception 'BUYOUT_PACKAGE_VENUE_INVALID';
  end if;
  if p_custom_agreed_total_amount is not null and p_custom_agreed_total_amount <= 0 then
    raise exception 'BUYOUT_CUSTOM_PRICE_INVALID';
  end if;

  v_result := public.create_corporate_buyout_atomic(
    p_show_id, p_company_id, p_contact_customer_id, p_package_id,
    p_expected_guest_count, p_final_guest_count, p_additional_guest_rate,
    p_maximum_guest_count, p_quote_valid_until, p_hold_until,
    p_payment_due_at, p_terms_snapshot, p_booking_reference,
    p_idempotency_key, p_authorized_venues, p_actor_auth_user_id,
    p_actor_staff_profile_id, p_actor_name, p_actor_role,
    p_actor_location_scope, p_request_id, p_user_agent
  );

  if coalesce((v_result ->> 'idempotent')::boolean, false) then
    return v_result;
  end if;

  select * into v_buyout from public.corporate_buyouts
  where id = (v_result ->> 'buyoutId')::uuid for update;
  update public.corporate_buyouts set
    package_snapshot = package_snapshot || jsonb_build_object(
      'description', v_package.description,
      'venueKey', v_package.venue_key
    )
  where id = v_buyout.id
  returning * into v_buyout;
  if p_custom_agreed_total_amount is null then
    return v_result;
  end if;

  select * into v_booking from public.bookings
  where id = v_buyout.booking_id for update;

  v_base := round(p_custom_agreed_total_amount * (v_package.base_amount / v_package.total_amount), 2);
  v_gratuity := round(p_custom_agreed_total_amount * (v_package.gratuity_amount / v_package.total_amount), 2);
  v_vat := round(p_custom_agreed_total_amount - v_base - v_gratuity, 2);
  v_total := round(p_custom_agreed_total_amount + v_buyout.commercial_additional_guest_amount, 2);
  v_metadata := case
    when v_booking.notes like '__zingara_booking_meta__:%' then
      substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb
    else '{}'::jsonb
  end || jsonb_build_object(
    'buyoutAgreedPackageTotal', round(p_custom_agreed_total_amount, 2),
    'buyoutCataloguePackageTotal', v_package.total_amount
  );

  update public.bookings set
    service_fee = v_gratuity,
    subtotal_amount = v_base + v_vat + v_buyout.commercial_additional_guest_amount,
    total_amount = v_total,
    balance_outstanding = v_total,
    notes = '__zingara_booking_meta__:' || v_metadata::text,
    updated_at = now()
  where id = v_booking.id;

  update public.corporate_buyouts set
    package_snapshot = package_snapshot || jsonb_build_object(
      'baseAmount', v_base, 'gratuityAmount', v_gratuity,
      'vatAmount', v_vat, 'totalAmount', round(p_custom_agreed_total_amount, 2),
      'catalogueTotalAmount', v_package.total_amount,
      'customAgreedPrice', true, 'description', v_package.description,
      'venueKey', v_package.venue_key
    ),
    terms_snapshot = terms_snapshot || jsonb_build_object(
      'customAgreedTotalAmount', round(p_custom_agreed_total_amount, 2)
    ),
    commercial_base_amount = v_base,
    commercial_gratuity_amount = v_gratuity,
    commercial_vat_amount = v_vat,
    commercial_total_amount = v_total,
    updated_at = now()
  where id = v_buyout.id
  returning * into v_buyout;

  update public.audit_events set
    after_values = after_values || jsonb_build_object(
      'package', v_buyout.package_snapshot,
      'commercial_total_amount', v_total,
      'custom_agreed_price', true
    )
  where action = 'corporate.buyout.created'
    and entity_id = v_buyout.id::text
    and request_id = p_request_id;

  return v_result || jsonb_build_object('totalAmount', v_total);
end;
$$;

revoke all on function public.save_corporate_buyout_package_version_atomic(
  text,text,text,text,numeric,uuid,uuid,text,text,text,text
) from public, anon, authenticated;
revoke all on function public.create_corporate_buyout_priced_atomic(
  uuid,uuid,uuid,uuid,integer,integer,numeric,integer,timestamptz,timestamptz,
  timestamptz,jsonb,text,text,numeric,text[],uuid,uuid,text,text,text[],text,text
) from public, anon, authenticated;
grant execute on function public.save_corporate_buyout_package_version_atomic(
  text,text,text,text,numeric,uuid,uuid,text,text,text,text
) to service_role;
grant execute on function public.create_corporate_buyout_priced_atomic(
  uuid,uuid,uuid,uuid,integer,integer,numeric,integer,timestamptz,timestamptz,
  timestamptz,jsonb,text,text,numeric,text[],uuid,uuid,text,text,text[],text,text
) to service_role;

comment on function public.create_corporate_buyout_priced_atomic is
  'Creates a Buyout atomically and snapshots an optional booking-specific agreed package total without repricing existing bookings.';

create or replace function public.create_booking_balance_payment_link_fee_aware_atomic(
  p_booking_reference text,
  p_token_hash text,
  p_metadata jsonb,
  p_expires_at timestamptz,
  p_created_by uuid,
  p_booking_fee_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_metadata jsonb := '{}'::jsonb;
  v_pricing jsonb := '{}'::jsonb;
  v_fee numeric(10,2) := round(greatest(coalesce(p_booking_fee_amount, 0), 0), 2);
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid;
  v_actor_name text;
  v_actor_scope text[];
  v_actor_role text;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings
  where booking_reference = upper(trim(p_booking_reference)) for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then
      v_metadata := '{}'::jsonb;
    end;
  end if;
  v_pricing := coalesce(v_metadata -> 'pricingProvenance', '{}'::jsonb);

  if v_pricing ->> 'feePolicyVersion' = 'payment-method-v1'
     and round(coalesce((v_pricing ->> 'bookingFeeAmount')::numeric, 0), 2) = 0
     and v_fee > 0 then
    v_pricing := v_pricing || jsonb_build_object(
      'bookingFeeAmount', v_fee,
      'paymentMethod', 'payfast'
    );
    v_metadata := jsonb_set(v_metadata, '{pricingProvenance}', v_pricing, true);
    update public.bookings set
      subtotal_amount = round(coalesce(subtotal_amount, 0) + v_fee, 2),
      total_amount = round(coalesce(total_amount, 0) + v_fee, 2),
      balance_outstanding = greatest(
        round(coalesce(total_amount, 0) + v_fee - coalesce(amount_paid, 0), 2),
        0
      ),
      notes = '__zingara_booking_meta__:' || v_metadata::text,
      updated_at = v_now
    where id = v_booking.id
    returning * into v_booking;

    select staff.id, staff.full_name, staff.venue_scope, role.name
    into v_actor_id, v_actor_name, v_actor_scope, v_actor_role
    from public.staff_profiles staff
    left join public.roles role on role.id = staff.role_id
    where staff.user_id = p_created_by and staff.active
    limit 1;
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, request_id,
      source_area
    ) values (
      'booking.booking-fee-method-updated', p_created_by,
      coalesce(v_actor_scope, '{}'::text[]),
      coalesce(v_actor_name, 'Authorised staff'), coalesce(v_actor_role, 'Staff'),
      v_actor_id,
      jsonb_build_object('bookingFeeAmount', v_fee, 'paymentMethod', 'payfast',
        'totalAmount', v_booking.total_amount),
      jsonb_build_object('bookingFeeAmount', 0, 'paymentMethod', 'eft',
        'totalAmount', round(v_booking.total_amount - v_fee, 2)),
      array['bookingFeeAmount','paymentMethod','totalAmount','balanceOutstanding'],
      v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
      'Configured Booking Fee applied because a PayFast payment link was selected.',
      'payment-link-fee:' || left(p_token_hash, 32),
      'Booking Details · Payment Link'
    );
  end if;

  v_result := public.create_booking_balance_payment_link_atomic(
    p_booking_reference, p_token_hash, p_metadata, p_expires_at, p_created_by
  );
  return v_result;
end;
$$;

create or replace function public.record_manual_eft_payment_fee_aware_atomic(
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
  v_booking public.bookings%rowtype;
  v_metadata jsonb := '{}'::jsonb;
  v_pricing jsonb := '{}'::jsonb;
  v_fee numeric(10,2) := 0;
  v_now timestamptz := clock_timestamp();
  v_expected_updated_at timestamptz := p_expected_updated_at;
  v_actor_name text;
  v_actor_scope text[];
  v_actor_role text;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select * into v_booking from public.bookings
  where booking_reference = upper(trim(p_booking_reference)) for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  if exists (
    select 1 from public.audit_events
    where action = 'booking.payment-recorded'
      and entity_id = v_booking.id::text
      and request_id = trim(p_idempotency_key)
      and outcome = 'success'
  ) then
    return public.record_manual_eft_payment_atomic(
      p_booking_reference, p_expected_updated_at, p_amount_received, p_received_on,
      p_bank_reference, p_evidence_note, p_confirmed, p_idempotency_key,
      p_ticket_code, p_ticket_url, p_actor_staff_profile_id,
      p_actor_auth_user_id, p_user_agent
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then
      v_metadata := '{}'::jsonb;
    end;
  end if;
  v_pricing := coalesce(v_metadata -> 'pricingProvenance', '{}'::jsonb);
  v_fee := round(greatest(coalesce((v_pricing ->> 'bookingFeeAmount')::numeric, 0), 0), 2);

  if v_pricing ->> 'feePolicyVersion' = 'payment-method-v1'
     and v_fee > 0
     and not exists (
       select 1 from public.payments payment
       where payment.booking_id = v_booking.id
         and payment.method::text = 'payfast'
         and payment.payment_status::text in ('deposit_paid', 'fully_paid')
     ) then
    v_pricing := v_pricing || jsonb_build_object(
      'bookingFeeAmount', 0,
      'paymentMethod', 'eft'
    );
    v_metadata := jsonb_set(v_metadata, '{pricingProvenance}', v_pricing, true);
    update public.bookings set
      subtotal_amount = greatest(round(coalesce(subtotal_amount, 0) - v_fee, 2), 0),
      total_amount = greatest(round(coalesce(total_amount, 0) - v_fee, 2), 0),
      balance_outstanding = greatest(
        round(coalesce(total_amount, 0) - v_fee - coalesce(amount_paid, 0), 2),
        0
      ),
      notes = '__zingara_booking_meta__:' || v_metadata::text,
      updated_at = v_now
    where id = v_booking.id
    returning * into v_booking;
    v_expected_updated_at := v_now;

    select staff.full_name, staff.venue_scope, role.name
    into v_actor_name, v_actor_scope, v_actor_role
    from public.staff_profiles staff
    left join public.roles role on role.id = staff.role_id
    where staff.id = p_actor_staff_profile_id
      and staff.user_id = p_actor_auth_user_id
      and staff.active
    limit 1;
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, request_id,
      source_area, user_agent
    ) values (
      'booking.booking-fee-method-updated', p_actor_auth_user_id,
      coalesce(v_actor_scope, '{}'::text[]),
      coalesce(v_actor_name, 'Authorised staff'), coalesce(v_actor_role, 'Staff'),
      p_actor_staff_profile_id,
      jsonb_build_object('bookingFeeAmount', 0, 'paymentMethod', 'eft',
        'totalAmount', v_booking.total_amount),
      jsonb_build_object('bookingFeeAmount', v_fee, 'paymentMethod', 'payfast',
        'totalAmount', round(v_booking.total_amount + v_fee, 2)),
      array['bookingFeeAmount','paymentMethod','totalAmount','balanceOutstanding'],
      v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
      'Configured Booking Fee removed because payment was recorded by EFT.',
      trim(p_idempotency_key) || ':booking-fee',
      'Booking Details · Record Manual EFT', p_user_agent
    );
  end if;

  v_result := public.record_manual_eft_payment_atomic(
    p_booking_reference, v_expected_updated_at, p_amount_received, p_received_on,
    p_bank_reference, p_evidence_note, p_confirmed, p_idempotency_key,
    p_ticket_code, p_ticket_url, p_actor_staff_profile_id,
    p_actor_auth_user_id, p_user_agent
  );
  return v_result;
end;
$$;

revoke all on function public.create_booking_balance_payment_link_fee_aware_atomic(
  text,text,jsonb,timestamptz,uuid,numeric
) from public, anon, authenticated;
grant execute on function public.create_booking_balance_payment_link_fee_aware_atomic(
  text,text,jsonb,timestamptz,uuid,numeric
) to service_role;
revoke all on function public.record_manual_eft_payment_fee_aware_atomic(
  text,timestamptz,numeric,date,text,text,boolean,text,text,text,uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.record_manual_eft_payment_fee_aware_atomic(
  text,timestamptz,numeric,date,text,text,boolean,text,text,text,uuid,uuid,text
) to service_role;

comment on function public.create_booking_balance_payment_link_fee_aware_atomic is
  'Applies the configured fee to new-policy bookings when PayFast is selected, then creates the balance link atomically.';
comment on function public.record_manual_eft_payment_fee_aware_atomic is
  'Removes the configured fee from new-policy bookings without a completed PayFast payment, then records EFT atomically.';
