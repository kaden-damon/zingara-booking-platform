create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_staff_profile_id uuid,
  actor_auth_user_id uuid,
  actor_name text,
  actor_role text,
  actor_location_scope text[] not null default '{}',
  action text not null,
  entity_type text not null,
  entity_reference text not null,
  entity_id text,
  entity_location text,
  outcome text not null check (outcome in ('success', 'failed', 'blocked')),
  source_area text not null,
  reason text,
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  changed_fields text[] not null default '{}',
  request_id text,
  ip_address inet,
  user_agent text
);

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

create index if not exists audit_events_actor_staff_profile_idx
  on public.audit_events (actor_staff_profile_id, created_at desc);

create index if not exists audit_events_action_idx
  on public.audit_events (action, created_at desc);

create index if not exists audit_events_entity_type_reference_idx
  on public.audit_events (entity_type, entity_reference, created_at desc);

create index if not exists audit_events_entity_location_idx
  on public.audit_events (entity_location, created_at desc);

create index if not exists audit_events_outcome_idx
  on public.audit_events (outcome, created_at desc);

alter table public.audit_events enable row level security;

revoke all on public.audit_events from anon, authenticated;
grant select, insert on public.audit_events to service_role;

create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update
  before update on public.audit_events
  for each row execute function public.prevent_audit_event_mutation();

drop trigger if exists audit_events_no_delete on public.audit_events;
create trigger audit_events_no_delete
  before delete on public.audit_events
  for each row execute function public.prevent_audit_event_mutation();
