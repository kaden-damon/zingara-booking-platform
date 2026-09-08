create table if not exists public.platform_owner_bindings (
  staff_profile_id uuid primary key references public.staff_profiles(id) on delete restrict,
  auth_user_id uuid not null unique,
  authority text not null default 'platform-owner'
    check (authority = 'platform-owner'),
  binding_reference text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_owner_bindings enable row level security;
revoke all on public.platform_owner_bindings from public, anon, authenticated, service_role;
grant select on public.platform_owner_bindings to service_role;

create or replace function public.prevent_platform_owner_binding_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_owner_bindings are technical governance configuration';
end;
$$;

drop trigger if exists platform_owner_bindings_no_update on public.platform_owner_bindings;
create trigger platform_owner_bindings_no_update
  before update on public.platform_owner_bindings
  for each row execute function public.prevent_platform_owner_binding_mutation();

drop trigger if exists platform_owner_bindings_no_delete on public.platform_owner_bindings;
create trigger platform_owner_bindings_no_delete
  before delete on public.platform_owner_bindings
  for each row execute function public.prevent_platform_owner_binding_mutation();

do $$
declare
  v_staff_count integer;
begin
  select count(*)::integer
    into v_staff_count
  from public.staff_profiles
  where id = 'e8598359-54a0-4e1f-a635-1ec8ae02cb78'::uuid
    and user_id = '1f8b62f8-cac9-4cf7-927d-945d96a302ce'::uuid;

  if v_staff_count <> 1 then
    raise exception 'Authoritative Kaden Platform Owner identity was not found';
  end if;

  insert into public.platform_owner_bindings (
    staff_profile_id,
    auth_user_id,
    binding_reference
  ) values (
    'e8598359-54a0-4e1f-a635-1ec8ae02cb78'::uuid,
    '1f8b62f8-cac9-4cf7-927d-945d96a302ce'::uuid,
    'PHASE-41.1E-C-KADEN-AUTHORITATIVE-BINDING'
  )
  on conflict (staff_profile_id) do nothing;
end;
$$;

revoke insert, update, delete, truncate
  on table public.platform_owner_bindings
  from service_role, authenticated, anon;

comment on table public.platform_owner_bindings is
  'Immutable technical governance authority, separate from editable Zingara staff roles.';
