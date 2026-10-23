-- P0: at most twenty active two-guest bookings may claim a two-seater
-- entitlement on one performance. Existing rows are preserved; the guard
-- applies only when a write would add a new qualifying entitlement.

create index if not exists bookings_active_two_seater_show_idx
  on public.bookings (show_id)
  where archived_at is null and guest_count = 2;

create or replace function public.enforce_two_seater_booking_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current_count integer;
  v_limit constant integer := 20;
  v_new_qualifies boolean;
  v_old_qualifies boolean := false;
begin
  v_new_qualifies :=
    new.archived_at is null
    and new.guest_count = 2
    and new.booking_status::text in (
      'new', 'confirmed', 'pending_payment', 'checked_in'
    );

  if not v_new_qualifies then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_qualifies :=
      old.archived_at is null
      and old.guest_count = 2
      and old.booking_status::text in (
        'new', 'confirmed', 'pending_payment', 'checked_in'
      );

    -- Existing qualifying bookings remain editable, including on performances
    -- that predate this rule. Only writes that add a new entitlement are gated.
    if v_old_qualifies and old.show_id = new.show_id then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('two-seater:' || new.show_id::text, 0)
  );

  select count(*)::integer
    into v_current_count
    from public.bookings booking
   where booking.show_id = new.show_id
     and booking.archived_at is null
     and booking.guest_count = 2
     and booking.booking_status::text in (
       'new', 'confirmed', 'pending_payment', 'checked_in'
     )
     and (tg_op = 'INSERT' or booking.id <> new.id);

  if v_current_count >= v_limit then
    raise exception using
      errcode = '23514',
      message = format(
        'TWO_SEATER_BOOKING_LIMIT_REACHED|%s|%s',
        v_limit,
        v_current_count
      );
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_two_seater_booking_limit_trigger
  on public.bookings;

create trigger enforce_two_seater_booking_limit_trigger
before insert or update of show_id, guest_count, booking_status, archived_at
on public.bookings
for each row
execute function public.enforce_two_seater_booking_limit();
