begin;

create table if not exists public.show_zone_sales_controls (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  zone_id text not null,
  public_sales_open boolean not null default true,
  reason text,
  changed_by_staff_id uuid references public.staff_profiles(id) on delete set null,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint show_zone_sales_controls_zone_check check (
    public.normalize_booking_capacity_zone(zone_id) = zone_id
  ),
  constraint show_zone_sales_controls_show_zone_unique unique (show_id, zone_id)
);

create index if not exists show_zone_sales_controls_closed_idx
  on public.show_zone_sales_controls (show_id, zone_id)
  where public_sales_open = false;

alter table public.show_zone_sales_controls enable row level security;
revoke all on table public.show_zone_sales_controls from public, anon, authenticated;
grant select, insert, update on table public.show_zone_sales_controls to service_role;

create or replace function public.set_show_zone_public_sales_atomic(
  p_show_id uuid,
  p_zone_id text,
  p_public_sales_open boolean,
  p_reason text default null,
  p_expected_updated_at timestamptz default null,
  p_actor jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.show_zone_sales_controls%rowtype;
  v_after public.show_zone_sales_controls%rowtype;
  v_show public.shows%rowtype;
  v_zone text;
begin
  v_zone := public.normalize_booking_capacity_zone(p_zone_id);
  if v_zone is null then raise exception 'INVALID_ZONE'; end if;

  select * into v_show from public.shows where id = p_show_id;
  if not found then raise exception 'SHOW_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_show_id::text || ':' || v_zone, 0));
  select * into v_before
  from public.show_zone_sales_controls
  where show_id = p_show_id and zone_id = v_zone
  for update;

  if found and v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'STALE_ZONE_SALES_STATE';
  elsif not found and p_expected_updated_at is not null then
    raise exception 'STALE_ZONE_SALES_STATE';
  end if;

  if found and v_before.public_sales_open = p_public_sales_open then
    return jsonb_build_object(
      'changedAt', v_before.changed_at,
      'publicSalesOpen', v_before.public_sales_open,
      'reason', v_before.reason,
      'updatedAt', v_before.updated_at,
      'zoneId', v_before.zone_id
    );
  end if;

  insert into public.show_zone_sales_controls (
    show_id, zone_id, public_sales_open, reason,
    changed_by_staff_id, changed_by_name, changed_at, updated_at
  ) values (
    p_show_id, v_zone, p_public_sales_open, nullif(btrim(p_reason), ''),
    nullif(p_actor ->> 'staffProfileId', '')::uuid,
    nullif(p_actor ->> 'name', ''), now(), now()
  )
  on conflict (show_id, zone_id) do update set
    public_sales_open = excluded.public_sales_open,
    reason = excluded.reason,
    changed_by_staff_id = excluded.changed_by_staff_id,
    changed_by_name = excluded.changed_by_name,
    changed_at = excluded.changed_at,
    updated_at = excluded.updated_at
  returning * into v_after;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, source_area
  ) values (
    case when p_public_sales_open then 'show.zone-sales-reopened' else 'show.zone-sales-closed' end,
    nullif(p_actor ->> 'authUserId', '')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_actor -> 'locationScope', '[]'::jsonb))), '{}'::text[]),
    nullif(p_actor ->> 'name', ''),
    coalesce(nullif(p_actor ->> 'role', ''), 'Staff'),
    nullif(p_actor ->> 'staffProfileId', '')::uuid,
    jsonb_build_object('public_sales_open', p_public_sales_open, 'zone_id', v_zone),
    jsonb_build_object('public_sales_open', coalesce(v_before.public_sales_open, true), 'zone_id', v_zone),
    array['public_sales_open'],
    p_show_id,
    case
      when lower(v_show.venue) like '%johannesburg%' or lower(v_show.venue) = 'jhb' then 'johannesburg'
      when lower(v_show.venue) like '%cape town%' or lower(v_show.venue) = 'cpt' then 'cape-town'
      else null
    end,
    p_show_id::text,
    'show', 'success', nullif(btrim(p_reason), ''), 'Shows'
  );

  return jsonb_build_object(
    'changedAt', v_after.changed_at,
    'publicSalesOpen', v_after.public_sales_open,
    'reason', v_after.reason,
    'updatedAt', v_after.updated_at,
    'zoneId', v_after.zone_id
  );
end;
$$;

revoke all on function public.set_show_zone_public_sales_atomic(uuid,text,boolean,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.set_show_zone_public_sales_atomic(uuid,text,boolean,text,timestamptz,jsonb)
  to service_role;

create or replace function public.enforce_public_booking_zone_sales_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone text;
begin
  if new.booking_source = 'online'
     and coalesce(new.booking_origin, '') = 'customer_public' then
    v_zone := public.normalize_booking_capacity_zone(new.section);
    if v_zone is not null and exists (
      select 1
      from public.show_zone_sales_controls control
      where control.show_id = new.show_id
        and control.zone_id = v_zone
        and control.public_sales_open = false
    ) then
      raise exception 'PUBLIC_ZONE_SALES_CLOSED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_public_zone_sales_guard on public.bookings;
create trigger bookings_public_zone_sales_guard
before insert on public.bookings
for each row execute function public.enforce_public_booking_zone_sales_open();

comment on table public.show_zone_sales_controls is
  'Show-scoped public seating-zone sales state. Capacity and Floor operations remain independent.';

commit;
