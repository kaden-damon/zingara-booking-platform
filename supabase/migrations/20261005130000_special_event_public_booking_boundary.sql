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

  if v_show_status is null or v_show_status <> 'active' then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;
end;
$$;

revoke all on function public.assert_new_public_booking_show_available(uuid, jsonb)
  from public, anon, authenticated;
