begin;

alter table public.workflow_configurations
  drop constraint if exists workflow_configurations_workflow_key_check,
  add constraint workflow_configurations_workflow_key_check check (
    workflow_key in (
      'pre_show_reminder',
      'post_show_review',
      'secret_guest_list_customer_acknowledgement',
      'standard_waitlist_customer_acknowledgement',
      'secret_guest_list_feature'
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
  'secret_guest_list_feature',
  false,
  1,
  null,
  'The Secret Guest List',
  'Controls the public Secret Guest List invitation and submission workflow.',
  null,
  null
)
on conflict (workflow_key) do update
set enabled = false,
    activated_at = null,
    updated_at = clock_timestamp();

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

  if p_source = 'secret-guest-list' and not coalesce((
    select configuration.enabled
    from public.workflow_configurations configuration
    where configuration.workflow_key = 'secret_guest_list_feature'
  ), false) then
    raise exception 'The Secret Guest List is currently unavailable';
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

comment on function public.create_public_waitlist_entry(uuid,text,text,text,text,integer,text,text,jsonb) is
  'Atomically creates standard Waitlist entries and feature-gated Secret Guest List entries without changing booking availability.';

commit;
