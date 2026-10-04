-- Emergency P0: Corporate payment dates are follow-up dates only.
-- Corporate bookings must never be cancelled or release entitlement for non-payment.

create or replace function public.expire_unpaid_corporate_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'expired', false,
    'protected', true,
    'reason', 'CORPORATE_AUTO_EXPIRY_DISABLED',
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference
  );
end
$$;

revoke all on function public.expire_unpaid_corporate_booking(uuid)
  from public, anon, authenticated;
grant execute on function public.expire_unpaid_corporate_booking(uuid)
  to service_role;

comment on function public.expire_unpaid_corporate_booking(uuid) is
  'Compatibility guard: Corporate non-payment never cancels, archives, releases entitlement, tables, or tickets.';

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
      'Corporate payment follow-up date created. This date does not expire the booking.',
      jsonb_build_object('payment_due', new.corporate_payment_deadline, 'reminder_at', new.corporate_payment_reminder_at),
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
      'Booking-applied payment recorded against the Corporate payment follow-up.',
      jsonb_build_object('amount_paid', old.amount_paid),
      jsonb_build_object('amount_paid', new.amount_paid, 'protected_at', new.corporate_payment_protected_at),
      array['amount_paid','corporate_payment_protected_at']
    );
  end if;
  return new;
end
$$;

-- Kaden is an additive, editable management recipient for future Dineplan
-- operational mail. Existing configured recipients remain unchanged.
update public.dineplan_reconciliation_settings settings
set management_cc_staff_ids = case
      when kaden.id = any(settings.management_cc_staff_ids)
        then settings.management_cc_staff_ids
      else array_append(settings.management_cc_staff_ids, kaden.id)
    end,
    updated_at = clock_timestamp()
from lateral (
  select id
  from public.staff_profiles
  where active = true
    and lower(email) = 'kaden@kaden.co.za'
  limit 1
) kaden
where settings.id = 1;
