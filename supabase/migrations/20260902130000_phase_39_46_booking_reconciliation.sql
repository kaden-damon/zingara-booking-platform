-- Phase 39.46: narrowly scoped, audited financial and guest-count
-- reconciliation for explicitly authorised operational roles.

insert into public.permissions (key, description)
values (
  'bookings:reconcile',
  'Reconcile booking financial summaries and guest counts.'
)
on conflict (key) do update
set description = excluded.description;

insert into public.roles (name, description)
values (
  'Box Office Manager',
  'Controlled booking reconciliation and box office management access.'
)
on conflict (name) do update
set description = excluded.description,
    updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.name in ('Super Admin', 'Box Office Manager')
  and permission.key = 'bookings:reconcile'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.name = 'Box Office Manager'
  and permission.key in (
    'bookings:manage',
    'communications:manage',
    'crm:read',
    'tickets:validate',
    'waitlist:manage'
  )
on conflict (role_id, permission_id) do nothing;

create or replace function public.reconcile_booking_financials_atomic(
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
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_booking public.bookings%rowtype;
  v_legacy_paid numeric := 0;
  v_new_balance numeric;
  v_new_payment_status public.payment_status;
  v_new_subtotal numeric;
  v_now timestamptz := clock_timestamp();
  v_provider_paid numeric := 0;
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

  if v_actor_name is null then
    raise exception 'RECONCILIATION_PERMISSION_REQUIRED';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'RECONCILIATION_REASON_REQUIRED';
  end if;

  if p_total_amount is null or p_total_amount <= 0
     or p_amount_paid is null or p_amount_paid < 0
     or round(p_amount_paid, 2) > round(p_total_amount, 2) then
    raise exception 'FINANCIAL_RECONCILIATION_INVALID';
  end if;

  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded')
     or v_booking.payment_status::text in ('cancelled', 'comp_vip', 'refunded') then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;

  select coalesce(sum(amount), 0)
    into v_provider_paid
    from public.payments
   where booking_id = v_booking.id
     and payment_status::text in ('deposit_paid', 'fully_paid')
     and (provider_transaction_id is not null or provider_gross_amount is not null);

  select coalesce(sum(
    coalesce(full_card_amount, 0)
    + coalesce(pre_paid_card_amount, 0)
    + coalesce(pre_paid_eft_amount, 0)
    + coalesce(full_eft_amount, 0)
  ), 0)
    into v_legacy_paid
    from public.legacy_booking_payment_evidence
   where booking_id = v_booking.id;

  if round(p_amount_paid, 2) < greatest(round(v_provider_paid, 2), round(v_legacy_paid, 2)) then
    raise exception 'AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE';
  end if;

  v_new_balance := round(p_total_amount - p_amount_paid, 2);
  v_new_payment_status := case
    when round(p_amount_paid, 2) <= 0 then 'pending_payment'::public.payment_status
    when v_new_balance <= 0 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status
  end;
  v_new_subtotal := round(
    v_booking.subtotal_amount + (p_total_amount - v_booking.total_amount),
    2
  );

  if v_new_subtotal < 0 then
    raise exception 'FINANCIAL_RECONCILIATION_INVALID';
  end if;

  if round(v_booking.total_amount, 2) = round(p_total_amount, 2)
     and round(v_booking.amount_paid, 2) = round(p_amount_paid, 2) then
    raise exception 'FINANCIAL_RECONCILIATION_UNCHANGED';
  end if;

  update public.bookings
     set subtotal_amount = v_new_subtotal,
         total_amount = round(p_total_amount, 2),
         amount_paid = round(p_amount_paid, 2),
         balance_outstanding = v_new_balance,
         payment_status = v_new_payment_status,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.financial-reconciliation',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'subtotal_amount', v_new_subtotal,
      'total_amount', round(p_total_amount, 2),
      'amount_paid', round(p_amount_paid, 2),
      'balance_outstanding', v_new_balance,
      'payment_status', v_new_payment_status
    ),
    jsonb_build_object(
      'subtotal_amount', v_booking.subtotal_amount,
      'total_amount', v_booking.total_amount,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'payment_status', v_booking.payment_status
    ),
    array['subtotal_amount', 'total_amount', 'amount_paid', 'balance_outstanding', 'payment_status'],
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    trim(p_reason),
    p_request_id,
    'Bookings',
    p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'total_amount', round(p_total_amount, 2),
    'amount_paid', round(p_amount_paid, 2),
    'balance_outstanding', v_new_balance,
    'payment_status', v_new_payment_status,
    'updated_at', v_now
  );
end;
$$;

create or replace function public.reconcile_booking_guest_count_atomic(
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
  v_floor_queue boolean := false;
  v_metadata jsonb;
  v_new_notes text;
  v_now timestamptz := clock_timestamp();
  v_show public.shows%rowtype;
  v_table public.show_tables%rowtype;
  v_table_code text;
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

  if v_actor_name is null then
    raise exception 'RECONCILIATION_PERMISSION_REQUIRED';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'RECONCILIATION_REASON_REQUIRED';
  end if;

  if p_guest_count is null or p_guest_count <= 0 then
    raise exception 'GUEST_COUNT_INVALID';
  end if;

  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status::text not in ('new', 'confirmed', 'pending_payment') then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED';
  end if;

  if v_booking.guest_count = p_guest_count then
    raise exception 'GUEST_COUNT_UNCHANGED';
  end if;

  select * into v_show from public.shows where id = v_booking.show_id;
  if v_show.id is null or v_show.status::text <> 'active' then
    raise exception 'SHOW_NOT_ACTIVE';
  end if;

  if v_booking.table_id is not null then
    select *
      into v_table
      from public.show_tables
     where id = v_booking.table_id
     for update;

    if v_table.id is null
       or v_table.show_id <> v_booking.show_id
       or v_table.booking_id is distinct from v_booking.id
       or public.normalize_booking_capacity_zone(v_table.section)
          is distinct from public.normalize_booking_capacity_zone(v_booking.section)
       or not v_table.capacity_configured
       or v_table.capacity is null then
      raise exception 'BOOKING_TABLE_STATE_INVALID';
    end if;

    v_table_code := v_table.table_code;
    if v_table.capacity < p_guest_count then
      update public.show_tables
         set booking_id = null,
             status = case
               when capacity_configured then 'available'::public.table_status
               else 'disabled'::public.table_status
             end,
             updated_at = v_now
       where booking_id = v_booking.id;
      v_floor_queue := true;
    end if;
  else
    v_floor_queue := true;
  end if;

  v_new_notes := v_booking.notes;
  if v_booking.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata, '{partySize}', to_jsonb(p_guest_count), true);
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
    exception when others then
      v_new_notes := v_booking.notes;
    end;
  end if;

  update public.bookings
     set guest_count = p_guest_count,
         table_id = case when v_floor_queue then null else v_booking.table_id end,
         notes = v_new_notes,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'booking.guest-count-reconciliation',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'guest_count', p_guest_count,
      'section', v_booking.section,
      'table_id', case when v_floor_queue then null else v_booking.table_id end,
      'table_code', case when v_floor_queue then null else v_table_code end,
      'floor_assignment_required', v_floor_queue
    ),
    jsonb_build_object(
      'guest_count', v_booking.guest_count,
      'section', v_booking.section,
      'table_id', v_booking.table_id,
      'table_code', v_table_code,
      'floor_assignment_required', v_booking.table_id is null
    ),
    case
      when v_floor_queue and v_booking.table_id is not null then array['guest_count', 'table_id']
      else array['guest_count']
    end,
    v_booking.id::text,
    v_booking.booking_reference,
    'booking',
    'success',
    trim(p_reason),
    p_request_id,
    'Bookings',
    p_user_agent
  );

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'guest_count', p_guest_count,
    'previous_guest_count', v_booking.guest_count,
    'table_id', case when v_floor_queue then null else v_booking.table_id end,
    'table_code', case when v_floor_queue then null else v_table_code end,
    'floor_assignment_required', v_floor_queue,
    'total_amount', v_booking.total_amount,
    'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_booking.balance_outstanding,
    'updated_at', v_now
  );
end;
$$;

revoke all on function public.reconcile_booking_financials_atomic(
  text, timestamptz, numeric, numeric, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reconcile_booking_financials_atomic(
  text, timestamptz, numeric, numeric, text, uuid, uuid, text, text
) to service_role;

revoke all on function public.reconcile_booking_guest_count_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.reconcile_booking_guest_count_atomic(
  text, timestamptz, integer, text, uuid, uuid, text, text
) to service_role;
