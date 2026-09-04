alter table public.promo_codes
  alter column active set default false;

alter table public.promo_codes
  add column if not exists creation_source text null;

alter table public.promo_codes
  alter column creation_source set default 'migration_seed';

alter table public.promo_codes
  drop constraint if exists promo_codes_creation_source_check;

alter table public.promo_codes
  add constraint promo_codes_creation_source_check
  check (
    creation_source is null
    or creation_source in ('admin', 'migration_seed', 'system')
  );

create or replace function public.enforce_promo_activation_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.active := false;
    new.creation_source := coalesce(new.creation_source, 'migration_seed');
    return new;
  end if;

  if not old.active
     and new.active
     and coalesce(
       current_setting('zingara.promo_activation_authorized', true),
       'off'
     ) <> 'on' then
    raise exception 'PROMO_ACTIVATION_REQUIRES_AUTHORISED_ADMIN_ACTION'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists promo_codes_activation_guard on public.promo_codes;
create trigger promo_codes_activation_guard
  before insert or update of active on public.promo_codes
  for each row
  execute function public.enforce_promo_activation_guard();

create or replace function public.activate_promo_code(
  p_promo_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_location_scope text[];
  v_actor_name text;
  v_actor_role text;
  v_existing public.promo_codes%rowtype;
  v_updated public.promo_codes%rowtype;
begin
  select sp.full_name, r.name, sp.venue_scope
    into v_actor_name, v_actor_role, v_actor_location_scope
    from public.staff_profiles sp
    join public.roles r on r.id = sp.role_id
   where sp.id = p_actor_staff_profile_id
     and sp.user_id = p_actor_auth_user_id
     and sp.active
     and lower(trim(r.name)) = 'super admin'
   limit 1;

  if v_actor_name is null then
    raise exception 'PROMO_ACTIVATION_FORBIDDEN' using errcode = '42501';
  end if;

  select *
    into v_existing
    from public.promo_codes
   where id = p_promo_id
   for update;

  if v_existing.id is null then
    raise exception 'PROMO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_existing.active then
    return jsonb_build_object(
      'active', true,
      'id', v_existing.id,
      'status', 'already_active'
    );
  end if;

  perform set_config('zingara.promo_activation_authorized', 'on', true);

  update public.promo_codes
     set active = true,
         updated_by = p_actor_staff_profile_id
   where id = v_existing.id
  returning * into v_updated;

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
    'promo.enabled',
    p_actor_auth_user_id,
    coalesce(v_actor_location_scope, '{}'::text[]),
    v_actor_name,
    v_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'active', true,
      'code', v_updated.code,
      'creation_source', v_updated.creation_source,
      'source', 'authorised_admin_action'
    ),
    jsonb_build_object(
      'active', false,
      'code', v_existing.code,
      'creation_source', v_existing.creation_source
    ),
    array['active'],
    v_updated.id::text,
    v_updated.code,
    'promo-code',
    'success',
    'Explicit authorised Admin activation.',
    nullif(trim(p_request_id), ''),
    'settings',
    nullif(trim(p_user_agent), '')
  );

  return jsonb_build_object(
    'active', true,
    'id', v_updated.id,
    'status', 'activated'
  );
end;
$$;

revoke all on function public.activate_promo_code(
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.activate_promo_code(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
