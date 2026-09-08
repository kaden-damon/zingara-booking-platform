create table if not exists public.admin_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  actor_auth_user_id uuid not null,
  actor_name text not null,
  actor_email text not null,
  policy_key text not null,
  policy_title text not null,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (actor_auth_user_id, policy_key, policy_version)
);

create index if not exists admin_policy_acceptances_staff_policy_idx
  on public.admin_policy_acceptances (staff_profile_id, policy_key, policy_version)
  where staff_profile_id is not null;

alter table public.admin_policy_acceptances enable row level security;
revoke all on public.admin_policy_acceptances from public, anon, authenticated;
grant select, insert on public.admin_policy_acceptances to service_role;

create or replace function public.audit_admin_policy_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_scope text[] := '{}';
begin
  select roles.name, staff_profiles.venue_scope
    into v_role, v_scope
  from public.staff_profiles
  left join public.roles on roles.id = staff_profiles.role_id
  where staff_profiles.id = new.staff_profile_id;

  insert into public.audit_events (
    actor_staff_profile_id,
    actor_auth_user_id,
    actor_name,
    actor_role,
    actor_location_scope,
    action,
    entity_type,
    entity_reference,
    entity_id,
    outcome,
    source_area,
    reason,
    after_values,
    changed_fields
  ) values (
    new.staff_profile_id,
    new.actor_auth_user_id,
    new.actor_name,
    v_role,
    coalesce(v_scope, '{}'),
    'admin.ip-undertaking.accepted',
    'security',
    new.policy_version,
    new.id::text,
    'success',
    'Admin Access',
    'Current Admin platform use and access terms accepted.',
    jsonb_build_object(
      'acceptedAt', new.accepted_at,
      'policyVersion', new.policy_version
    ),
    array['acceptedAt', 'policyVersion']
  );

  return new;
end;
$$;

drop trigger if exists admin_policy_acceptances_audit on public.admin_policy_acceptances;
create trigger admin_policy_acceptances_audit
  after insert on public.admin_policy_acceptances
  for each row execute function public.audit_admin_policy_acceptance();

create or replace function public.prevent_admin_policy_acceptance_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_policy_acceptances are append-only';
end;
$$;

drop trigger if exists admin_policy_acceptances_no_update on public.admin_policy_acceptances;
create trigger admin_policy_acceptances_no_update
  before update on public.admin_policy_acceptances
  for each row execute function public.prevent_admin_policy_acceptance_mutation();

drop trigger if exists admin_policy_acceptances_no_delete on public.admin_policy_acceptances;
create trigger admin_policy_acceptances_no_delete
  before delete on public.admin_policy_acceptances
  for each row execute function public.prevent_admin_policy_acceptance_mutation();
