create or replace function public.assert_new_public_booking_show_available(
  p_show_id uuid,
  p_booking_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_show_status text;
  v_is_public_booking boolean;
begin
  v_is_public_booking :=
    coalesce(p_booking_payload ->> 'booking_origin', '') = 'customer_public'
    or (
      nullif(p_booking_payload ->> 'booking_origin', '') is null
      and coalesce(p_booking_payload ->> 'booking_source', 'online') = 'online'
    );

  if not v_is_public_booking then
    return;
  end if;

  select status::text
    into v_show_status
    from public.shows
   where id = p_show_id
   for update;

  if v_show_status is null
     or v_show_status not in ('active', 'special_event') then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;
end;
$$;

revoke all on function public.assert_new_public_booking_show_available(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_new_public_booking_show_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_new_public_booking_show_available(
    new.show_id,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists bookings_public_show_available_guard on public.bookings;
create trigger bookings_public_show_available_guard
  before insert on public.bookings
  for each row execute function public.enforce_new_public_booking_show_available();

alter function public.reserve_public_booking_entitlement(uuid, jsonb, jsonb)
  rename to reserve_public_booking_entitlement_unguarded_41_2y;

revoke all on function public.reserve_public_booking_entitlement_unguarded_41_2y(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function public.reserve_public_booking_entitlement(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.bookings
     where booking_reference = p_booking_payload ->> 'booking_reference'
  ) then
    perform public.assert_new_public_booking_show_available(
      p_show_id,
      p_booking_payload
    );
  end if;

  return public.reserve_public_booking_entitlement_unguarded_41_2y(
    p_show_id,
    p_booking_payload,
    p_payment_payload
  );
end;
$$;

revoke all on function public.reserve_public_booking_entitlement(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_public_booking_entitlement(uuid, jsonb, jsonb)
  to service_role;

alter function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb)
  rename to reserve_public_booking_table_unguarded_41_2y;

revoke all on function public.reserve_public_booking_table_unguarded_41_2y(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function public.reserve_public_booking_table(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_table_claims jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.bookings
     where booking_reference = p_booking_payload ->> 'booking_reference'
  ) then
    perform public.assert_new_public_booking_show_available(
      p_show_id,
      p_booking_payload
    );
  end if;

  return public.reserve_public_booking_table_unguarded_41_2y(
    p_show_id,
    p_booking_payload,
    p_payment_payload,
    p_table_claims
  );
end;
$$;

revoke all on function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb)
  to service_role;
