begin;

create or replace function public.is_valid_show_zone_prices(p_prices jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_prices) <> 'object' then false
    else not exists (
      select 1
      from jsonb_each(p_prices) as entry(zone_id, price)
      where entry.zone_id not in (
        'golden-circle',
        'middle-ring',
        'royal-balcony',
        'royal-booths'
      )
      or jsonb_typeof(entry.price) <> 'number'
      or (entry.price #>> '{}')::numeric <= 0
      or (entry.price #>> '{}')::numeric > 1000000
    )
  end;
$$;

create table if not exists public.show_pricing_configurations (
  show_id uuid primary key references public.shows(id) on delete cascade,
  enabled boolean not null default false,
  zone_prices jsonb not null default '{}'::jsonb,
  changed_by_staff_id uuid references public.staff_profiles(id) on delete set null,
  changed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint show_pricing_configurations_zone_prices_check check (
    public.is_valid_show_zone_prices(zone_prices)
  ),
  constraint show_pricing_configurations_enabled_prices_check check (
    not enabled or zone_prices <> '{}'::jsonb
  )
);

alter table public.show_pricing_configurations enable row level security;
revoke all on table public.show_pricing_configurations from public, anon, authenticated;
grant select, insert, update on table public.show_pricing_configurations to service_role;

create or replace function public.set_show_custom_pricing_atomic(
  p_show_id uuid,
  p_enabled boolean,
  p_zone_prices jsonb,
  p_expected_updated_at timestamptz default null,
  p_actor jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_staff public.staff_profiles%rowtype;
  v_before public.show_pricing_configurations%rowtype;
  v_after public.show_pricing_configurations%rowtype;
  v_prices jsonb := coalesce(p_zone_prices, '{}'::jsonb);
  v_show public.shows%rowtype;
begin
  select * into v_show from public.shows where id = p_show_id;
  if not found then raise exception 'SHOW_NOT_FOUND'; end if;

  select staff.* into v_actor_staff
  from public.staff_profiles staff
  where staff.id = nullif(p_actor ->> 'staffProfileId', '')::uuid
    and staff.active = true
    and exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
      where role_permission.role_id = staff.role_id
        and permission.key = 'settings:manage'
    );
  if not found then raise exception 'SHOW_PRICING_PERMISSION_REQUIRED'; end if;

  if jsonb_typeof(v_prices) <> 'object' then
    raise exception 'INVALID_SHOW_PRICING';
  end if;
  if exists (
    select 1
    from jsonb_each(v_prices) as entry(zone_id, price)
    where entry.zone_id not in (
      'golden-circle', 'middle-ring', 'royal-balcony', 'royal-booths'
    )
    or jsonb_typeof(entry.price) <> 'number'
    or (entry.price #>> '{}')::numeric <= 0
    or (entry.price #>> '{}')::numeric > 1000000
  ) then
    raise exception 'INVALID_SHOW_PRICING';
  end if;
  if p_enabled and v_prices = '{}'::jsonb then
    raise exception 'CUSTOM_PRICING_REQUIRES_A_PRICE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('show-pricing:' || p_show_id::text, 0));
  select * into v_before
  from public.show_pricing_configurations
  where show_id = p_show_id
  for update;

  if found and v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'STALE_SHOW_PRICING_STATE';
  elsif not found and p_expected_updated_at is not null then
    raise exception 'STALE_SHOW_PRICING_STATE';
  end if;

  if found
    and v_before.enabled = p_enabled
    and v_before.zone_prices = v_prices
  then
    return jsonb_build_object(
      'enabled', v_before.enabled,
      'updatedAt', v_before.updated_at,
      'zonePrices', v_before.zone_prices
    );
  end if;

  insert into public.show_pricing_configurations (
    show_id,
    enabled,
    zone_prices,
    changed_by_staff_id,
    changed_by_name,
    updated_at
  ) values (
    p_show_id,
    p_enabled,
    v_prices,
    v_actor_staff.id,
    v_actor_staff.full_name,
    now()
  )
  on conflict (show_id) do update set
    enabled = excluded.enabled,
    zone_prices = excluded.zone_prices,
    changed_by_staff_id = excluded.changed_by_staff_id,
    changed_by_name = excluded.changed_by_name,
    updated_at = excluded.updated_at
  returning * into v_after;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, source_area
  ) values (
    case
      when not p_enabled then 'show.custom-pricing-disabled'
      when v_before.show_id is null or not v_before.enabled then 'show.custom-pricing-enabled'
      else 'show.custom-pricing-updated'
    end,
    nullif(p_actor ->> 'authUserId', '')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_actor -> 'locationScope', '[]'::jsonb))), '{}'::text[]),
    v_actor_staff.full_name,
    coalesce(nullif(p_actor ->> 'role', ''), 'Staff'),
    v_actor_staff.id,
    jsonb_build_object('custom_pricing_enabled', v_after.enabled, 'zone_prices', v_after.zone_prices),
    jsonb_build_object('custom_pricing_enabled', coalesce(v_before.enabled, false), 'zone_prices', coalesce(v_before.zone_prices, '{}'::jsonb)),
    array['custom_pricing_enabled', 'zone_prices'],
    p_show_id,
    v_show.venue,
    p_show_id::text,
    'show',
    'success',
    'Show-specific zone pricing updated; existing booking financial snapshots remain unchanged.',
    'Shows'
  );

  return jsonb_build_object(
    'enabled', v_after.enabled,
    'updatedAt', v_after.updated_at,
    'zonePrices', v_after.zone_prices
  );
end;
$$;

revoke all on function public.set_show_custom_pricing_atomic(uuid, boolean, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.set_show_custom_pricing_atomic(uuid, boolean, jsonb, timestamptz, jsonb) to service_role;

comment on table public.show_pricing_configurations is
  'Optional per-performance seating-zone prices. Existing bookings retain their stored commercial snapshots.';

commit;
