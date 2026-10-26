-- P0: permit an explicitly authorised Box Office exception to the two-seater
-- quota without weakening venue, zone, table, payment or ticket safeguards.

create table if not exists public.two_seater_limit_override_authorizations (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  show_id uuid not null references public.shows(id),
  reason text not null check (
    length(trim(reason)) between 3 and 500
  ),
  actor_auth_user_id uuid,
  actor_location_scope text[] not null default '{}'::text[],
  actor_name text,
  actor_role text not null check (
    actor_role in (
      'box-office',
      'box-office-manager',
      'box-office-staff',
      'super-admin'
    )
  ),
  actor_staff_profile_id uuid not null references public.staff_profiles(id),
  request_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  booking_id uuid references public.bookings(id)
);

create index if not exists two_seater_override_lookup_idx
  on public.two_seater_limit_override_authorizations (
    booking_reference,
    show_id,
    created_at desc
  )
  where consumed_at is null;

alter table public.two_seater_limit_override_authorizations
  enable row level security;

revoke all on public.two_seater_limit_override_authorizations
  from public, anon, authenticated;

grant select, insert, update on public.two_seater_limit_override_authorizations
  to service_role;

create or replace function public.enforce_two_seater_booking_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_count integer;
  v_limit constant integer := 20;
  v_new_qualifies boolean;
  v_old_qualifies boolean := false;
  v_override public.two_seater_limit_override_authorizations%rowtype;
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

  if v_current_count < v_limit then
    return new;
  end if;

  select candidate.*
    into v_override
    from public.two_seater_limit_override_authorizations candidate
   where candidate.booking_reference = new.booking_reference
     and candidate.show_id = new.show_id
     and candidate.consumed_at is null
     and candidate.expires_at >= now()
   order by candidate.created_at desc
   limit 1
   for update;

  if v_override.id is null then
    raise exception using
      errcode = '23514',
      message = format(
        'TWO_SEATER_BOOKING_LIMIT_REACHED|%s|%s',
        v_limit,
        v_current_count
      );
  end if;

  update public.two_seater_limit_override_authorizations
     set booking_id = new.id,
         consumed_at = clock_timestamp()
   where id = v_override.id
     and consumed_at is null;

  if not found then
    raise exception 'TWO_SEATER_OVERRIDE_ALREADY_CONSUMED';
  end if;

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
    'booking.two-seater-limit-override',
    v_override.actor_auth_user_id,
    v_override.actor_location_scope,
    v_override.actor_name,
    v_override.actor_role,
    v_override.actor_staff_profile_id,
    jsonb_build_object(
      'booking_reference', new.booking_reference,
      'show_id', new.show_id,
      'guest_count', new.guest_count,
      'two_seater_count_before', v_current_count,
      'two_seater_limit', v_limit,
      'override_authorization_id', v_override.id
    ),
    jsonb_build_object(
      'two_seater_count_before', v_current_count,
      'two_seater_limit', v_limit
    ),
    array['two_seater_limit'],
    new.id::text,
    new.booking_reference,
    'booking',
    'success',
    v_override.reason,
    v_override.request_id,
    'Bookings',
    v_override.user_agent
  );

  return new;
end;
$$;

revoke all on function public.enforce_two_seater_booking_limit()
  from public, anon, authenticated;
