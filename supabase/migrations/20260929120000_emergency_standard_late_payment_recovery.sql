-- Emergency P0: keep successful PayFast settlement, lifecycle restoration,
-- and customer communications aligned with the committed booking state.

alter table public.communications
  add column if not exists provider_transaction_id text;

create unique index if not exists communications_payfast_payment_email_claim_uidx
  on public.communications (booking_id, provider_transaction_id, type, channel)
  where status in ('sending', 'sent')
    and channel = 'email'
    and type = 'payment_confirmation'
    and provider_transaction_id is not null;

-- Existing one-payment/one-confirmation histories can be linked without
-- guessing when a booking has multiple provider payments.
with unambiguous as (
  select
    communication.id as communication_id,
    min(payment.provider_transaction_id) as provider_transaction_id
  from public.communications communication
  join public.payments payment on payment.booking_id = communication.booking_id
  where communication.type = 'payment_confirmation'
    and communication.channel = 'email'
    and communication.provider_transaction_id is null
    and payment.method = 'payfast'
    and payment.provider_transaction_id is not null
  group by communication.id, communication.booking_id
  having count(distinct payment.provider_transaction_id) = 1
     and (
       select count(*)
       from public.communications sibling
       where sibling.booking_id = communication.booking_id
         and sibling.type = 'payment_confirmation'
         and sibling.channel = 'email'
         and sibling.status = 'sent'
     ) = 1
)
update public.communications communication
set provider_transaction_id = unambiguous.provider_transaction_id
from unambiguous
where communication.id = unambiguous.communication_id;

create or replace function public.claim_payfast_payment_email_once(
  p_booking_id uuid,
  p_customer_id uuid,
  p_show_id uuid,
  p_provider_transaction_id text,
  p_subject text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.communications%rowtype;
  v_claim public.communications%rowtype;
begin
  if p_booking_id is null or p_customer_id is null
     or nullif(trim(p_provider_transaction_id), '') is null then
    raise exception 'booking_id, customer_id and provider_transaction_id are required';
  end if;

  perform pg_advisory_xact_lock(hashtext(
    p_booking_id::text || ':' || trim(p_provider_transaction_id) || ':payment-confirmation'
  ));

  select *
  into v_existing
  from public.communications
  where booking_id = p_booking_id
    and provider_transaction_id = trim(p_provider_transaction_id)
    and type = 'payment_confirmation'
    and channel = 'email'
    and status in ('sending', 'sent')
  order by case status when 'sent' then 0 else 1 end, created_at
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'status', v_existing.status,
      'communication_id', v_existing.id
    );
  end if;

  insert into public.communications (
    booking_id, channel, customer_id, message, provider_transaction_id,
    sent_at, show_id, status, subject, type
  ) values (
    p_booking_id, 'email', p_customer_id, p_message,
    trim(p_provider_transaction_id), null, p_show_id, 'sending', p_subject,
    'payment_confirmation'
  )
  returning * into v_claim;

  return jsonb_build_object(
    'status', 'claimed',
    'communication_id', v_claim.id
  );
end;
$$;

revoke all on function public.claim_payfast_payment_email_once(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_payfast_payment_email_once(
  uuid, uuid, uuid, text, text, text
) to service_role;

create or replace function public.standard_late_payment_recovery_state(
  p_booking_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allocations jsonb := '[]'::jsonb;
  v_booking public.bookings%rowtype;
  v_capacity record;
  v_category text := 'safe_to_restore';
  v_deficit integer;
  v_duplicate_references text[] := '{}';
  v_entitlement record;
  v_show public.shows%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('category', 'other_conflict', 'reason', 'missing');
  end if;

  select * into v_show from public.shows where id = v_booking.show_id;

  if v_booking.booking_origin is distinct from 'customer_public'
     or v_booking.booking_source <> 'online'
     or v_booking.public_checkout_expired_at is null
     or v_booking.archive_reason <> 'Public payment hold expired'
     or v_booking.archived_at is null then
    return jsonb_build_object('category', 'not_required');
  end if;

  if v_show.id is null
     or v_show.date < (clock_timestamp() at time zone 'Africa/Johannesburg')::date
     or v_show.status::text not in ('active', 'sold_out') then
    v_category := 'legitimately_archived';
  elsif not exists (
    select 1
    from public.payments payment
    where payment.booking_id = v_booking.id
      and payment.method = 'payfast'
      and payment.provider_transaction_id is not null
      and payment.payment_status::text in ('deposit_paid', 'fully_paid')
      and payment.processed_at > v_booking.public_checkout_expired_at
  ) then
    v_category := 'other_conflict';
  elsif v_booking.public_checkout_superseded_by is not null
     or v_booking.payment_status::text in ('cancelled', 'refunded')
     or exists (
       select 1 from public.payment_refunds refund
       where refund.booking_id = v_booking.id and refund.completed_at is not null
     )
     or exists (
       select 1
       from public.audit_events later_action
       where later_action.entity_id = v_booking.id::text
         and later_action.created_at > v_booking.public_checkout_expired_at
         and later_action.outcome = 'success'
         and later_action.action in ('booking.cancel', 'booking.archive', 'booking.refund')
     ) then
    v_category := 'other_conflict';
  end if;

  if v_category = 'safe_to_restore' then
    select coalesce(array_agg(other.booking_reference order by other.created_at), '{}')
    into v_duplicate_references
    from public.bookings other
    where other.id <> v_booking.id
      and other.show_id = v_booking.show_id
      and other.archived_at is null
      and other.booking_status::text in ('new', 'pending_payment', 'confirmed', 'checked_in')
      and other.customer_id = v_booking.customer_id
      and other.guest_count = v_booking.guest_count
      and other.section is not distinct from v_booking.section
      and not exists (
        select 1
        from public.duplicate_booking_review_dispositions disposition
        where disposition.decision = 'legitimate_separate_bookings'
          and disposition.record_ids @> array[v_booking.id, other.id]::uuid[]
      );
    if cardinality(v_duplicate_references) > 0 then
      v_category := 'other_conflict';
    end if;
  end if;

  if v_category = 'safe_to_restore' then
    for v_entitlement in
      select public.normalize_booking_capacity_zone(zone_id) as zone_id, pax
      from (
        select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
        from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
        union all
        select v_booking.section, v_booking.guest_count
        where v_booking.zone_entitlements is null
      ) zones
      where public.normalize_booking_capacity_zone(zone_id) is not null
      order by 1
    loop
      select * into v_capacity
      from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);
      if v_capacity.effective_operational_capacity is null then
        v_category := 'other_conflict';
        exit;
      end if;
      v_deficit := greatest(
        v_capacity.active_entitlement_pax + v_entitlement.pax -
          v_capacity.effective_operational_capacity,
        0
      );
      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'zone_id', v_entitlement.zone_id,
        'pax', v_entitlement.pax,
        'base_capacity', v_capacity.base_capacity,
        'temporary_capacity', v_capacity.temporary_capacity,
        'effective_capacity', v_capacity.effective_operational_capacity,
        'active_entitlement', v_capacity.active_entitlement_pax,
        'available', greatest(
          v_capacity.effective_operational_capacity - v_capacity.active_entitlement_pax,
          0
        ),
        'deficit', v_deficit
      ));
      if v_deficit > 0 then
        v_category := 'capacity_review';
      end if;
    end loop;
    if v_allocations = '[]'::jsonb then
      v_category := 'other_conflict';
    end if;
  end if;

  return jsonb_build_object(
    'category', v_category,
    'allocations', v_allocations,
    'duplicate_references', to_jsonb(v_duplicate_references),
    'show_date', v_show.date,
    'show_status', v_show.status,
    'payment_expired_at', v_booking.public_checkout_expired_at
  );
end;
$$;

revoke all on function public.standard_late_payment_recovery_state(uuid)
  from public, anon, authenticated;
grant execute on function public.standard_late_payment_recovery_state(uuid)
  to service_role;

create or replace function public.preview_standard_late_payment_recovery()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      booking.id,
      booking.booking_reference,
      booking.guest_count,
      booking.section,
      booking.payment_status,
      booking.amount_paid,
      booking.balance_outstanding,
      booking.public_checkout_expired_at,
      booking.archived_at,
      show_row.date as show_date,
      show_row.time as show_time,
      show_row.venue,
      public.standard_late_payment_recovery_state(booking.id) as recovery
    from public.bookings booking
    join public.shows show_row on show_row.id = booking.show_id
    where booking.booking_origin = 'customer_public'
      and booking.booking_source = 'online'
      and booking.public_checkout_expired_at is not null
      and exists (
        select 1 from public.payments payment
        where payment.booking_id = booking.id
          and payment.method = 'payfast'
          and payment.provider_transaction_id is not null
          and payment.processed_at > booking.public_checkout_expired_at
      )
  )
  select jsonb_build_object(
    'generated_at', clock_timestamp(),
    'summary', jsonb_build_object(
      'total', count(*),
      'safe_to_restore', count(*) filter (where recovery ->> 'category' = 'safe_to_restore'),
      'capacity_review', count(*) filter (where recovery ->> 'category' = 'capacity_review'),
      'legitimately_archived', count(*) filter (where recovery ->> 'category' = 'legitimately_archived'),
      'other_conflict', count(*) filter (where recovery ->> 'category' = 'other_conflict'),
      'already_active', count(*) filter (where recovery ->> 'category' = 'not_required')
    ),
    'bookings', coalesce(jsonb_agg(jsonb_build_object(
      'booking_id', id,
      'booking_reference', booking_reference,
      'guest_count', guest_count,
      'zone', section,
      'payment_status', payment_status,
      'amount_paid', amount_paid,
      'balance_outstanding', balance_outstanding,
      'expired_at', public_checkout_expired_at,
      'archived_at', archived_at,
      'show_date', show_date,
      'show_time', show_time,
      'venue', venue,
      'category', recovery ->> 'category',
      'allocations', recovery -> 'allocations',
      'duplicate_references', recovery -> 'duplicate_references'
    ) order by show_date, booking_reference), '[]'::jsonb)
  )
  from candidates
$$;

revoke all on function public.preview_standard_late_payment_recovery()
  from public, anon, authenticated;
grant execute on function public.preview_standard_late_payment_recovery()
  to service_role;

create or replace function public.confirm_payfast_payment_core(
  p_booking_reference text,
  p_provider_transaction_id text,
  p_amount numeric,
  p_payment_status public.payment_status,
  p_payment_type public.payment_type,
  p_payment_notes text,
  p_booking_notes text,
  p_amount_paid numeric,
  p_balance_outstanding numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(10,2);
  v_booking public.bookings%rowtype;
  v_booking_was_confirmed boolean := false;
  v_cumulative_paid numeric(10,2);
  v_entitlement record;
  v_existing_provider_payment public.payments%rowtype;
  v_final_notes text := p_booking_notes;
  v_metadata jsonb;
  v_new_booking_status public.booking_status;
  v_now timestamptz := clock_timestamp();
  v_payment public.payments%rowtype;
  v_payment_link_id uuid;
  v_payment_status public.payment_status;
  v_payment_type public.payment_type;
  v_recovery jsonb;
  v_recovery_category text := 'not_required';
begin
  if nullif(trim(p_booking_reference), '') is null then
    raise exception 'booking_reference is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'positive amount is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_reference));
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference
  for update;

  if v_booking.id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  v_booking_was_confirmed := v_booking.booking_status = 'confirmed';

  if nullif(trim(p_provider_transaction_id), '') is not null then
    select * into v_existing_provider_payment
    from public.payments
    where provider_transaction_id = trim(p_provider_transaction_id)
    limit 1;
    if v_existing_provider_payment.id is not null then
      if v_existing_provider_payment.booking_id <> v_booking.id then
        return jsonb_build_object(
          'status', 'duplicate_provider_transaction',
          'booking_id', v_booking.id,
          'payment_id', v_existing_provider_payment.id
        );
      end if;
      return jsonb_build_object(
        'status', 'already_confirmed',
        'booking_id', v_booking.id,
        'payment_id', v_existing_provider_payment.id,
        'booking_was_confirmed', v_booking_was_confirmed,
        'amount_paid', v_booking.amount_paid,
        'balance_outstanding', v_booking.balance_outstanding,
        'archived_at', v_booking.archived_at,
        'restoration_status', case
          when v_booking.archived_at is null then 'active'
          else 'review_required'
        end
      );
    end if;
  end if;

  for v_entitlement in
    select public.normalize_booking_capacity_zone(zone_id) as zone_id
    from (
      select item ->> 'zoneId' as zone_id
      from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
      union all
      select v_booking.section where v_booking.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_id) is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_booking.show_id::text || ':' || v_entitlement.zone_id, 0)
    );
  end loop;

  select link.id into v_payment_link_id
  from public.booking_payment_links link
  where link.booking_id = v_booking.id
    and link.booking_reference = v_booking.booking_reference
    and link.status = 'active'
    and round(case
      when coalesce(link.metadata ->> 'checkoutAmount', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
        then (link.metadata ->> 'checkoutAmount')::numeric else -1 end, 2) = round(p_amount, 2)
    and round(case
      when coalesce(link.metadata ->> 'amountPaidSnapshot', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
        then (link.metadata ->> 'amountPaidSnapshot')::numeric else -1 end, 2) = round(coalesce(v_booking.amount_paid, 0), 2)
    and round(case
      when coalesce(link.metadata ->> 'totalAmountSnapshot', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
        then (link.metadata ->> 'totalAmountSnapshot')::numeric else -1 end, 2) = round(coalesce(v_booking.total_amount, 0), 2)
  order by link.created_at desc
  limit 1
  for update;

  v_cumulative_paid := least(
    greatest(round(coalesce(v_booking.amount_paid, 0) + p_amount, 2), 0),
    greatest(round(coalesce(v_booking.total_amount, 0), 2), 0)
  );
  v_balance := greatest(round(coalesce(v_booking.total_amount, 0) - v_cumulative_paid, 2), 0);
  v_payment_status := case
    when v_balance <= 0.01 then 'fully_paid'::public.payment_status
    else 'deposit_paid'::public.payment_status
  end;
  v_payment_type := case
    when coalesce(v_booking.amount_paid, 0) > 0 then 'balance'::public.payment_type
    when v_payment_status = 'deposit_paid' then 'deposit'::public.payment_type
    else 'full_payment'::public.payment_type
  end;

  select * into v_payment
  from public.payments
  where booking_id = v_booking.id
    and reference = p_booking_reference
    and payment_status = 'pending_payment'
    and provider_transaction_id is null
  order by created_at desc
  limit 1
  for update;

  if v_payment.id is null then
    insert into public.payments (
      amount, booking_id, method, notes, payment_status, payment_type,
      processed_at, provider_transaction_id, reference
    ) values (
      round(p_amount, 2), v_booking.id, 'payfast', p_payment_notes,
      v_payment_status, v_payment_type, v_now,
      nullif(trim(p_provider_transaction_id), ''), p_booking_reference
    ) returning * into v_payment;
  else
    update public.payments
    set amount = round(p_amount, 2), method = 'payfast', notes = p_payment_notes,
        payment_status = v_payment_status, payment_type = v_payment_type,
        processed_at = v_now,
        provider_transaction_id = nullif(trim(p_provider_transaction_id), ''),
        reference = p_booking_reference
    where id = v_payment.id
    returning * into v_payment;
  end if;

  if v_payment_link_id is not null then
    update public.booking_payment_links
    set status = 'used', used_at = coalesce(used_at, v_now), updated_at = v_now
    where id = v_payment_link_id and status = 'active';
  end if;

  v_recovery := public.standard_late_payment_recovery_state(v_booking.id);
  v_recovery_category := coalesce(v_recovery ->> 'category', 'other_conflict');
  v_new_booking_status := case
    when v_booking.archived_at is null then 'confirmed'::public.booking_status
    when v_recovery_category = 'safe_to_restore' then 'confirmed'::public.booking_status
    else v_booking.booking_status
  end;

  if v_final_notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(v_final_notes from length('__zingara_booking_meta__:') + 1)::jsonb;
      v_metadata := jsonb_set(v_metadata, '{amountPaid}', to_jsonb(v_cumulative_paid), true);
      v_metadata := jsonb_set(v_metadata, '{balanceDue}', to_jsonb(v_balance), true);
      v_metadata := jsonb_set(v_metadata, '{paymentStatus}', to_jsonb(case
        when v_payment_status = 'fully_paid' then 'fully-paid' else 'deposit-paid' end), true);
      v_metadata := jsonb_set(v_metadata, '{status}', to_jsonb(replace(v_new_booking_status::text, '_', '-')), true);
      v_final_notes := '__zingara_booking_meta__:' || v_metadata::text;
    exception when others then
      v_final_notes := v_booking.notes;
    end;
  end if;

  update public.bookings
  set amount_paid = v_cumulative_paid,
      balance_outstanding = v_balance,
      booking_status = v_new_booking_status,
      notes = v_final_notes,
      payment_status = v_payment_status,
      archived_at = case when v_recovery_category = 'safe_to_restore' then null else archived_at end,
      archived_by = case when v_recovery_category = 'safe_to_restore' then null else archived_by end,
      archive_reason = case when v_recovery_category = 'safe_to_restore' then null else archive_reason end,
      updated_at = v_now
  where id = v_booking.id
  returning * into v_booking;

  insert into public.booking_lifecycle_events (
    booking_id, created_at, from_status, note, reason, to_status
  ) values (
    v_booking.id, v_now,
    case when v_recovery_category = 'safe_to_restore' then 'cancelled'::public.booking_status else v_booking.booking_status end,
    format('PayFast payment received: %s', coalesce(nullif(trim(p_provider_transaction_id), ''), p_booking_reference)),
    case when v_recovery_category = 'safe_to_restore'
      then 'Successful late payment restored an automatically expired public booking.'
      when v_booking.archived_at is not null
      then 'Successful payment recorded; lifecycle requires operational review.'
      else null end,
    v_new_booking_status
  );

  if v_recovery_category = 'safe_to_restore' then
    insert into public.audit_events (
      action, actor_name, actor_location_scope, entity_type, entity_reference,
      entity_id, outcome, source_area, reason, before_values, after_values,
      changed_fields
    ) values (
      'public_booking.late-payment-restored', 'SYSTEM', '{}'::text[], 'booking',
      v_booking.booking_reference, v_booking.id::text, 'success', 'PayFast ITN',
      'Successful PayFast payment superseded automatic public hold expiry after live capacity validation.',
      jsonb_build_object('archived_at', v_booking.public_checkout_expired_at, 'booking_status', 'cancelled'),
      jsonb_build_object('archived_at', null, 'booking_status', 'confirmed', 'capacity', v_recovery -> 'allocations'),
      array['booking_status', 'archived_at', 'archived_by', 'archive_reason']
    );
  elsif v_booking.archived_at is not null then
    insert into public.audit_events (
      action, actor_name, actor_location_scope, entity_type, entity_reference,
      entity_id, outcome, source_area, reason, before_values, after_values,
      changed_fields
    ) values (
      'public_booking.late-payment-review-required', 'SYSTEM', '{}'::text[],
      'booking', v_booking.booking_reference, v_booking.id::text, 'blocked',
      'PayFast ITN',
      'Successful payment was preserved, but the expired booking could not be safely restored automatically.',
      jsonb_build_object('booking_status', 'cancelled', 'archived_at', v_booking.archived_at),
      jsonb_build_object('payment_status', v_payment_status, 'amount_paid', v_cumulative_paid, 'recovery', v_recovery),
      array['payment_status', 'amount_paid', 'balance_outstanding']
    );
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'booking_id', v_booking.id,
    'payment_id', v_payment.id,
    'payment_link_id', v_payment_link_id,
    'booking_was_confirmed', v_booking_was_confirmed,
    'amount_paid', v_cumulative_paid,
    'balance_outstanding', v_balance,
    'archived_at', v_booking.archived_at,
    'restoration_status', case
      when v_booking.archived_at is null then 'active'
      else v_recovery_category
    end,
    'recovery', v_recovery
  );
end;
$$;

revoke all on function public.confirm_payfast_payment_core(
  text, text, numeric, public.payment_status, public.payment_type, text, text,
  numeric, numeric
) from public, anon, authenticated;
grant execute on function public.confirm_payfast_payment_core(
  text, text, numeric, public.payment_status, public.payment_type, text, text,
  numeric, numeric
) to service_role;

create or replace function public.recover_standard_late_payment_booking_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_request_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_entitlement record;
  v_existing_audit uuid;
  v_now timestamptz := clock_timestamp();
  v_recovery jsonb;
  v_ticket_count integer := 0;
begin
  if nullif(trim(p_booking_reference), '') is null
     or nullif(trim(p_request_id), '') is null
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'reference, request id and actor are required';
  end if;

  select id into v_existing_audit
  from public.audit_events
  where request_id = trim(p_request_id)
    and action = 'public_booking.late-payment-recovered'
  limit 1;
  if v_existing_audit is not null then
    return jsonb_build_object('status', 'processed', 'idempotent', true);
  end if;

  perform pg_advisory_xact_lock(hashtext(trim(p_booking_reference)));
  select * into v_booking
  from public.bookings
  where booking_reference = trim(p_booking_reference)
  for update;

  if v_booking.id is null then raise exception 'LATE_PAYMENT_RECOVERY_MISSING'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'LATE_PAYMENT_RECOVERY_STALE_REVISION';
  end if;

  for v_entitlement in
    select public.normalize_booking_capacity_zone(zone_id) as zone_id
    from (
      select item ->> 'zoneId' as zone_id
      from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
      union all
      select v_booking.section where v_booking.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_id) is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_booking.show_id::text || ':' || v_entitlement.zone_id, 0)
    );
  end loop;

  v_recovery := public.standard_late_payment_recovery_state(v_booking.id);
  if v_recovery ->> 'category' <> 'safe_to_restore' then
    raise exception 'LATE_PAYMENT_RECOVERY_NOT_SAFE|%', v_recovery ->> 'category';
  end if;

  update public.bookings
  set archived_at = null,
      archived_by = null,
      archive_reason = null,
      booking_status = 'confirmed',
      notes = case
        when notes like '__zingara_booking_meta__:%' then
          '__zingara_booking_meta__:' || jsonb_set(
            substring(notes from length('__zingara_booking_meta__:') + 1)::jsonb,
            '{status}', '"confirmed"'::jsonb, true
          )::text
        else notes
      end,
      updated_at = v_now
  where id = v_booking.id;

  update public.tickets
  set ticket_status = case when ticket_status = 'cancelled' then 'valid' else ticket_status end,
      updated_at = v_now
  where booking_id = v_booking.id
    and ticket_status not in ('refunded', 'void', 'checked_in');
  get diagnostics v_ticket_count = row_count;

  insert into public.booking_lifecycle_events (
    booking_id, created_at, from_status, note, reason, to_status
  ) values (
    v_booking.id, v_now, 'cancelled',
    format('Late-paid public booking recovered by %s.', trim(p_actor_name)),
    'Management-authorised emergency recovery; successful provider payment and live capacity validated.',
    'confirmed'
  );

  insert into public.audit_events (
    action, actor_location_scope, actor_name, after_values, before_values,
    changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
    request_id, source_area
  ) values (
    'public_booking.late-payment-recovered', '{}'::text[], trim(p_actor_name),
    jsonb_build_object(
      'booking_status', 'confirmed', 'archived_at', null,
      'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding,
      'capacity', v_recovery -> 'allocations', 'tickets_updated', v_ticket_count
    ),
    jsonb_build_object(
      'booking_status', v_booking.booking_status,
      'archived_at', v_booking.archived_at,
      'archive_reason', v_booking.archive_reason,
      'payment_status', v_booking.payment_status,
      'amount_paid', v_booking.amount_paid,
      'balance_outstanding', v_booking.balance_outstanding
    ),
    array['booking_status', 'archived_at', 'archived_by', 'archive_reason'],
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    'Management-authorised emergency recovery; successful provider payment and live capacity validated.',
    trim(p_request_id), 'Emergency Standard Late Payment Recovery'
  );

  return jsonb_build_object(
    'status', 'processed', 'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'payment_status', v_booking.payment_status,
    'amount_paid', v_booking.amount_paid,
    'balance_outstanding', v_booking.balance_outstanding,
    'capacity', v_recovery -> 'allocations',
    'tickets_updated', v_ticket_count
  );
end;
$$;

revoke all on function public.recover_standard_late_payment_booking_atomic(
  text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.recover_standard_late_payment_booking_atomic(
  text, timestamptz, text, text
) to service_role;
