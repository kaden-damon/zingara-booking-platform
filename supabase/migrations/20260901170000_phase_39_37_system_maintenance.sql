create table if not exists public.maintenance_booking_enquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('MBE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  mobile text not null check (length(trim(mobile)) between 7 and 40),
  email text not null check (length(trim(email)) between 5 and 254),
  preferred_city text not null check (preferred_city in ('Cape Town', 'Johannesburg')),
  preferred_show_date text,
  pax integer not null check (pax between 1 and 500),
  seating_preference text,
  notes text,
  status text not null default 'new' check (status in ('new', 'contacted', 'resolved')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null
);

create index if not exists maintenance_booking_enquiries_status_submitted_idx
  on public.maintenance_booking_enquiries (status, submitted_at desc);

alter table public.maintenance_booking_enquiries enable row level security;
revoke all on public.maintenance_booking_enquiries from anon, authenticated;
grant select, insert, update on public.maintenance_booking_enquiries to service_role;

create or replace function public.save_system_maintenance_atomic(
  p_config jsonb,
  p_expected_revision integer,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_request_id text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.platform_preferences%rowtype;
  v_previous jsonb;
  v_next jsonb;
  v_revision integer;
  v_now timestamptz := now();
  v_staff_changed boolean;
  v_public_changed boolean;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Maintenance configuration must be an object';
  end if;

  perform pg_advisory_xact_lock(hashtext('system_maintenance'));

  select * into v_existing
    from public.platform_preferences
   where preference_key = 'system_maintenance'
   for update;

  if coalesce(v_existing.revision, 0) <> coalesce(p_expected_revision, 0) then
    raise exception 'STALE_MAINTENANCE_REVISION';
  end if;

  v_previous := coalesce(v_existing.config, '{"staff":{"enabled":false},"public":{"enabled":false}}'::jsonb);
  v_next := p_config;
  v_staff_changed := coalesce((v_previous #>> '{staff,enabled}')::boolean, false)
    is distinct from coalesce((v_next #>> '{staff,enabled}')::boolean, false);
  v_public_changed := coalesce((v_previous #>> '{public,enabled}')::boolean, false)
    is distinct from coalesce((v_next #>> '{public,enabled}')::boolean, false);

  if coalesce((v_next #>> '{staff,enabled}')::boolean, false) then
    if v_staff_changed or nullif(v_next #>> '{staff,enabledAt}', '') is null then
      v_next := jsonb_set(v_next, '{staff,enabledAt}', to_jsonb(v_now::text), true);
      v_next := jsonb_set(v_next, '{staff,enabledBy}', to_jsonb(coalesce(p_actor_name, 'Super Admin')), true);
    else
      v_next := jsonb_set(v_next, '{staff,enabledAt}', coalesce(v_previous #> '{staff,enabledAt}', 'null'::jsonb), true);
      v_next := jsonb_set(v_next, '{staff,enabledBy}', coalesce(v_previous #> '{staff,enabledBy}', 'null'::jsonb), true);
    end if;
  else
    v_next := jsonb_set(v_next, '{staff,enabledAt}', 'null'::jsonb, true);
    v_next := jsonb_set(v_next, '{staff,enabledBy}', 'null'::jsonb, true);
  end if;

  if coalesce((v_next #>> '{public,enabled}')::boolean, false) then
    if v_public_changed or nullif(v_next #>> '{public,enabledAt}', '') is null then
      v_next := jsonb_set(v_next, '{public,enabledAt}', to_jsonb(v_now::text), true);
      v_next := jsonb_set(v_next, '{public,enabledBy}', to_jsonb(coalesce(p_actor_name, 'Super Admin')), true);
    else
      v_next := jsonb_set(v_next, '{public,enabledAt}', coalesce(v_previous #> '{public,enabledAt}', 'null'::jsonb), true);
      v_next := jsonb_set(v_next, '{public,enabledBy}', coalesce(v_previous #> '{public,enabledBy}', 'null'::jsonb), true);
    end if;
  else
    v_next := jsonb_set(v_next, '{public,enabledAt}', 'null'::jsonb, true);
    v_next := jsonb_set(v_next, '{public,enabledBy}', 'null'::jsonb, true);
  end if;

  v_revision := coalesce(v_existing.revision, 0) + 1;

  insert into public.platform_preferences (
    preference_key, revision, config, updated_by_staff_profile_id, updated_at
  ) values (
    'system_maintenance', v_revision, v_next, p_actor_staff_profile_id, v_now
  )
  on conflict (preference_key) do update set
    revision = excluded.revision,
    config = excluded.config,
    updated_by_staff_profile_id = excluded.updated_by_staff_profile_id,
    updated_at = excluded.updated_at;

  if v_staff_changed then
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, request_id,
      source_area, user_agent
    ) values (
      case when (v_next #>> '{staff,enabled}')::boolean
        then 'platform.staff_maintenance_enabled'
        else 'platform.staff_maintenance_disabled' end,
      p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'::text[]),
      p_actor_name, p_actor_role, p_actor_staff_profile_id,
      v_next -> 'staff', v_previous -> 'staff', array['enabled', 'message'],
      'staff', 'STAFF MAINTENANCE', 'platform_maintenance', 'success',
      v_next #>> '{staff,message}', p_request_id, 'System Operations', p_user_agent
    );
  end if;

  if v_public_changed then
    insert into public.audit_events (
      action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
      actor_staff_profile_id, after_values, before_values, changed_fields,
      entity_id, entity_reference, entity_type, outcome, reason, request_id,
      source_area, user_agent
    ) values (
      case when (v_next #>> '{public,enabled}')::boolean
        then 'platform.public_maintenance_enabled'
        else 'platform.public_maintenance_disabled' end,
      p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'::text[]),
      p_actor_name, p_actor_role, p_actor_staff_profile_id,
      v_next -> 'public', v_previous -> 'public',
      array['enabled', 'scope', 'heading', 'message', 'contactEmail', 'enquiryFormEnabled'],
      'public', 'PUBLIC MAINTENANCE', 'platform_maintenance', 'success',
      v_next #>> '{public,message}', p_request_id, 'System Operations', p_user_agent
    );
  end if;

  return jsonb_build_object('config', v_next, 'revision', v_revision);
end;
$$;

revoke all on function public.save_system_maintenance_atomic(
  jsonb, integer, uuid, uuid, text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.save_system_maintenance_atomic(
  jsonb, integer, uuid, uuid, text, text, text[], text, text
) to service_role;
