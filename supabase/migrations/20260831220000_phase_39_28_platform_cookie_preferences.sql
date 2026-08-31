create table if not exists public.platform_preferences (
  preference_key text primary key,
  revision integer not null default 1 check (revision > 0),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_preferences enable row level security;

revoke all on public.platform_preferences from anon, authenticated;
grant select, insert, update on public.platform_preferences to service_role;

create or replace function public.save_platform_preference_atomic(
  p_preference_key text,
  p_config jsonb,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_changed_fields text[],
  p_consent_version_reset boolean,
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
  v_revision integer;
begin
  if p_preference_key <> 'cookie_privacy' then
    raise exception 'Unsupported platform preference key';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Platform preference configuration must be an object';
  end if;

  select *
    into v_existing
    from public.platform_preferences
   where preference_key = p_preference_key
   for update;

  v_revision := coalesce(v_existing.revision, 0) + 1;

  insert into public.platform_preferences (
    preference_key,
    revision,
    config,
    updated_by_staff_profile_id,
    updated_at
  ) values (
    p_preference_key,
    v_revision,
    p_config,
    p_actor_staff_profile_id,
    now()
  )
  on conflict (preference_key) do update
    set revision = excluded.revision,
        config = excluded.config,
        updated_by_staff_profile_id = excluded.updated_by_staff_profile_id,
        updated_at = excluded.updated_at;

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
    case
      when p_consent_version_reset then 'platform.cookie_consent_version_reset'
      else 'platform.cookie_privacy_updated'
    end,
    p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]),
    p_actor_name,
    p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('revision', v_revision, 'config', p_config),
    jsonb_build_object(
      'revision', coalesce(v_existing.revision, 0),
      'config', coalesce(v_existing.config, '{}'::jsonb)
    ),
    coalesce(p_changed_fields, '{}'::text[]),
    p_preference_key,
    p_preference_key,
    'platform_preference',
    'success',
    case
      when p_consent_version_reset then 'Returning visitors must review cookie preferences again.'
      else 'Cookie & Privacy configuration saved.'
    end,
    p_request_id,
    'System Preferences',
    p_user_agent
  );

  return jsonb_build_object(
    'preference_key', p_preference_key,
    'revision', v_revision,
    'config', p_config
  );
end;
$$;

revoke all on function public.save_platform_preference_atomic(
  text,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text[],
  text[],
  boolean,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.save_platform_preference_atomic(
  text,
  jsonb,
  uuid,
  uuid,
  text,
  text,
  text[],
  text[],
  boolean,
  text,
  text
) to service_role;
