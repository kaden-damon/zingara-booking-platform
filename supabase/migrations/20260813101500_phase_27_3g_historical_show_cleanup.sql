do $$
declare
  v_old_show_id constant uuid := 'cabacbf5-75f3-448b-9f28-0892c6a13b6f';
  v_target_show_id constant uuid := 'ee39b879-7d7d-4777-9f25-4522d074c3b5';
  v_booking_id constant uuid := '268aa3be-9d11-4489-a1f3-39882a7cba5b';
  v_promo_redemption_id constant uuid := '4060aa0c-2d2e-4969-a257-938088a0f4fb';
  v_legacy_show_ids constant uuid[] := array[
    'cabacbf5-75f3-448b-9f28-0892c6a13b6f',
    '4ea65dcc-9fc1-40b4-9066-349270df6fc7',
    '20266eee-7bfb-4e4c-a1cc-487169e28c56'
  ]::uuid[];
  v_blocking_count integer;
begin
  update public.communications
     set show_id = v_target_show_id
   where id in (
     '59a55caa-9326-408d-8ca3-74670e35c716'::uuid,
     'ce7cee47-cbe6-4e6a-8b6b-202814815623'::uuid
   )
     and booking_id = v_booking_id
     and show_id = v_old_show_id;

  update public.promo_redemptions
     set show_id = v_target_show_id
   where id = v_promo_redemption_id
     and booking_id = v_booking_id
     and booking_reference = 'ZNG-UE55BH'
     and show_id = v_old_show_id;

  select count(*)
    into v_blocking_count
    from public.bookings
   where show_id = any(v_legacy_show_ids);

  if v_blocking_count <> 0 then
    raise exception 'Legacy show cleanup blocked: % bookings still reference obsolete shows', v_blocking_count;
  end if;

  select count(*)
    into v_blocking_count
    from public.communications
   where show_id = any(v_legacy_show_ids);

  if v_blocking_count <> 0 then
    raise exception 'Legacy show cleanup blocked: % communications still reference obsolete shows', v_blocking_count;
  end if;

  select count(*)
    into v_blocking_count
    from public.promo_redemptions
   where show_id = any(v_legacy_show_ids);

  if v_blocking_count <> 0 then
    raise exception 'Legacy show cleanup blocked: % promo redemptions still reference obsolete shows', v_blocking_count;
  end if;

  delete from public.shows
   where id = any(v_legacy_show_ids)
     and venue = 'johannesburg'
     and date in ('2026-09-02'::date, '2026-09-03'::date, '2026-09-04'::date)
     and left(time::text, 5) = '17:00';
end $$;
