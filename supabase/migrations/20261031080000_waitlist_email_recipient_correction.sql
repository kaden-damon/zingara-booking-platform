begin;

do $$
declare
  v_to uuid[] := array[
    'bb58fd74-5995-4544-803a-6baaf0ec129b'::uuid,
    '92edf75d-06bf-4d40-a142-52b2862a3795'::uuid,
    '3ac09b59-fc3f-4c6d-9bb3-8dd47a077188'::uuid,
    'd185b639-054d-4c4f-8f6b-3c1e6fc205af'::uuid,
    'fe8dff17-a040-4296-afa1-49c058d070f4'::uuid
  ];
  v_cc uuid[] := array[
    'e8598359-54a0-4e1f-a635-1ec8ae02cb78'::uuid
  ];
  v_recipient_count integer;
  v_route_count integer;
begin
  select count(*) into v_recipient_count
  from public.staff_profiles
  where id = any(v_to || v_cc)
    and active = true
    and nullif(trim(email), '') is not null;

  if v_recipient_count <> 6 then
    raise exception 'All six authoritative Waitlist recipients must be active and have configured email addresses';
  end if;

  update public.management_email_notification_routes
  set to_staff_profile_ids = v_to,
      cc_staff_profile_ids = v_cc,
      updated_at = clock_timestamp()
  where notification_key in (
    'secret-guest-list',
    'new-waitlist-enquiry',
    'daily-waitlist-reminder'
  );

  get diagnostics v_route_count = row_count;
  if v_route_count <> 3 then
    raise exception 'All three Waitlist staff email routes must exist before recipient correction';
  end if;
end
$$;

commit;
