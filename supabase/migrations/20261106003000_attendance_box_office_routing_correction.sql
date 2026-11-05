begin;

do $$
declare
  v_to uuid[];
begin
  select array_agg(id order by full_name)
  into v_to
  from public.staff_profiles
  where active = true
    and lower(email) in (
      'lisa@zingara.co.za',
      'michael@zingara.co.za',
      'rasmus@zingara.co.za',
      'sharonricketts@zingara.co.za'
    );

  if coalesce(cardinality(v_to), 0) <> 4 then
    raise exception 'All four configured Box Office attendance recipients must be active';
  end if;

  update public.management_email_notification_routes
  set
    enabled = true,
    to_staff_profile_ids = v_to,
    cc_staff_profile_ids = '{}'::uuid[],
    updated_at = now()
  where notification_key = 'attendance-confirmations';

  if not found then
    raise exception 'Attendance Confirmations route is missing';
  end if;
end
$$;

commit;
