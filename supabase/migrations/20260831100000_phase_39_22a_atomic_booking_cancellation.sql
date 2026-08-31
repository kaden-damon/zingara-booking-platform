-- Phase 39.22A: make booking cancellation, table release, ticket invalidation,
-- lifecycle history, and audit recording one idempotent transaction.

create or replace function public.cancel_booking_atomic(
  p_booking_reference text,
  p_serialized_notes text,
  p_lifecycle_note text,
  p_cancelled_at timestamptz,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
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
  v_booking public.bookings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_released_table_count integer := 0;
  v_ticket_count integer := 0;
  v_was_cancelled boolean;
begin
  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(p_booking_reference), '')
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.archived_at is not null then
    raise exception 'ARCHIVED_BOOKING_CANCELLATION_BLOCKED';
  end if;

  v_was_cancelled := v_booking.booking_status = 'cancelled';

  if not v_was_cancelled then
    update public.bookings
       set booking_status = 'cancelled',
           notes = p_serialized_notes,
           table_id = null,
           updated_at = v_now
     where id = v_booking.id;
  elsif v_booking.table_id is not null then
    update public.bookings
       set table_id = null,
           updated_at = v_now
     where id = v_booking.id;
  end if;

  update public.show_tables
     set booking_id = null,
         status = 'available',
         updated_at = v_now
   where booking_id = v_booking.id;
  get diagnostics v_released_table_count = row_count;

  update public.tickets
     set ticket_status = 'cancelled',
         updated_at = v_now
   where booking_id = v_booking.id
     and ticket_status in ('issued', 'valid', 'checked_in', 'expired');
  get diagnostics v_ticket_count = row_count;

  if not v_was_cancelled then
    insert into public.booking_lifecycle_events (
      booking_id,
      changed_by,
      created_at,
      from_status,
      note,
      reason,
      to_status
    ) values (
      v_booking.id,
      p_actor_auth_user_id,
      coalesce(p_cancelled_at, v_now),
      v_booking.booking_status,
      nullif(trim(p_lifecycle_note), ''),
      nullif(trim(p_lifecycle_note), ''),
      'cancelled'
    );

    insert into public.audit_events (
      action,
      actor_auth_user_id,
      actor_location_scope,
      actor_name,
      actor_role,
      actor_staff_profile_id,
      after_values,
      before_values,
      changed_fields,
      entity_id,
      entity_reference,
      entity_type,
      outcome,
      reason,
      request_id,
      source_area,
      user_agent
    ) values (
      'booking.cancel',
      p_actor_auth_user_id,
      coalesce(p_actor_location_scope, '{}'::text[]),
      p_actor_name,
      p_actor_role,
      p_actor_staff_profile_id,
      jsonb_build_object(
        'booking_status', 'cancelled',
        'table_id', null,
        'ticket_status', 'cancelled'
      ),
      jsonb_build_object(
        'booking_status', v_booking.booking_status,
        'table_id', v_booking.table_id
      ),
      array['booking_status', 'notes', 'table_id', 'ticket_status'],
      v_booking.id::text,
      v_booking.booking_reference,
      'booking',
      'success',
      coalesce(nullif(trim(p_lifecycle_note), ''), 'Booking cancelled.'),
      p_request_id,
      'Bookings',
      p_user_agent
    );
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'idempotent', v_was_cancelled,
    'released_table_count', v_released_table_count,
    'ticket_count', v_ticket_count
  );
end
$$;

revoke all on function public.cancel_booking_atomic(
  text, text, text, timestamptz, uuid, uuid, text, text, text[], text, text
) from public, anon, authenticated;

grant execute on function public.cancel_booking_atomic(
  text, text, text, timestamptz, uuid, uuid, text, text, text[], text, text
) to service_role;
