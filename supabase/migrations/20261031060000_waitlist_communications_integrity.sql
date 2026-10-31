begin;

alter table public.workflow_configurations
  drop constraint if exists workflow_configurations_workflow_key_check,
  add constraint workflow_configurations_workflow_key_check check (
    workflow_key in (
      'pre_show_reminder',
      'post_show_review',
      'secret_guest_list_customer_acknowledgement',
      'standard_waitlist_customer_acknowledgement'
    )
  );

insert into public.workflow_configurations (
  workflow_key,
  enabled,
  timing_offset_days,
  activated_at,
  subject,
  body,
  cape_town_review_url,
  johannesburg_review_url
) values (
  'standard_waitlist_customer_acknowledgement',
  true,
  1,
  clock_timestamp(),
  'You''re on Zingara''s Waitlist!',
  'Transactional acknowledgement for a successfully accepted standard Waitlist enquiry.',
  null,
  null
)
on conflict (workflow_key) do update
set enabled = true,
    activated_at = coalesce(public.workflow_configurations.activated_at, clock_timestamp()),
    subject = excluded.subject,
    body = excluded.body,
    updated_at = clock_timestamp();

alter table public.staff_email_subscriptions
  drop constraint if exists staff_email_subscriptions_key_check,
  add constraint staff_email_subscriptions_key_check check (
    notification_key in (
      'daily-booking-review',
      'secret-guest-list',
      'new-waitlist-enquiry',
      'daily-waitlist-reminder'
    )
  );

alter table public.management_email_notification_routes
  drop constraint if exists management_email_notification_routes_key_check,
  add constraint management_email_notification_routes_key_check check (
    notification_key in (
      'corporate-enquiry',
      'new-review-alert',
      'invoice-request-reminders',
      'secret-guest-list',
      'new-waitlist-enquiry',
      'daily-waitlist-reminder'
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
  v_verified integer;
begin
  select count(*) into v_verified
  from public.staff_profiles
  where id = any(v_to || v_cc)
    and active = true
    and nullif(trim(email), '') is not null;

  if v_verified <> 8 then
    raise exception 'All eight authoritative Waitlist recipients must be active and have configured email addresses';
  end if;

  insert into public.management_email_notification_routes (
    notification_key,
    enabled,
    to_staff_profile_ids,
    cc_staff_profile_ids
  ) values
    ('new-waitlist-enquiry', true, v_to, v_cc),
    ('daily-waitlist-reminder', true, v_to, v_cc)
  on conflict (notification_key) do update
  set enabled = excluded.enabled,
      to_staff_profile_ids = excluded.to_staff_profile_ids,
      cc_staff_profile_ids = excluded.cc_staff_profile_ids,
      updated_at = clock_timestamp();
end
$$;

create or replace function public.create_public_waitlist_entry(
  p_show_id uuid,
  p_first_name text,
  p_surname text,
  p_email text,
  p_mobile text,
  p_guest_count integer,
  p_desired_section text,
  p_source text,
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
  v_first_name text := trim(coalesce(p_first_name, ''));
  v_surname text := trim(coalesce(p_surname, ''));
  v_customer_id uuid;
  v_existing public.waitlist_entries%rowtype;
  v_entry_id uuid;
  v_metadata_prefix constant text := '__zingara_waitlist_meta__:';
begin
  if p_show_id is null
    or p_source not in ('waitlist', 'secret-guest-list')
    or nullif(v_first_name, '') is null
    or (p_source = 'secret-guest-list' and nullif(v_surname, '') is null)
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_mobile_digits) < 7
    or p_guest_count < 1
    or p_guest_count >= 20
  then
    raise exception 'Complete all required Waitlist details';
  end if;

  if not exists (select 1 from public.shows where id = p_show_id) then
    raise exception 'The selected performance is unavailable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_show_id::text || ':email:' || v_email, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(p_show_id::text || ':mobile:' || v_mobile_digits, 0)
  );

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
      v_first_name,
      nullif(v_surname, ''),
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
    desired_section,
    guest_count,
    status,
    notes
  ) values (
    v_customer_id,
    p_show_id,
    nullif(trim(coalesce(p_desired_section, '')), ''),
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

revoke all on function public.create_public_waitlist_entry(uuid,text,text,text,text,integer,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_public_waitlist_entry(uuid,text,text,text,text,integer,text,text,jsonb)
  to service_role;

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
language sql
security definer
set search_path = public
as $$
  select *
  from public.create_public_waitlist_entry(
    p_show_id,
    p_first_name,
    p_surname,
    p_email,
    p_mobile,
    p_guest_count,
    null,
    'secret-guest-list',
    p_entry_metadata
  );
$$;

revoke all on function public.create_secret_guest_list_entry(uuid,text,text,text,text,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_secret_guest_list_entry(uuid,text,text,text,text,integer,jsonb)
  to service_role;

create unique index if not exists communications_daily_waitlist_reminder_once_uidx
  on public.communications (batch_id, type, channel, subject)
  where type = 'custom_message'
    and channel = 'email'
    and subject = 'Zingara Box Office — Your Daily Guest List'
    and status in ('sending', 'sent', 'suppressed');

create unique index if not exists communications_standard_waitlist_ack_once_uidx
  on public.communications (
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(show_id, '00000000-0000-0000-0000-000000000000'::uuid),
    type,
    channel,
    subject
  )
  where type = 'custom_message'
    and channel = 'email'
    and subject = 'You''re on Zingara''s Waitlist!'
    and status in ('sending', 'sent', 'suppressed');

comment on function public.create_public_waitlist_entry(uuid,text,text,text,text,integer,text,text,jsonb) is
  'Atomically creates either public Waitlist source or returns the existing actionable enquiry for the same performance and contact.';
comment on index public.communications_daily_waitlist_reminder_once_uidx is
  'Prevents duplicate daily Waitlist reminder Communications records during concurrent or repeated workflow execution.';
comment on index public.communications_standard_waitlist_ack_once_uidx is
  'Prevents duplicate standard Waitlist customer acknowledgements during retries and repeated submissions.';

commit;
