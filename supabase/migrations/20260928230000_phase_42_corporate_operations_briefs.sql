-- Phase 42.0: one shared, audited operational record for Corporate briefs/checklist.

create table if not exists public.corporate_booking_operations (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  event_requirements text not null default '',
  running_order text not null default '',
  dietary_notes text not null default '',
  accessibility_notes text not null default '',
  gratuity_allocation text not null default '',
  special_requests text not null default '',
  function_notes text not null default '',
  wristband_details text not null default '',
  bar_service_plan text not null default 'not-confirmed'
    check (bar_service_plan in ('limited', 'no-bar-tab', 'open', 'not-confirmed')),
  operational_bar_limit numeric(12,2)
    check (operational_bar_limit is null or operational_bar_limit >= 0),
  bar_limit_instructions text not null default '',
  alcohol_restrictions text not null default '',
  settlement_contact text not null default '',
  bar_requests text not null default '',
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  employee_name text not null default '',
  manager_name text not null default '',
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_staff_profile_id uuid references public.staff_profiles(id)
);

create index if not exists corporate_booking_operations_updated_at_idx
  on public.corporate_booking_operations(updated_at desc);

alter table public.corporate_booking_operations enable row level security;
revoke all on public.corporate_booking_operations from public, anon, authenticated;
grant select, insert, update, delete on public.corporate_booking_operations to service_role;

create or replace function public.save_corporate_booking_operations_atomic(
  p_booking_reference text,
  p_expected_revision integer,
  p_payload jsonb,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
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
  v_booking public.bookings%rowtype;
  v_before public.corporate_booking_operations%rowtype;
  v_after public.corporate_booking_operations%rowtype;
  v_location text;
  v_current_revision integer := 0;
begin
  select * into v_booking
  from public.bookings
  where booking_reference = upper(trim(p_booking_reference))
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.booking_source <> 'corporate-direct'
     and v_booking.booking_origin <> 'corporate'
     and v_booking.corporate_request_id is null then
    raise exception 'NOT_CORPORATE_BOOKING';
  end if;

  select * into v_before
  from public.corporate_booking_operations
  where booking_id = v_booking.id
  for update;

  if found then
    v_current_revision := v_before.revision;
  end if;

  if coalesce(p_expected_revision, 0) <> v_current_revision then
    raise exception 'OPERATIONS_CHANGED';
  end if;

  insert into public.corporate_booking_operations (
    booking_id,
    event_requirements,
    running_order,
    dietary_notes,
    accessibility_notes,
    gratuity_allocation,
    special_requests,
    function_notes,
    wristband_details,
    bar_service_plan,
    operational_bar_limit,
    bar_limit_instructions,
    alcohol_restrictions,
    settlement_contact,
    bar_requests,
    checklist,
    employee_name,
    manager_name,
    revision,
    updated_at,
    updated_by_staff_profile_id
  ) values (
    v_booking.id,
    left(coalesce(p_payload->>'eventRequirements', ''), 4000),
    left(coalesce(p_payload->>'runningOrder', ''), 4000),
    left(coalesce(p_payload->>'dietaryNotes', ''), 4000),
    left(coalesce(p_payload->>'accessibilityNotes', ''), 4000),
    left(coalesce(p_payload->>'gratuityAllocation', ''), 4000),
    left(coalesce(p_payload->>'specialRequests', ''), 4000),
    left(coalesce(p_payload->>'functionNotes', ''), 4000),
    left(coalesce(p_payload->>'wristbandDetails', ''), 500),
    coalesce(p_payload->>'barServicePlan', 'not-confirmed'),
    case when p_payload->>'operationalBarLimit' is null then null
      else round((p_payload->>'operationalBarLimit')::numeric, 2) end,
    left(coalesce(p_payload->>'barLimitInstructions', ''), 4000),
    left(coalesce(p_payload->>'alcoholRestrictions', ''), 4000),
    left(coalesce(p_payload->>'settlementContact', ''), 500),
    left(coalesce(p_payload->>'barRequests', ''), 4000),
    coalesce(p_payload->'checklist', '{}'::jsonb),
    left(coalesce(p_payload->>'employeeName', ''), 200),
    left(coalesce(p_payload->>'managerName', ''), 200),
    v_current_revision + 1,
    now(),
    p_actor_staff_profile_id
  )
  on conflict (booking_id) do update set
    event_requirements = excluded.event_requirements,
    running_order = excluded.running_order,
    dietary_notes = excluded.dietary_notes,
    accessibility_notes = excluded.accessibility_notes,
    gratuity_allocation = excluded.gratuity_allocation,
    special_requests = excluded.special_requests,
    function_notes = excluded.function_notes,
    wristband_details = excluded.wristband_details,
    bar_service_plan = excluded.bar_service_plan,
    operational_bar_limit = excluded.operational_bar_limit,
    bar_limit_instructions = excluded.bar_limit_instructions,
    alcohol_restrictions = excluded.alcohol_restrictions,
    settlement_contact = excluded.settlement_contact,
    bar_requests = excluded.bar_requests,
    checklist = excluded.checklist,
    employee_name = excluded.employee_name,
    manager_name = excluded.manager_name,
    revision = excluded.revision,
    updated_at = excluded.updated_at,
    updated_by_staff_profile_id = excluded.updated_by_staff_profile_id
  returning * into v_after;

  select venue into v_location from public.shows where id = v_booking.show_id;

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
    entity_location,
    entity_reference,
    entity_type,
    outcome,
    request_id,
    source_area,
    user_agent
  ) values (
    'corporate.operations.updated',
    p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]),
    p_actor_name,
    p_actor_role,
    p_actor_staff_profile_id,
    to_jsonb(v_after) - 'booking_id' - 'updated_by_staff_profile_id',
    case when v_current_revision = 0 then '{}'::jsonb
      else to_jsonb(v_before) - 'booking_id' - 'updated_by_staff_profile_id' end,
    array[
      'function_brief',
      'bar_brief',
      'checklist'
    ],
    v_booking.id::text,
    v_location,
    v_booking.booking_reference,
    'booking',
    'success',
    p_request_id,
    'Corporate Operations',
    p_user_agent
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.save_corporate_booking_operations_atomic(
  text, integer, jsonb, uuid, uuid, text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.save_corporate_booking_operations_atomic(
  text, integer, jsonb, uuid, uuid, text, text, text[], text, text
) to service_role;

comment on table public.corporate_booking_operations is
  'One shared operational record per Corporate booking. Booking identity, performance, pax, seating and financials remain derived live.';
