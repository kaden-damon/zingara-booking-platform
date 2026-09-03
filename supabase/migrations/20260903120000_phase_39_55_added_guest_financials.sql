-- Phase 39.55: preserve the original booking payment basis when guests are
-- added and configure the staff-only Friends & Family rate.

create or replace function public.reconcile_booking_guest_count_financials_atomic(
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
  v_pricing_source text;
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
  if v_booking.guest_count = p_guest_count then raise exception 'GUEST_COUNT_UNCHANGED'; end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null or v_show.status::text <> 'active' then raise exception 'SHOW_NOT_ACTIVE'; end if;

  v_added_guests := greatest(p_guest_count - v_booking.guest_count, 0);
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

  if v_added_guests > 0 then
    if v_metadata ? 'pricingProvenance' then
      v_payment_basis := v_metadata #>> '{pricingProvenance,paymentModel}';
      v_pricing_source := v_metadata #>> '{pricingProvenance,source}';
      v_unit_amount := case
        when v_payment_basis = 'deposit' then nullif(v_metadata #>> '{pricingProvenance,depositPerPerson}', '')::numeric
        when v_payment_basis = 'full' then nullif(v_metadata #>> '{pricingProvenance,agreedPricePerPerson}', '')::numeric
        else null
      end;
    elsif v_booking.booking_origin::text not in ('data_import', 'legacy_unknown') and v_metadata is not null then
      v_payment_basis := v_metadata ->> 'paymentOption';
      v_pricing_source := coalesce(v_metadata ->> 'agreedPriceSource', 'standard-zone');
      v_unit_amount := case
        when v_payment_basis = 'full' then nullif(v_metadata ->> 'pricePerPerson', '')::numeric
        when v_payment_basis = 'deposit'
          and coalesce((v_metadata ->> 'partySize')::integer, 0) > 0
          and coalesce((v_metadata ->> 'depositPercentage')::numeric, 0) > 0
          then round(
            (v_metadata ->> 'totalPrice')::numeric
            * (v_metadata ->> 'depositPercentage')::numeric / 100
            / (v_metadata ->> 'partySize')::integer,
            2
          )
        else null
      end;
    end if;

    if v_payment_basis not in ('deposit', 'full')
       or v_unit_amount is null or v_unit_amount <= 0 then
      raise exception 'ADDED_GUEST_FINANCIAL_BASIS_REQUIRED';
    end if;

    v_additional_amount := round(v_added_guests * v_unit_amount, 2);
    v_new_total := round(v_booking.total_amount + v_additional_amount, 2);
    v_new_subtotal := round(v_booking.subtotal_amount + v_additional_amount, 2);
    v_new_balance := round(v_booking.balance_outstanding + v_additional_amount, 2);
    v_new_payment_status := case
      when v_booking.amount_paid <= 0 then 'pending_payment'::public.payment_status
      when v_new_balance <= 0 then 'fully_paid'::public.payment_status
      else 'deposit_paid'::public.payment_status
    end;
  end if;

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

  if v_metadata is not null then
    v_metadata := jsonb_set(v_metadata, '{partySize}', to_jsonb(p_guest_count), true);
    if v_added_guests > 0 then
      v_metadata := jsonb_set(v_metadata, '{totalPrice}', to_jsonb(v_new_total), true);
      v_metadata := jsonb_set(v_metadata, '{subtotalPrice}', to_jsonb(v_new_subtotal), true);
      v_metadata := jsonb_set(v_metadata, '{balanceDue}', to_jsonb(v_new_balance), true);
      v_metadata := jsonb_set(v_metadata, '{paymentStatus}', to_jsonb(v_new_payment_status::text), true);
      v_metadata := jsonb_set(
        v_metadata,
        '{pricingProvenance}',
        jsonb_build_object(
          'agreedPricePerPerson', coalesce(nullif(v_metadata ->> 'pricePerPerson', '')::numeric, v_unit_amount),
          'authorizedByStaffId', coalesce(v_metadata #>> '{pricingProvenance,authorizedByStaffId}', v_booking.created_by_staff_id::text),
          'depositPerPerson', case when v_payment_basis = 'deposit' then v_unit_amount else coalesce(nullif(v_metadata #>> '{pricingProvenance,depositPerPerson}', '')::numeric, 0) end,
          'paymentModel', v_payment_basis,
          'source', coalesce(v_pricing_source, 'standard-zone')
        ),
        true
      );
    end if;
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
    'booking.guest-count-financial-reconciliation', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('guest_count', p_guest_count, 'total_amount', v_new_total, 'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_new_balance, 'payment_status', v_new_payment_status, 'table_id', case when v_floor_queue then null else v_booking.table_id end, 'added_guests', v_added_guests, 'payment_basis', v_payment_basis, 'unit_amount', v_unit_amount, 'additional_amount', v_additional_amount),
    jsonb_build_object('guest_count', v_booking.guest_count, 'total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding, 'payment_status', v_booking.payment_status, 'table_id', v_booking.table_id),
    case when v_added_guests > 0 then array['guest_count', 'subtotal_amount', 'total_amount', 'balance_outstanding', 'payment_status', 'table_id'] else array['guest_count', 'table_id'] end,
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

revoke all on function public.reconcile_booking_guest_count_financials_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reconcile_booking_guest_count_financials_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) to service_role;

update public.venue_settings
set settings = jsonb_set(
      coalesce(settings, '{}'::jsonb),
      '{operationalSettings,friendsAndFamily}',
      '{"cape-town":{"enabled":true,"ratePerPerson":1150},"johannesburg":{"enabled":true,"ratePerPerson":1150}}'::jsonb,
      true
    ),
    operational_config = jsonb_set(
      coalesce(operational_config, '{}'::jsonb),
      '{operationalSettings,friendsAndFamily}',
      '{"cape-town":{"enabled":true,"ratePerPerson":1150},"johannesburg":{"enabled":true,"ratePerPerson":1150}}'::jsonb,
      true
    ),
    updated_at = now()
where venue_key = 'zingara-cape-town';
