-- Phase 39.48: prospective Corporate payment deadlines and atomic expiry.

alter table public.bookings
  add column if not exists corporate_payment_deadline timestamptz,
  add column if not exists corporate_payment_reminder_at timestamptz,
  add column if not exists corporate_payment_reminder_claimed_at timestamptz,
  add column if not exists corporate_payment_reminder_sent_at timestamptz,
  add column if not exists corporate_payment_expired_at timestamptz,
  add column if not exists corporate_payment_protected_at timestamptz;

create index if not exists bookings_corporate_payment_deadline_idx
  on public.bookings (corporate_payment_deadline)
  where corporate_payment_deadline is not null;

create or replace function public.set_new_corporate_payment_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_location text;
  v_enabled boolean;
  v_duration_days integer;
  v_reminder_days integer;
  v_show_deadline timestamptz;
begin
  if new.booking_source <> 'corporate-direct'
     or new.booking_origin::text <> 'corporate'
     or new.created_by_staff_id is null then
    return new;
  end if;

  select settings into v_settings
    from public.venue_settings
   order by created_at asc
   limit 1;

  select
    case
      when lower(coalesce(venue, '')) in ('johannesburg', 'joburg', 'jhb') then 'johannesburg'
      else 'cape-town'
    end,
    (date::text || ' ' || time::text)::timestamp at time zone 'Africa/Johannesburg'
    into v_location, v_show_deadline
    from public.shows
   where id = new.show_id;

  v_enabled := coalesce(
    (v_settings #>> array['operationalSettings','corporatePaymentHolds',v_location,'enabled'])::boolean,
    true
  );
  v_duration_days := coalesce(
    (v_settings #>> array['operationalSettings','corporatePaymentHolds',v_location,'durationDays'])::integer,
    7
  );
  v_reminder_days := coalesce(
    (v_settings #>> array['operationalSettings','corporatePaymentHolds',v_location,'reminderDaysBefore'])::integer,
    1
  );

  if v_enabled and v_show_deadline is not null then
    new.corporate_payment_deadline := least(
      coalesce(new.created_at, now()) + make_interval(days => v_duration_days),
      v_show_deadline
    );
    new.corporate_payment_reminder_at := greatest(
      coalesce(new.created_at, now()),
      new.corporate_payment_deadline - make_interval(days => v_reminder_days)
    );
  end if;

  return new;
end
$$;

drop trigger if exists bookings_set_new_corporate_payment_hold on public.bookings;
create trigger bookings_set_new_corporate_payment_hold
  before insert on public.bookings
  for each row execute function public.set_new_corporate_payment_hold();

create or replace function public.audit_corporate_payment_hold_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
begin
  if tg_op = 'INSERT' and new.corporate_payment_deadline is not null then
    select * into v_actor from public.staff_profiles where id = new.created_by_staff_id;
    insert into public.audit_events (
      action, actor_staff_profile_id, actor_auth_user_id, actor_name,
      actor_location_scope, entity_type, entity_reference, entity_id,
      outcome, source_area, reason, after_values, changed_fields
    ) values (
      'corporate.payment_deadline.created', new.created_by_staff_id,
      v_actor.user_id, coalesce(v_actor.full_name, v_actor.email),
      coalesce(v_actor.venue_scope, '{}'::text[]), 'booking',
      new.booking_reference, new.id::text, 'success', 'Corporate Bookings',
      'Prospective Corporate payment deadline created.',
      jsonb_build_object('deadline', new.corporate_payment_deadline, 'reminder_at', new.corporate_payment_reminder_at),
      array['corporate_payment_deadline','corporate_payment_reminder_at']
    );
  elsif tg_op = 'UPDATE'
    and coalesce(old.amount_paid, 0) <= 0
    and coalesce(new.amount_paid, 0) > 0
    and new.corporate_payment_deadline is not null
    and new.corporate_payment_protected_at is null then
    new.corporate_payment_protected_at := clock_timestamp();
    insert into public.audit_events (
      action, actor_name, actor_location_scope, entity_type, entity_reference,
      entity_id, outcome, source_area, reason, before_values, after_values,
      changed_fields
    ) values (
      'corporate.payment_deadline.protected', 'SYSTEM', '{}'::text[], 'booking',
      new.booking_reference, new.id::text, 'success', 'Corporate Bookings',
      'Successful booking-applied payment prevents automatic expiry.',
      jsonb_build_object('amount_paid', old.amount_paid),
      jsonb_build_object('amount_paid', new.amount_paid, 'protected_at', new.corporate_payment_protected_at),
      array['amount_paid','corporate_payment_protected_at']
    );
  end if;
  return new;
end
$$;

drop trigger if exists bookings_audit_corporate_payment_hold_changes on public.bookings;
create trigger bookings_audit_corporate_payment_hold_changes
  before insert or update of amount_paid on public.bookings
  for each row execute function public.audit_corporate_payment_hold_changes();

create or replace function public.claim_due_corporate_payment_reminders()
returns table (
  booking_id uuid,
  booking_reference text,
  corporate_payment_deadline timestamptz,
  created_by_staff_id uuid,
  staff_name text,
  staff_email text,
  guest_name text,
  show_date date
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select b.id
      from public.bookings b
     where b.corporate_payment_reminder_at <= now()
       and b.corporate_payment_deadline > now()
       and b.corporate_payment_reminder_sent_at is null
       and (b.corporate_payment_reminder_claimed_at is null
         or b.corporate_payment_reminder_claimed_at < now() - interval '30 minutes')
       and coalesce(b.amount_paid, 0) <= 0
       and b.booking_status in ('new', 'pending_payment')
       and b.created_by_staff_id is not null
     order by b.corporate_payment_deadline
     limit 500
     for update skip locked
  ), claimed as (
    update public.bookings b
       set corporate_payment_reminder_claimed_at = now()
      from candidates c
     where b.id = c.id
     returning b.*
  )
  select c.id, c.booking_reference, c.corporate_payment_deadline,
         c.created_by_staff_id, coalesce(sp.full_name, sp.email), sp.email,
         trim(concat_ws(' ', cu.first_name, cu.surname)), s.date
    from claimed c
    join public.staff_profiles sp on sp.id = c.created_by_staff_id
    join public.customers cu on cu.id = c.customer_id
    join public.shows s on s.id = c.show_id
$$;

create or replace function public.expire_unpaid_corporate_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_released integer := 0;
  v_tickets integer := 0;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.corporate_payment_expired_at is not null or v_booking.booking_status = 'cancelled' then
    return jsonb_build_object('expired', false, 'idempotent', true);
  end if;
  if v_booking.corporate_payment_deadline is null
     or v_booking.corporate_payment_deadline > v_now
     or coalesce(v_booking.amount_paid, 0) > 0
     or v_booking.booking_status not in ('new', 'pending_payment') then
    return jsonb_build_object('expired', false, 'protected', true);
  end if;

  update public.bookings set booking_status = 'cancelled', table_id = null,
    corporate_payment_expired_at = v_now, updated_at = v_now where id = v_booking.id;
  update public.show_tables set booking_id = null, status = 'available', updated_at = v_now
    where booking_id = v_booking.id;
  get diagnostics v_released = row_count;
  update public.tickets set ticket_status = 'cancelled', updated_at = v_now
    where booking_id = v_booking.id and ticket_status in ('issued','valid','checked_in','expired');
  get diagnostics v_tickets = row_count;

  insert into public.booking_lifecycle_events
    (booking_id, from_status, to_status, note, reason, created_at)
  values (v_booking.id, v_booking.booking_status, 'cancelled',
    'Corporate payment deadline expired', 'No payment received by the Corporate payment deadline.', v_now);
  insert into public.audit_events
    (action, actor_name, actor_location_scope, entity_type, entity_reference,
     entity_id, outcome, source_area, reason, before_values, after_values, changed_fields)
  values ('corporate.payment_deadline.expired', 'SYSTEM', '{}'::text[], 'booking',
    v_booking.booking_reference, v_booking.id::text, 'success', 'Corporate Bookings',
    'No payment received by the Corporate payment deadline.',
    jsonb_build_object('booking_status', v_booking.booking_status, 'table_id', v_booking.table_id),
    jsonb_build_object('booking_status', 'cancelled', 'table_id', null, 'expired_at', v_now),
    array['booking_status','table_id','ticket_status','corporate_payment_expired_at']);

  return jsonb_build_object('expired', true, 'released_table_count', v_released, 'ticket_count', v_tickets);
end
$$;

revoke all on function public.claim_due_corporate_payment_reminders() from public, anon, authenticated;
revoke all on function public.expire_unpaid_corporate_booking(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_corporate_payment_reminders() to service_role;
grant execute on function public.expire_unpaid_corporate_booking(uuid) to service_role;

update public.venue_settings
set settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(settings, '{operationalSettings,publicBookings,cape-town,sameDayCutoffEnabled}', 'true'::jsonb, true),
      '{operationalSettings,publicBookings,cape-town,sameDayCutoffTime}', '"12:00"'::jsonb, true
    ),
    '{operationalSettings,publicBookings,johannesburg,sameDayCutoffEnabled}', 'true'::jsonb, true
  ),
  '{operationalSettings,publicBookings,johannesburg,sameDayCutoffTime}', '"12:00"'::jsonb, true
),
operational_config = jsonb_set(
  operational_config,
  '{operationalSettings,corporatePaymentHolds}',
  '{"cape-town":{"enabled":true,"durationDays":7,"reminderDaysBefore":1},"johannesburg":{"enabled":true,"durationDays":7,"reminderDaysBefore":1}}'::jsonb,
  true
),
updated_at = now();

update public.venue_settings
set settings = jsonb_set(
  settings,
  '{operationalSettings,corporatePaymentHolds}',
  '{"cape-town":{"enabled":true,"durationDays":7,"reminderDaysBefore":1},"johannesburg":{"enabled":true,"durationDays":7,"reminderDaysBefore":1}}'::jsonb,
  true
),
operational_config = jsonb_set(
  operational_config,
  '{operationalSettings,publicBookings}',
  settings #> '{operationalSettings,publicBookings}',
  true
),
updated_at = now();
