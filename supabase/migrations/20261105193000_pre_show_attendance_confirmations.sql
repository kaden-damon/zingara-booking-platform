begin;

alter table public.bookings
  add column if not exists attendance_response text,
  add column if not exists attendance_responded_at timestamptz,
  add column if not exists attendance_response_version integer not null default 0;

alter table public.bookings
  drop constraint if exists bookings_attendance_response_check,
  add constraint bookings_attendance_response_check
    check (attendance_response is null or attendance_response in ('confirmed', 'declined'));

create table if not exists public.booking_attendance_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  token_hash text not null unique,
  token_envelope jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_attendance_links_expiry_idx
  on public.booking_attendance_links(expires_at);

alter table public.booking_attendance_links enable row level security;
revoke all on public.booking_attendance_links from public, anon, authenticated;
grant select, insert, update on public.booking_attendance_links to service_role;

create or replace function public.record_booking_attendance_response(
  p_token_hash text,
  p_response text
)
returns table (
  booking_id uuid,
  booking_reference text,
  changed boolean,
  response_version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_link public.booking_attendance_links%rowtype;
  v_changed boolean;
  v_previous_response text;
  v_previous_version integer;
begin
  if p_response not in ('confirmed', 'declined') then
    raise exception 'INVALID_ATTENDANCE_RESPONSE';
  end if;

  select * into v_link
  from public.booking_attendance_links
  where token_hash = p_token_hash
    and expires_at > now();

  if not found then
    raise exception 'ATTENDANCE_LINK_UNAVAILABLE';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_link.booking_id
  for update;

  if not found then
    raise exception 'ATTENDANCE_BOOKING_UNAVAILABLE';
  end if;

  v_changed := v_booking.attendance_response is distinct from p_response;
  v_previous_response := v_booking.attendance_response;
  v_previous_version := v_booking.attendance_response_version;

  if v_changed then
    update public.bookings
    set attendance_response = p_response,
        attendance_responded_at = now(),
        attendance_response_version = attendance_response_version + 1
    where id = v_booking.id
    returning * into v_booking;

    insert into public.audit_events (
      action,
      actor_name,
      actor_role,
      after_values,
      before_values,
      changed_fields,
      entity_id,
      entity_reference,
      entity_type,
      outcome,
      source_area
    ) values (
      'booking_attendance_response_recorded',
      'Guest via secure pre-show link',
      'Customer',
      jsonb_build_object('attendance_response', p_response, 'attendance_response_version', v_booking.attendance_response_version),
      jsonb_build_object('attendance_response', v_previous_response, 'attendance_response_version', v_previous_version),
      array['attendance_response', 'attendance_responded_at', 'attendance_response_version'],
      v_booking.id::text,
      v_booking.booking_reference,
      'booking',
      'success',
      'pre-show-attendance'
    );
  end if;

  return query select
    v_booking.id,
    v_booking.booking_reference,
    v_changed,
    v_booking.attendance_response_version;
end;
$$;

revoke all on function public.record_booking_attendance_response(text, text)
  from public, anon, authenticated;
grant execute on function public.record_booking_attendance_response(text, text)
  to service_role;

comment on table public.booking_attendance_links is
  'Encrypted, expiring links for guest pre-show attendance responses.';
comment on function public.record_booking_attendance_response(text, text) is
  'Atomically records a guest attendance response without changing arrival, booking, seating, ticket or payment state.';

commit;
