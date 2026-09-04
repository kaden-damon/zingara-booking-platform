-- Phase 39.71A: provide a separate, service-role-only atomic path for a
-- manager-authorised increase when an imported booking has no authoritative
-- pricing basis. The automatic Phase 39.55/39.71 path remains unchanged.

create or replace function public.reconcile_legacy_booking_guest_count_financials_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_guest_count integer,
  p_reason text,
  p_payment_basis text,
  p_unit_amount numeric,
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
  v_added_guests integer;
  v_additional_amount numeric := 0;
  v_booking public.bookings%rowtype;
  v_floor_queue boolean := false;
  v_metadata jsonb;
  v_new_balance numeric;
  v_new_notes text;
  v_new_payment_status public.payment_status;
  v_new_subtotal numeric;
  v_new_total numeric;
  v_now timestamptz := clock_timestamp();
  v_payment_basis text;
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
  v_table_code text;
  v_unit_amount numeric;
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
  if nullif(trim(p_reason), '') is null then raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;
  if p_guest_count is null or p_guest_count <= 0 then raise exception 'GUEST_COUNT_INVALID'; end if;
  if p_payment_basis not in ('deposit', 'full') then raise exception 'LEGACY_PAYMENT_BASIS_INVALID'; end if;
  if p_unit_amount is null or p_unit_amount <= 0 then raise exception 'LEGACY_UNIT_AMOUNT_INVALID'; end if;

  select * into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;

  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;
  if p_guest_count <= v_booking.guest_count then raise exception 'LEGACY_INCREASE_REQUIRED'; end if;
  if v_booking.booking_origin::text not in ('data_import', 'legacy_unknown') then
    raise exception 'LEGACY_MANUAL_BASIS_NOT_ALLOWED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if v_show.status::text <> 'active' then raise exception 'SHOW_NOT_ACTIVE'; end if;

  v_added_guests := p_guest_count - v_booking.guest_count;
  v_new_total := v_booking.total_amount;
  v_new_subtotal := v_booking.subtotal_amount;
  v_new_balance := v_booking.balance_outstanding;
  v_new_payment_status := v_booking.payment_status;
  v_new_notes := v_booking.notes;

  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then
      v_metadata := null;
    end;
  end if;

  if v_metadata is not null and (
    (
      v_metadata #>> '{pricingProvenance,paymentModel}' = 'full'
      and case
        when jsonb_typeof(v_metadata #> '{pricingProvenance,agreedPricePerPerson}') = 'number'
          then (v_metadata #>> '{pricingProvenance,agreedPricePerPerson}')::numeric
        else 0
      end > 0
    )
    or (
      v_metadata #>> '{pricingProvenance,paymentModel}' = 'deposit'
      and case
        when jsonb_typeof(v_metadata #> '{pricingProvenance,depositPerPerson}') = 'number'
          then (v_metadata #>> '{pricingProvenance,depositPerPerson}')::numeric
        else 0
      end > 0
    )
  ) then
    raise exception 'LEGACY_MANUAL_BASIS_NOT_ALLOWED';
  end if;

  v_payment_basis := p_payment_basis;
  v_unit_amount := round(p_unit_amount, 2);
  v_additional_amount := round(v_added_guests * v_unit_amount, 2);
  v_new_total := round(v_booking.total_amount + v_additional_amount, 2);
  v_new_subtotal := round(v_booking.subtotal_amount + v_additional_amount, 2);
  v_new_balance := greatest(round(v_new_total - v_booking.amount_paid, 2), 0);
  v_new_payment_status := case
    when v_booking.amount_paid <= 0 then 'pending_payment'::public.payment_status
    when v_new_balance <= 0 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status
  end;

  if v_booking.table_id is not null then
    select * into v_table from public.show_tables where id = v_booking.table_id for update;
    if v_table.id is null
       or v_table.show_id <> v_booking.show_id
       or v_table.booking_id is distinct from v_booking.id
       or public.normalize_booking_capacity_zone(v_table.section)
          is distinct from public.normalize_booking_capacity_zone(v_booking.section)
       or not v_table.capacity_configured or v_table.capacity is null then
      raise exception 'BOOKING_TABLE_STATE_INVALID';
    end if;
    v_table_code := v_table.table_code;
    if v_table.capacity < p_guest_count then
      update public.show_tables
         set booking_id = null,
             status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
             updated_at = v_now
       where booking_id = v_booking.id;
      v_floor_queue := true;
    end if;
  else
    v_floor_queue := true;
  end if;

  if v_metadata is null then
    v_metadata := jsonb_build_object('legacyOriginalNotes', v_booking.notes);
  end if;

  if v_metadata is not null then
    v_metadata := jsonb_set(v_metadata, '{partySize}', to_jsonb(p_guest_count), true);
    v_metadata := jsonb_set(v_metadata, '{totalPrice}', to_jsonb(v_new_total), true);
    v_metadata := jsonb_set(v_metadata, '{subtotalPrice}', to_jsonb(v_new_subtotal), true);
    v_metadata := jsonb_set(v_metadata, '{balanceDue}', to_jsonb(v_new_balance), true);
    v_metadata := jsonb_set(v_metadata, '{paymentStatus}', to_jsonb(v_new_payment_status::text), true);
    v_metadata := jsonb_set(
      v_metadata,
      '{legacyGuestIncreaseAdjustments}',
      coalesce(v_metadata -> 'legacyGuestIncreaseAdjustments', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'addedGuests', v_added_guests,
          'additionalObligation', v_additional_amount,
          'authorizedByStaffId', p_actor_staff_profile_id,
          'newGuestCount', p_guest_count,
          'paymentBasis', v_payment_basis,
          'previousGuestCount', v_booking.guest_count,
          'recordedAt', v_now,
          'source', 'staff-authorized-legacy-reconciliation',
          'unitAmount', v_unit_amount
        )),
      true
    );
    if v_floor_queue then
      v_metadata := jsonb_set(v_metadata, '{tableId}', to_jsonb('requires-floor-assignment'::text), true);
      v_metadata := jsonb_set(v_metadata, '{tableNumber}', to_jsonb('Requires floor assignment'::text), true);
    end if;
    if jsonb_typeof(v_metadata -> 'guestTickets') = 'array' then
      v_metadata := jsonb_set(
        v_metadata,
        '{guestTickets}',
        coalesce((
          select jsonb_agg(jsonb_set(ticket, '{total}', to_jsonb(p_guest_count), true))
          from jsonb_array_elements(v_metadata -> 'guestTickets') ticket
          where coalesce((ticket ->> 'index')::integer, 1) <= p_guest_count
        ), '[]'::jsonb),
        true
      );
    end if;
    v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;
  end if;

  update public.bookings
     set guest_count = p_guest_count,
         table_id = case when v_floor_queue then null else v_booking.table_id end,
         subtotal_amount = v_new_subtotal,
         total_amount = v_new_total,
         balance_outstanding = v_new_balance,
         payment_status = v_new_payment_status,
         notes = v_new_notes,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.legacy-guest-increase-reconciliation', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('guest_count', p_guest_count, 'total_amount', v_new_total, 'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_new_balance, 'payment_status', v_new_payment_status, 'table_id', case when v_floor_queue then null else v_booking.table_id end, 'added_guests', v_added_guests, 'payment_basis', v_payment_basis, 'unit_amount', v_unit_amount, 'additional_amount', v_additional_amount, 'pricing_source', 'staff-authorized-legacy-reconciliation'),
    jsonb_build_object('guest_count', v_booking.guest_count, 'total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding, 'payment_status', v_booking.payment_status, 'table_id', v_booking.table_id),
    array['guest_count', 'subtotal_amount', 'total_amount', 'balance_outstanding', 'payment_status', 'table_id'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success', trim(p_reason),
    p_request_id, 'Bookings', p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
    'guest_count', p_guest_count, 'previous_guest_count', v_booking.guest_count,
    'added_guests', v_added_guests, 'payment_basis', v_payment_basis,
    'unit_amount', v_unit_amount, 'additional_amount', v_additional_amount,
    'total_amount', v_new_total, 'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_new_balance, 'payment_status', v_new_payment_status,
    'table_id', case when v_floor_queue then null else v_booking.table_id end,
    'table_code', case when v_floor_queue then null else v_table_code end,
    'floor_assignment_required', v_floor_queue, 'updated_at', v_now
  );
end;
$$;

revoke all on function public.reconcile_legacy_booking_guest_count_financials_atomic(
  text, timestamptz, integer, text, text, numeric, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reconcile_legacy_booking_guest_count_financials_atomic(
  text, timestamptz, integer, text, text, numeric, uuid, uuid, text, text
) to service_role;
