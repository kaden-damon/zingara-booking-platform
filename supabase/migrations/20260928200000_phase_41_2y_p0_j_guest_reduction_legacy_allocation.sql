-- Phase 41.2Y-P0-J: capacity validates positive entitlement deltas, while
-- reviewed imported invoice evidence and retained-value reductions remain
-- atomic, revision-protected and auditable.

alter table public.legacy_booking_payment_evidence
  drop constraint if exists legacy_booking_payment_evidence_source_system_check;
alter table public.legacy_booking_payment_evidence
  add constraint legacy_booking_payment_evidence_source_system_check
  check (source_system in ('dineplan', 'manual_invoice'));

create or replace function public.enforce_booking_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_entitlement integer;
  v_import_exception boolean := false;
  v_import_update_exception boolean := false;
  v_limit integer;
  v_new_contribution integer;
  v_old_contribution integer;
  v_old_was_active boolean;
  v_zone text;
begin
  if new.archived_at is not null
     or new.booking_status::text not in ('new', 'confirmed', 'pending_payment', 'checked_in') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.show_id is not distinct from new.show_id
     and old.section is not distinct from new.section
     and old.zone_entitlements is not distinct from new.zone_entitlements
     and old.guest_count is not distinct from new.guest_count
     and (old.archived_at is null) = (new.archived_at is null)
     and (old.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')) =
         (new.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')) then
    return new;
  end if;

  v_import_exception :=
    tg_op = 'INSERT'
    and current_setting('zingara.historical_dineplan_import', true) = 'active'
    and new.booking_origin = 'data_import'
    and new.booking_source = 'admin'
    and new.table_id is null
    and new.notes like '__zingara_booking_meta__:%';
  v_import_update_exception :=
    tg_op = 'UPDATE'
    and current_setting('zingara.historical_dineplan_update', true) = 'active'
    and current_setting('zingara.historical_dineplan_update_booking_id', true) = new.id::text
    and old.id = new.id
    and old.booking_reference = new.booking_reference
    and old.booking_origin = 'data_import'
    and new.booking_origin = old.booking_origin
    and old.booking_source in ('admin', 'corporate-direct')
    and new.booking_source = old.booking_source
    and old.created_by_staff_id is not distinct from new.created_by_staff_id
    and old.provenance_recorded_at is not distinct from new.provenance_recorded_at
    and old.booking_status = new.booking_status
    and old.archived_at is not distinct from new.archived_at
    and new.notes like '__zingara_booking_meta__:%';
  if v_import_exception or v_import_update_exception then return new; end if;

  if not public.corporate_zone_entitlements_valid(new.zone_entitlements, new.guest_count) then
    raise exception using errcode = '23514', message = 'CORPORATE_ZONE_ENTITLEMENTS_INVALID';
  end if;

  v_old_was_active := tg_op = 'UPDATE'
    and old.show_id = new.show_id
    and old.archived_at is null
    and old.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

  for v_zone in
    select distinct public.normalize_booking_capacity_zone(zone_name)
    from (
      select item ->> 'zoneId' as zone_name
      from jsonb_array_elements(coalesce(new.zone_entitlements, '[]'::jsonb)) item
      union all
      select new.section where new.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_name) is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(new.show_id::text || ':' || v_zone, 0));

    v_new_contribution := public.booking_zone_entitlement_pax(
      new.zone_entitlements, new.section, new.guest_count, v_zone
    );
    v_old_contribution := case
      when v_old_was_active then public.booking_zone_entitlement_pax(
        old.zone_entitlements, old.section, old.guest_count, v_zone
      )
      else 0
    end;

    -- Equal or lower per-zone entitlement cannot worsen capacity. This also
    -- permits incremental recovery when a historical zone is already full.
    if tg_op = 'UPDATE' and v_new_contribution <= v_old_contribution then
      continue;
    end if;

    if tg_op = 'INSERT'
       and new.booking_origin = 'customer_public'
       and new.booking_source = 'online' then
      v_limit := public.booking_capacity_zone_limit(v_zone);
    else
      v_limit := public.booking_capacity_zone_effective_limit(new.show_id, v_zone);
    end if;
    if v_limit is null then continue; end if;

    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_zone
    )), 0)::integer
      into v_existing_entitlement
      from public.bookings b
     where b.show_id = new.show_id
       and b.archived_at is null
       and b.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
       and (tg_op = 'INSERT' or b.id <> new.id);
    if v_existing_entitlement + v_new_contribution > v_limit then
      raise exception using errcode = '23514', message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_zone, v_limit, v_existing_entitlement + v_new_contribution
      );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.reconcile_imported_booking_financials_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_total_amount numeric,
  p_amount_paid numeric,
  p_source_document text,
  p_source_ticket_amount numeric,
  p_source_gratuity_amount numeric,
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
  v_checksum text;
  v_evidence_id uuid;
  v_metadata jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_provider_paid numeric := 0;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
    join public.role_permissions rp on rp.role_id = role.id
    join public.permissions permission on permission.id = rp.permission_id
   where staff.id = p_actor_staff_profile_id
     and staff.user_id = p_actor_auth_user_id
     and staff.active
     and permission.key = 'bookings:reconcile';
  if v_actor_name is null then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if nullif(trim(p_reason), '') is null or nullif(trim(p_source_document), '') is null then
    raise exception 'RECONCILIATION_REASON_REQUIRED';
  end if;
  if p_total_amount <= 0 or p_amount_paid < 0
     or round(p_amount_paid, 2) > round(p_total_amount, 2)
     or p_source_ticket_amount <= 0 or p_source_gratuity_amount < 0
     or round(p_source_ticket_amount + p_source_gratuity_amount, 2) <> round(p_total_amount, 2)
     or round(p_amount_paid, 2) <> round(p_total_amount, 2) then
    raise exception 'FINANCIAL_RECONCILIATION_INVALID';
  end if;

  select * into v_booking from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '') for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if v_booking.archived_at is not null or v_booking.booking_status::text in ('cancelled', 'refunded')
     or v_booking.booking_origin <> 'data_import' then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;
  if exists (select 1 from public.legacy_booking_payment_evidence where booking_id = v_booking.id) then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;
  select coalesce(sum(amount), 0) into v_provider_paid from public.payments
   where booking_id = v_booking.id
     and payment_status::text in ('deposit_paid', 'fully_paid')
     and (provider_transaction_id is not null or provider_gross_amount is not null);
  if round(v_provider_paid, 2) > round(p_amount_paid, 2) then
    raise exception 'AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE';
  end if;

  v_checksum := encode(digest(convert_to(
    v_booking.id::text || '|' || trim(p_source_document) || '|' ||
    round(p_amount_paid, 2)::text || '|' || round(p_source_ticket_amount, 2)::text || '|' ||
    round(p_source_gratuity_amount, 2)::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.legacy_booking_payment_evidence (
    booking_id, source_system, source_document, source_checksum,
    source_row_number, source_row_fingerprint, source_payment_amount,
    source_ticket_amount, full_eft_amount, ticket_gratuity_amount,
    classification_reason, match_basis, reconciliation_note,
    recorded_by_staff_id, recorded_at
  ) values (
    v_booking.id, 'manual_invoice', trim(p_source_document), v_checksum,
    2, v_checksum, round(p_amount_paid, 2), round(p_source_ticket_amount, 2),
    round(p_source_ticket_amount, 2), round(p_source_gratuity_amount, 2),
    trim(p_reason), array['booking_reference', 'invoice_reference', 'staff_review'],
    'Authoritative imported invoice evidence recorded by authorised staff.',
    p_actor_staff_profile_id, v_now
  ) returning id into v_evidence_id;

  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then v_metadata := '{}'::jsonb;
    end;
  else
    v_metadata := '{}'::jsonb;
  end if;
  v_metadata := coalesce(v_metadata, '{}'::jsonb);
  v_metadata := jsonb_set(v_metadata, '{totalPrice}', to_jsonb(round(p_total_amount, 2)), true);
  v_metadata := jsonb_set(v_metadata, '{subtotalPrice}', to_jsonb(round(p_total_amount, 2)), true);
  v_metadata := jsonb_set(v_metadata, '{amountPaid}', to_jsonb(round(p_amount_paid, 2)), true);
  v_metadata := jsonb_set(v_metadata, '{balanceDue}', '0'::jsonb, true);
  v_metadata := jsonb_set(v_metadata, '{paymentStatus}', to_jsonb('fully-paid'::text), true);
  v_metadata := jsonb_set(v_metadata, '{historicalPaymentMethod}', to_jsonb('eft'::text), true);
  v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;

  update public.bookings
     set subtotal_amount = round(p_total_amount, 2), service_fee = 0,
         addons_total = 0, total_amount = round(p_total_amount, 2),
         amount_paid = round(p_amount_paid, 2), balance_outstanding = 0,
         payment_status = 'fully_paid', notes = v_new_notes, updated_at = v_now
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.financial-reconciliation', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('total_amount', round(p_total_amount,2), 'amount_paid', round(p_amount_paid,2), 'balance_outstanding', 0, 'payment_status', 'fully_paid', 'legacy_evidence_id', v_evidence_id, 'source_document', trim(p_source_document), 'source_ticket_amount', round(p_source_ticket_amount,2), 'source_gratuity_amount', round(p_source_gratuity_amount,2)),
    jsonb_build_object('total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid, 'balance_outstanding', v_booking.balance_outstanding, 'payment_status', v_booking.payment_status),
    array['subtotal_amount','total_amount','amount_paid','balance_outstanding','payment_status','notes'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success', trim(p_reason),
    p_request_id, 'Bookings', p_user_agent
  );
  return jsonb_build_object('booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference, 'total_amount', round(p_total_amount,2), 'amount_paid', round(p_amount_paid,2), 'balance_outstanding', 0, 'payment_status', 'fully_paid', 'updated_at', v_now);
end;
$$;

create or replace function public.reconcile_paid_booking_guest_reduction_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_guest_count integer,
  p_transfer_released_value_to_bar_tab boolean,
  p_transfer_gratuity_to_bar_tab boolean,
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
  v_allocation jsonb;
  v_bar_tab numeric;
  v_booking public.bookings%rowtype;
  v_evidence public.legacy_booking_payment_evidence%rowtype;
  v_floor_queue boolean := false;
  v_gratuity numeric;
  v_metadata jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_released numeric;
  v_table public.show_tables%rowtype;
  v_table_code text;
  v_ticket_amount numeric;
  v_unit numeric;
begin
  select staff.venue_scope, staff.full_name, role.name
    into v_actor_location_scope, v_actor_name, v_actor_role
    from public.staff_profiles staff
    join public.roles role on role.id = staff.role_id
    join public.role_permissions rp on rp.role_id = role.id
    join public.permissions permission on permission.id = rp.permission_id
   where staff.id = p_actor_staff_profile_id and staff.user_id = p_actor_auth_user_id
     and staff.active and permission.key = 'bookings:reconcile';
  if v_actor_name is null then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;

  select * into v_booking from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '') for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  -- A retry with the same operation identity returns the committed result.
  select after_values into v_allocation from public.audit_events
   where action = 'booking.paid-guest-reduction'
     and entity_reference = v_booking.booking_reference
     and request_id = p_request_id and outcome = 'success'
   order by created_at desc limit 1;
  if v_allocation is not null then return v_allocation; end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if v_booking.archived_at is not null or v_booking.booking_status::text not in ('new','confirmed','pending_payment')
     or v_booking.booking_origin <> 'data_import' or v_booking.payment_status::text <> 'fully_paid'
     or round(v_booking.amount_paid,2) <> round(v_booking.total_amount,2) then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;
  if p_guest_count is null or p_guest_count <= 0 or p_guest_count >= v_booking.guest_count then
    raise exception 'GUEST_COUNT_REDUCTION_REQUIRED';
  end if;
  if not p_transfer_released_value_to_bar_tab or not p_transfer_gratuity_to_bar_tab then
    raise exception 'RETAINED_VALUE_ALLOCATION_REQUIRED';
  end if;

  select * into v_evidence from public.legacy_booking_payment_evidence
   where booking_id = v_booking.id and source_system = 'manual_invoice';
  if v_evidence.id is null then raise exception 'LEGACY_FINANCIAL_EVIDENCE_REQUIRED'; end if;
  v_unit := round(v_evidence.source_ticket_amount / v_booking.guest_count, 2);
  if v_unit <= 0 or round(v_unit * v_booking.guest_count,2) <> round(v_evidence.source_ticket_amount,2) then
    raise exception 'LEGACY_TICKET_RATE_INVALID';
  end if;
  v_ticket_amount := round(v_unit * p_guest_count, 2);
  v_released := round(v_evidence.source_ticket_amount - v_ticket_amount, 2);
  v_gratuity := round(v_evidence.ticket_gratuity_amount, 2);
  v_bar_tab := round(v_evidence.bar_tab_paid_amount + v_released + v_gratuity, 2);
  if round(v_ticket_amount + v_bar_tab + v_evidence.bar_gratuity_amount, 2) <> round(v_booking.total_amount, 2) then
    raise exception 'RETAINED_VALUE_ALLOCATION_MISMATCH';
  end if;

  if v_booking.table_id is not null then
    select * into v_table from public.show_tables where id = v_booking.table_id for update;
    if v_table.id is null or v_table.show_id <> v_booking.show_id
       or v_table.booking_id is distinct from v_booking.id
       or not v_table.capacity_configured or v_table.capacity is null then
      raise exception 'BOOKING_TABLE_STATE_INVALID';
    end if;
    v_table_code := v_table.table_code;
    if v_table.capacity < p_guest_count then
      update public.show_tables set booking_id = null,
        status = case when capacity_configured then 'available'::public.table_status else 'disabled'::public.table_status end,
        updated_at = v_now where booking_id = v_booking.id;
      v_floor_queue := true;
    end if;
  else v_floor_queue := true;
  end if;

  begin
    v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
  exception when others then v_metadata := '{}'::jsonb;
  end;
  v_metadata := coalesce(v_metadata, '{}'::jsonb);
  v_allocation := jsonb_build_object(
    'ticketAmount', v_ticket_amount, 'barTabAmount', v_bar_tab,
    'ticketGratuityAmount', 0, 'paymentMethod', 'eft',
    'releasedTicketValue', v_released, 'gratuityTransferred', v_gratuity,
    'originalTicketAmount', v_evidence.source_ticket_amount,
    'sourceEvidenceId', v_evidence.id, 'recordedAt', v_now,
    'recordedByStaffId', p_actor_staff_profile_id
  );
  v_metadata := jsonb_set(v_metadata, '{partySize}', to_jsonb(p_guest_count), true);
  v_metadata := jsonb_set(v_metadata, '{valueAllocation}', v_allocation, true);
  if jsonb_typeof(v_metadata -> 'guestTickets') = 'array' then
    v_metadata := jsonb_set(v_metadata, '{guestTickets}', coalesce((
      select jsonb_agg(jsonb_set(ticket, '{total}', to_jsonb(p_guest_count), true))
      from jsonb_array_elements(v_metadata -> 'guestTickets') ticket
      where coalesce((ticket ->> 'index')::integer, 1) <= p_guest_count
    ), '[]'::jsonb), true);
  end if;
  if v_floor_queue then
    v_metadata := jsonb_set(v_metadata, '{tableId}', to_jsonb('requires-floor-assignment'::text), true);
    v_metadata := jsonb_set(v_metadata, '{tableNumber}', to_jsonb('Requires floor assignment'::text), true);
  end if;
  v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;

  update public.bookings set guest_count = p_guest_count,
    table_id = case when v_floor_queue then null else v_booking.table_id end,
    notes = v_new_notes, updated_at = v_now where id = v_booking.id;

  v_allocation := jsonb_build_object(
    'booking_id', v_booking.id, 'booking_reference', v_booking.booking_reference,
    'guest_count', p_guest_count, 'previous_guest_count', v_booking.guest_count,
    'ticket_amount', v_ticket_amount, 'released_ticket_value', v_released,
    'gratuity_transferred', v_gratuity, 'bar_tab_amount', v_bar_tab,
    'total_amount', v_booking.total_amount, 'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_booking.balance_outstanding,
    'table_id', case when v_floor_queue then null else v_booking.table_id end,
    'table_code', case when v_floor_queue then null else v_table_code end,
    'floor_assignment_required', v_floor_queue, 'updated_at', v_now
  );
  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.paid-guest-reduction', p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]), v_actor_name, v_actor_role,
    p_actor_staff_profile_id, v_allocation,
    jsonb_build_object('guest_count',v_booking.guest_count,'ticket_amount',v_evidence.source_ticket_amount,'ticket_gratuity_amount',v_gratuity,'bar_tab_amount',v_evidence.bar_tab_paid_amount,'total_amount',v_booking.total_amount,'amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,'table_id',v_booking.table_id),
    array['guest_count','notes','table_id'], v_booking.id::text,
    v_booking.booking_reference, 'booking', 'success', trim(p_reason),
    p_request_id, 'Bookings', p_user_agent
  );
  return v_allocation;
end;
$$;

revoke all on function public.reconcile_imported_booking_financials_atomic(
  text,timestamptz,numeric,numeric,text,numeric,numeric,text,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.reconcile_imported_booking_financials_atomic(
  text,timestamptz,numeric,numeric,text,numeric,numeric,text,uuid,uuid,text,text
) to service_role;

revoke all on function public.reconcile_paid_booking_guest_reduction_atomic(
  text,timestamptz,integer,boolean,boolean,text,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.reconcile_paid_booking_guest_reduction_atomic(
  text,timestamptz,integer,boolean,boolean,text,uuid,uuid,text,text
) to service_role;
