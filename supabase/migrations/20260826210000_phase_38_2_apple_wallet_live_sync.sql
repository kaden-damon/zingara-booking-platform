-- Phase 38.2: Apple Wallet device registrations and monotonic pass updates.
-- Ticket, booking, QR, and show identities remain authoritative and unchanged.

create sequence if not exists public.apple_wallet_update_sequence;

create table if not exists public.apple_wallet_devices (
  id uuid primary key default gen_random_uuid(),
  device_library_identifier text not null unique,
  push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apple_wallet_device_identifier_check
    check (
      length(device_library_identifier) between 1 and 255
      and device_library_identifier ~ '^[A-Za-z0-9._-]+$'
    ),
  constraint apple_wallet_push_token_check
    check (
      length(push_token) between 32 and 256
      and push_token ~ '^[A-Fa-f0-9]+$'
    )
);

create table if not exists public.apple_wallet_pass_state (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  update_tag bigint not null default nextval('public.apple_wallet_update_sequence'),
  updated_at timestamptz not null default now()
);

create table if not exists public.apple_wallet_registrations (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.apple_wallet_devices(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  pass_type_identifier text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apple_wallet_registration_unique
    unique (device_id, ticket_id, pass_type_identifier)
);

create index if not exists apple_wallet_registrations_ticket_idx
  on public.apple_wallet_registrations(ticket_id);

create index if not exists apple_wallet_pass_state_update_idx
  on public.apple_wallet_pass_state(update_tag);

create or replace function public.bump_apple_wallet_pass_state(
  p_ticket_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer := 0;
begin
  if coalesce(cardinality(p_ticket_ids), 0) = 0 then
    return 0;
  end if;

  update public.apple_wallet_pass_state state
     set update_tag = nextval('public.apple_wallet_update_sequence'),
         updated_at = clock_timestamp()
   where state.ticket_id = any(p_ticket_ids);

  get diagnostics v_changed = row_count;
  return v_changed;
end
$$;

create or replace function public.apple_wallet_ticket_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_apple_wallet_pass_state(array[new.id]);
  return new;
end
$$;

create or replace function public.apple_wallet_booking_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_apple_wallet_pass_state(
    array(
      select ticket.id
        from public.tickets ticket
       where ticket.booking_id = new.id
    )
  );
  return new;
end
$$;

create or replace function public.apple_wallet_show_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bump_apple_wallet_pass_state(
    array(
      select ticket.id
        from public.tickets ticket
        join public.bookings booking on booking.id = ticket.booking_id
       where booking.show_id = new.id
    )
  );
  return new;
end
$$;

drop trigger if exists apple_wallet_ticket_change on public.tickets;
create trigger apple_wallet_ticket_change
after update of ticket_status on public.tickets
for each row
when (old.ticket_status is distinct from new.ticket_status)
execute function public.apple_wallet_ticket_change_trigger();

drop trigger if exists apple_wallet_booking_change on public.bookings;
create trigger apple_wallet_booking_change
after update of booking_status, payment_status, section, table_id, show_id on public.bookings
for each row
when (
  old.booking_status is distinct from new.booking_status
  or old.payment_status is distinct from new.payment_status
  or old.section is distinct from new.section
  or old.table_id is distinct from new.table_id
  or old.show_id is distinct from new.show_id
)
execute function public.apple_wallet_booking_change_trigger();

drop trigger if exists apple_wallet_show_change on public.shows;
create trigger apple_wallet_show_change
after update of name, date, time, venue, status on public.shows
for each row
when (
  old.name is distinct from new.name
  or old.date is distinct from new.date
  or old.time is distinct from new.time
  or old.venue is distinct from new.venue
  or old.status is distinct from new.status
)
execute function public.apple_wallet_show_change_trigger();

alter table public.apple_wallet_devices enable row level security;
alter table public.apple_wallet_registrations enable row level security;
alter table public.apple_wallet_pass_state enable row level security;

revoke all on public.apple_wallet_devices from anon, authenticated;
revoke all on public.apple_wallet_registrations from anon, authenticated;
revoke all on public.apple_wallet_pass_state from anon, authenticated;
revoke all on sequence public.apple_wallet_update_sequence from anon, authenticated;
revoke all on function public.bump_apple_wallet_pass_state(uuid[]) from public, anon, authenticated;
grant execute on function public.bump_apple_wallet_pass_state(uuid[]) to service_role;
