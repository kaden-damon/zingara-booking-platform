-- Phase 39.25: temporary, independently expiring customer operational
-- communication pauses. Marketing consent remains a separate concern.

create table if not exists public.customer_communication_suppressions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  paused_at timestamptz not null default now(),
  paused_until timestamptz not null,
  reason text not null check (length(trim(reason)) between 3 and 240),
  paused_by_staff_id uuid references public.staff_profiles(id) on delete set null,
  paused_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, channel)
);

create index if not exists customer_communication_suppressions_active_idx
  on public.customer_communication_suppressions (customer_id, channel, paused_until);

alter table public.customer_communication_suppressions enable row level security;

revoke all on table public.customer_communication_suppressions
  from public, anon, authenticated;
grant select, insert, update on table public.customer_communication_suppressions
  to service_role;

create or replace function public.set_customer_communication_suppression(
  p_customer_id uuid,
  p_channel text,
  p_action text,
  p_paused_until timestamptz,
  p_reason text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_request_id text default null,
  p_user_agent text default null
)
returns public.customer_communication_suppressions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_before public.customer_communication_suppressions%rowtype;
  v_customer_exists boolean;
  v_now timestamptz := clock_timestamp();
  v_result public.customer_communication_suppressions%rowtype;
  v_role_name text;
begin
  if p_channel not in ('email', 'push') then
    raise exception 'Unsupported operational communication channel';
  end if;

  if p_action not in ('pause', 'resume') then
    raise exception 'Unsupported communication suppression action';
  end if;

  if length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception 'A concise operational reason is required';
  end if;

  select *
    into v_actor
    from public.staff_profiles
   where id = p_actor_staff_profile_id
     and user_id = p_actor_auth_user_id
     and active = true;

  if not found then
    raise exception 'An active matching staff identity is required';
  end if;

  select exists(
    select 1 from public.customers where id = p_customer_id
  ) into v_customer_exists;

  if not v_customer_exists then
    raise exception 'Customer could not be found';
  end if;

  if p_action = 'pause' and (
    p_paused_until is null
    or p_paused_until <= v_now
    or p_paused_until > v_now + interval '25 hours'
  ) then
    raise exception 'Pause expiry must be within the next 25 hours';
  end if;

  select *
    into v_before
    from public.customer_communication_suppressions
   where customer_id = p_customer_id
     and channel = p_channel
   for update;

  insert into public.customer_communication_suppressions (
    customer_id,
    channel,
    paused_at,
    paused_until,
    reason,
    paused_by_staff_id,
    paused_by_name,
    updated_at
  ) values (
    p_customer_id,
    p_channel,
    v_now,
    case when p_action = 'pause' then p_paused_until else v_now end,
    trim(p_reason),
    v_actor.id,
    v_actor.full_name,
    v_now
  )
  on conflict (customer_id, channel) do update set
    paused_at = excluded.paused_at,
    paused_until = excluded.paused_until,
    reason = excluded.reason,
    paused_by_staff_id = excluded.paused_by_staff_id,
    paused_by_name = excluded.paused_by_name,
    updated_at = excluded.updated_at
  returning * into v_result;

  select r.name
    into v_role_name
    from public.roles r
   where r.id = v_actor.role_id;

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
    before_values,
    after_values,
    changed_fields,
    request_id,
    user_agent
  ) values (
    v_actor.id,
    p_actor_auth_user_id,
    v_actor.full_name,
    v_role_name,
    coalesce(v_actor.venue_scope, '{}'::text[]),
    case
      when p_action = 'pause' then 'customer.communication_pause'
      else 'customer.communication_resume'
    end,
    'customer',
    p_customer_id::text,
    p_customer_id::text,
    'success',
    'Customers',
    trim(p_reason),
    jsonb_build_object(
      'channel', p_channel,
      'paused_until', v_before.paused_until,
      'reason', v_before.reason
    ),
    jsonb_build_object(
      'channel', p_channel,
      'paused_until', v_result.paused_until,
      'reason', v_result.reason
    ),
    array[p_channel || '_operational_updates'],
    p_request_id,
    p_user_agent
  );

  return v_result;
end;
$$;

revoke all on function public.set_customer_communication_suppression(
  uuid, text, text, timestamptz, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.set_customer_communication_suppression(
  uuid, text, text, timestamptz, text, uuid, uuid, text, text
) to service_role;
