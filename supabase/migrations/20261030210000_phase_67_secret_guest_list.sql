-- Phase 67: customer-facing sold-out enquiries through the existing Waitlist.

alter table public.staff_email_subscriptions
  drop constraint if exists staff_email_subscriptions_key_check,
  add constraint staff_email_subscriptions_key_check check (
    notification_key in ('daily-booking-review','secret-guest-list')
  );

alter table public.management_email_notification_routes
  drop constraint if exists management_email_notification_routes_key_check,
  add constraint management_email_notification_routes_key_check check (
    notification_key in (
      'corporate-enquiry',
      'new-review-alert',
      'invoice-request-reminders',
      'secret-guest-list'
    )
  );

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
    'e8598359-54a0-4e1f-a635-1ec8ae02cb78'::uuid,
    'a021d26b-3a16-46b5-b184-6f33e58d1884'::uuid,
    'eb6ce1ab-50c8-415a-a858-23ad58300ad8'::uuid
  ];
  v_count integer;
begin
  select count(*) into v_count
  from public.staff_profiles
  where id = any(v_to || v_cc)
    and active = true
    and nullif(trim(email), '') is not null;

  if v_count <> 8 then
    raise exception 'All eight authoritative Secret Guest List recipients must be active and have configured email addresses';
  end if;

  insert into public.management_email_notification_routes (
    notification_key,
    enabled,
    to_staff_profile_ids,
    cc_staff_profile_ids
  ) values (
    'secret-guest-list',
    true,
    v_to,
    v_cc
  )
  on conflict (notification_key) do update
  set enabled = excluded.enabled,
      to_staff_profile_ids = excluded.to_staff_profile_ids,
      cc_staff_profile_ids = excluded.cc_staff_profile_ids,
      updated_at = clock_timestamp();
end
$$;

create or replace function public.create_secret_guest_list_entry(
  p_show_id uuid,
  p_first_name text,
  p_surname text,
  p_email text,
  p_mobile text,
  p_guest_count integer,
  p_entry_metadata jsonb
)
returns table (
  waitlist_entry_id uuid,
  customer_id uuid,
  was_created boolean,
  entry_metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_mobile text := trim(coalesce(p_mobile, ''));
  v_mobile_digits text := regexp_replace(v_mobile, '\D', '', 'g');
  v_customer_id uuid;
  v_existing public.waitlist_entries%rowtype;
  v_entry_id uuid;
  v_metadata_prefix constant text := '__zingara_waitlist_meta__:';
begin
  if p_show_id is null
    or nullif(trim(p_first_name), '') is null
    or nullif(trim(p_surname), '') is null
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_mobile_digits) < 7
    or p_guest_count < 1
    or p_guest_count >= 20
  then
    raise exception 'Complete all required Secret Guest List details';
  end if;

  if not exists (select 1 from public.shows where id = p_show_id) then
    raise exception 'The selected performance is unavailable';
  end if;

  -- Contact-scoped transaction locks prevent concurrent duplicate submissions
  -- without rewriting or constraining historical Waitlist records.
  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text || ':email:' || v_email, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text || ':mobile:' || v_mobile_digits, 0));

  select waitlist.* into v_existing
  from public.waitlist_entries waitlist
  join public.customers customer on customer.id = waitlist.customer_id
  where waitlist.show_id = p_show_id
    and waitlist.status in ('active', 'contacted')
    and (
      lower(coalesce(customer.email, '')) = v_email
      or regexp_replace(coalesce(customer.mobile, ''), '\D', '', 'g') = v_mobile_digits
    )
  order by waitlist.created_at asc
  limit 1;

  if v_existing.id is not null then
    begin
      entry_metadata := substring(
        v_existing.notes
        from length(v_metadata_prefix) + 1
      )::jsonb;
    exception when others then
      entry_metadata := p_entry_metadata;
    end;

    waitlist_entry_id := v_existing.id;
    customer_id := v_existing.customer_id;
    was_created := false;
    return next;
    return;
  end if;

  select customer.id into v_customer_id
  from public.customers customer
  where lower(coalesce(customer.email, '')) = v_email
     or regexp_replace(coalesce(customer.mobile, ''), '\D', '', 'g') = v_mobile_digits
  order by case when lower(coalesce(customer.email, '')) = v_email then 0 else 1 end,
           customer.created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      first_name,
      surname,
      email,
      mobile,
      preferences,
      relationship_notes,
      dietary_requirements
    ) values (
      trim(p_first_name),
      trim(p_surname),
      v_email,
      v_mobile,
      jsonb_build_object(
        'customerKey', coalesce(nullif(v_email, ''), nullif(v_mobile_digits, '')),
        'vipTags', jsonb_build_array()
      ),
      '',
      null
    )
    returning id into v_customer_id;
  end if;

  insert into public.waitlist_entries (
    customer_id,
    show_id,
    guest_count,
    status,
    notes
  ) values (
    v_customer_id,
    p_show_id,
    p_guest_count,
    'active',
    v_metadata_prefix || p_entry_metadata::text
  )
  returning id into v_entry_id;

  waitlist_entry_id := v_entry_id;
  customer_id := v_customer_id;
  was_created := true;
  entry_metadata := p_entry_metadata;
  return next;
end
$$;

revoke all on function public.create_secret_guest_list_entry(uuid,text,text,text,text,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_secret_guest_list_entry(uuid,text,text,text,text,integer,jsonb)
  to service_role;

comment on function public.create_secret_guest_list_entry(uuid,text,text,text,text,integer,jsonb) is
  'Atomically creates a public Secret Guest List enquiry in the existing Waitlist or returns the existing active/contacted request for that show and contact.';
