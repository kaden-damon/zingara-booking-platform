-- Recovery demand must not reactivate dormant legacy adjustment evidence and
-- thereby appear to increase approved seats. Keep it in active demand totals,
-- but not in the historical excess used to calculate protected legacy capacity.
-- Patch only the existing expression; fail closed on an unexpected definition.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.booking_capacity_zone_state(uuid,text,uuid)'::regprocedure);
  v_anchor text := E'booking_totals.active_entitlement_pax -\n            capacity_context.base_capacity -';
  v_replacement text := $expression$booking_totals.active_entitlement_pax -
            coalesce((
              select public.booking_zone_entitlement_pax(
                recovered.zone_entitlements,recovered.section,recovered.guest_count,capacity_context.zone)
              from public.bookings recovered
              where p_show_id='b9fc70ed-ae1a-44e8-af54-fd4f9b038127'::uuid
                and capacity_context.zone='golden-circle'
                and recovered.id='903ca00a-0e97-4a4a-a102-d13a17dcc619'::uuid
                and recovered.show_id=p_show_id
                and recovered.archived_at is null
                and recovered.booking_status::text in ('new','confirmed','pending_payment','checked_in')
                and exists (select 1 from public.audit_events approval
                  where approval.entity_id=recovered.id::text
                    and approval.action='booking.paid-checkout-queue-recovery-authorised'
                    and approval.request_id='authorised-X94SUT-queue-recovery-20261123'
                    and approval.outcome='success')
            ),0) -
            capacity_context.base_capacity -$expression$;
begin
  if position(v_replacement in v_definition)>0 then return; end if;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
    raise exception 'PAID_CHECKOUT_RECOVERY_CAPACITY_DEFINITION_CHANGED';
  end if;
  execute replace(v_definition,v_anchor,v_replacement);
end;
$migration$;

-- One expressly authorised recovery, not reusable sellable capacity or a general
-- reinstatement override. All ordinary capacity logic below remains unchanged.
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
  if tg_op = 'UPDATE'
     and old.id = '903ca00a-0e97-4a4a-a102-d13a17dcc619'::uuid
     and old.booking_reference = 'ZNG-X94SUT'
     and old.booking_status::text = 'cancelled'
     and old.archive_reason = 'Public payment hold expired'
     and old.archived_at is not null
     and new.booking_status::text = 'confirmed'
     and new.archived_at is null and new.archive_reason is null
     and new.table_id is null and old.table_id is null
     and old.payment_status::text = 'fully_paid'
     and old.amount_paid = 6160 and old.total_amount = 6160
     and old.balance_outstanding = 0 and old.guest_count = 4
     and old.show_id = 'b9fc70ed-ae1a-44e8-af54-fd4f9b038127'::uuid
     and public.normalize_booking_capacity_zone(old.section) = 'golden-circle'
     and (to_jsonb(old) - array['booking_status','archived_at','archive_reason','notes','updated_at']) =
         (to_jsonb(new) - array['booking_status','archived_at','archive_reason','notes','updated_at'])
     and exists (
       select 1 from public.audit_events approval
       where approval.entity_id = old.id::text
         and approval.action = 'booking.paid-checkout-queue-recovery-authorised'
         and approval.request_id = 'authorised-X94SUT-queue-recovery-20261123'
         and approval.outcome = 'success'
         and approval.after_values ->> 'transaction_id' = txid_current()::text
         and (approval.before_values ->> 'updated_at')::timestamptz = old.updated_at
     ) then
    return new;
  end if;

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
      ) else 0 end;
    if tg_op = 'UPDATE' and v_new_contribution <= v_old_contribution then continue; end if;
    if tg_op = 'INSERT'
       and new.booking_origin = 'customer_public' and new.booking_source = 'online' then
      v_limit := public.booking_capacity_zone_limit(v_zone);
    else
      v_limit := public.booking_capacity_zone_effective_limit(new.show_id, v_zone);
    end if;
    if v_limit is null then continue; end if;
    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_zone
    )), 0)::integer into v_existing_entitlement
    from public.bookings b
    where b.show_id = new.show_id and b.archived_at is null
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

create or replace function public.recover_authorised_paid_checkout_queue_atomic(
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_before_capacity record;
  v_after_capacity record;
  v_metadata jsonb;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
  v_request text := 'authorised-X94SUT-queue-recovery-20261123';
begin
  perform pg_advisory_xact_lock(hashtext('ZNG-X94SUT'));
  select * into v_booking from public.bookings
  where id = '903ca00a-0e97-4a4a-a102-d13a17dcc619'::uuid
    and booking_reference = 'ZNG-X94SUT' for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select after_values into v_result from public.audit_events
  where entity_id = v_booking.id::text and action = 'booking.paid-checkout-queue-recovered'
    and request_id = v_request and outcome = 'success' limit 1;
  if v_result is not null then
    if v_booking.booking_status::text <> 'confirmed' or v_booking.archived_at is not null
       or v_booking.payment_status::text <> 'fully_paid'
       or (select count(*) from public.tickets where booking_id=v_booking.id
         and ticket_status::text='valid') <> 4 then
      raise exception 'RECOVERY_ALREADY_PROCESSED_STATE_CHANGED';
    end if;
    return v_result || '{"idempotent":true}'::jsonb;
  end if;
  if p_expected_updated_at is null or v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if exists (select 1 from public.booking_edit_locks
    where booking_reference = v_booking.booking_reference and released_at is null
      and last_activity_at > clock_timestamp() - interval '5 minutes') then
    raise exception 'BOOKING_EDIT_LOCK_ACTIVE';
  end if;
  if v_booking.booking_status::text <> 'cancelled'
     or v_booking.archived_at is null or v_booking.archive_reason <> 'Public payment hold expired'
     or v_booking.booking_origin <> 'customer_public' or v_booking.booking_source <> 'online'
     or v_booking.public_checkout_expired_at is null
     or v_booking.public_checkout_superseded_by is not null
     or v_booking.table_id is not null or v_booking.guest_count <> 4
     or v_booking.zone_entitlements is not null
     or public.normalize_booking_capacity_zone(v_booking.section) <> 'golden-circle'
     or v_booking.show_id <> 'b9fc70ed-ae1a-44e8-af54-fd4f9b038127'::uuid
     or v_booking.total_amount <> 6160 or v_booking.amount_paid <> 6160
     or v_booking.balance_outstanding <> 0 or v_booking.payment_status::text <> 'fully_paid'
     or v_booking.notes not like '__zingara_booking_meta__:%' then
    raise exception 'PAID_CHECKOUT_QUEUE_RECOVERY_NOT_ELIGIBLE';
  end if;
  if not exists (select 1 from public.audit_events
    where entity_id = v_booking.id::text and action = 'public_checkout.hold.expired'
      and outcome = 'success' and actor_name = 'SYSTEM'
      and before_values ->> 'booking_status' = 'pending_payment'
      and after_values ->> 'booking_status' = 'cancelled')
    or not exists (select 1 from public.audit_events
      where entity_id = v_booking.id::text and action = 'public_booking.late-payment-review-required'
        and outcome = 'blocked')
    or exists (select 1 from public.audit_events
      where entity_id = v_booking.id::text and action = 'booking.cancel' and outcome = 'success') then
    raise exception 'PAID_CHECKOUT_RECOVERY_HISTORY_REQUIRED';
  end if;
  if (select count(*) from public.payments p where p.booking_id = v_booking.id
      and p.payment_status::text in ('deposit_paid','fully_paid')) <> 1
    or not exists (select 1 from public.payments p where p.booking_id = v_booking.id
      and p.provider_transaction_id = '341736879' and p.amount = 6160
      and p.payment_status::text = 'fully_paid'
      and not exists (select 1 from public.manual_payment_reversals r where r.payment_id = p.id))
    or exists (select 1 from public.payment_refunds where booking_id = v_booking.id)
    or exists (select 1 from public.tickets where booking_id = v_booking.id)
    or exists (select 1 from public.communications where booking_id = v_booking.id)
    or exists (select 1 from public.show_tables where booking_id = v_booking.id)
    or exists (select 1 from public.bookings sibling where sibling.id <> v_booking.id
      and sibling.show_id = v_booking.show_id and sibling.customer_id = v_booking.customer_id
      and sibling.public_checkout_journey_id = v_booking.public_checkout_journey_id
      and sibling.archived_at is null) then
    raise exception 'PAID_CHECKOUT_RECOVERY_EVIDENCE_CONFLICT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.show_id::text || ':golden-circle', 0));
  select * into v_before_capacity from public.booking_capacity_zone_state(v_booking.show_id,'golden-circle');
  if v_before_capacity.effective_operational_capacity <> 149
     or v_before_capacity.active_entitlement_pax <> 149 then
    raise exception 'PAID_CHECKOUT_RECOVERY_CAPACITY_CHANGED';
  end if;

  v_metadata := substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb;
  if jsonb_typeof(v_metadata) is distinct from 'object' or v_metadata ? 'guestTickets' then
    raise exception 'PAID_CHECKOUT_RECOVERY_TICKET_METADATA_CONFLICT';
  end if;
  v_metadata := v_metadata || jsonb_build_object(
    'status','confirmed','partySize',4,'tableId','requires-floor-assignment',
    'tableNumber','Requires floor assignment','reservationTableClaims','[]'::jsonb,
    'guestTickets',(select jsonb_agg(jsonb_build_object(
      'id',v_booking.booking_reference || '-' || i,'index',i,'total',4,
      'fullName','Guest ' || i,'email','','mobile','','status','valid',
      'ticketCode',v_booking.booking_reference || '-' || lpad(i::text,2,'0')) order by i)
      from generate_series(1,4) i));
  insert into public.audit_events(action,actor_name,entity_type,entity_id,entity_reference,
    outcome,reason,request_id,source_area,before_values,after_values)
  values('booking.paid-checkout-queue-recovery-authorised','AUTHORISED SUPPORT RECOVERY',
    'booking',v_booking.id::text,v_booking.booking_reference,'success',
    'Explicit owner authorisation: recover existing fully paid booking unassigned; preserve 149 approved seats and record four additional guests awaiting Box Office.',
    v_request,'Booking recovery',jsonb_build_object('updated_at',v_booking.updated_at),
    jsonb_build_object('transaction_id',txid_current()::text));

  update public.bookings set booking_status='confirmed',archived_at=null,archive_reason=null,
    notes='__zingara_booking_meta__:' || v_metadata::text,updated_at=v_now
  where id=v_booking.id;
  perform public.reconcile_per_guest_ticket_population(v_booking.id,
    'AUTHORISED SUPPORT RECOVERY','Existing fully paid checkout restored to Assignment Queue.',v_request);
  if (select count(*) from public.tickets where booking_id=v_booking.id) <> 4
     or (select count(*) from public.tickets where booking_id=v_booking.id
       and ticket_status::text='valid' and replaced_by_ticket_id is null) <> 4 then
    raise exception 'PAID_CHECKOUT_RECOVERY_TICKET_COUNT_INVALID';
  end if;
  select * into v_after_capacity from public.booking_capacity_zone_state(v_booking.show_id,'golden-circle');
  if v_after_capacity.effective_operational_capacity <> v_before_capacity.effective_operational_capacity
     or v_after_capacity.active_entitlement_pax <> v_before_capacity.active_entitlement_pax+4
     or v_after_capacity.operational_remaining <> 0 then
    raise exception 'PAID_CHECKOUT_RECOVERY_CAPACITY_REPORT_INVALID|before:%|after:%',
      to_jsonb(v_before_capacity),to_jsonb(v_after_capacity);
  end if;
  insert into public.booking_lifecycle_events(booking_id,created_at,from_status,to_status,note,reason)
  values(v_booking.id,v_now,'cancelled','confirmed',
    'Authorised support recovery of existing fully paid checkout; unassigned in Assignment Queue.',
    'Owner-authorised recovery; four outstanding seating commitments, no increase to approved capacity.');
  v_result := jsonb_build_object('booking_reference',v_booking.booking_reference,'booking_status','confirmed',
    'payment_status','fully_paid','guest_count',4,'amount_paid',6160,'balance_outstanding',0,
    'floor_assignment_required',true,'valid_tickets',4,
    'approved_capacity',v_after_capacity.effective_operational_capacity,
    'active_entitlement',v_after_capacity.active_entitlement_pax,'capacity_shortfall',4);
  insert into public.audit_events(action,actor_name,entity_type,entity_id,entity_reference,
    outcome,reason,request_id,source_area,before_values,after_values,changed_fields)
  values('booking.paid-checkout-queue-recovered','AUTHORISED SUPPORT RECOVERY',
    'booking',v_booking.id::text,v_booking.booking_reference,'success',
    'Explicit owner authorisation; no payment, pricing, table, capacity or communication changes.',
    v_request,'Booking recovery',jsonb_build_object('booking_status',v_booking.booking_status,
      'archived_at',v_booking.archived_at,'archive_reason',v_booking.archive_reason,
      'amount_paid',v_booking.amount_paid,'guest_count',v_booking.guest_count),v_result,
    array['booking_status','archived_at','archive_reason','notes','tickets']);
  return v_result;
end;
$$;

revoke all on function public.recover_authorised_paid_checkout_queue_atomic(timestamptz)
  from public, anon, authenticated;
grant execute on function public.recover_authorised_paid_checkout_queue_atomic(timestamptz) to service_role;
comment on function public.recover_authorised_paid_checkout_queue_atomic(timestamptz) is
  'One explicitly authorised ZNG-X94SUT recovery. No general capacity override; unchanged operational capacity and normal sale/assignment guards.';
