-- Phase 41.2Y-P0-E: management-approved show/zone operational seat capacity
-- and atomic recovery for the remaining system-expired Corporate bookings.

create table if not exists public.show_zone_operational_capacity_adjustments (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id),
  zone_id text not null,
  seats integer not null check (seats > 0),
  booking_id uuid not null references public.bookings(id),
  booking_reference text not null,
  approved_maximum integer not null check (approved_maximum > 0),
  request_id text not null,
  actor_name text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint show_zone_operational_capacity_adjustments_zone_valid
    check (public.normalize_booking_capacity_zone(zone_id) = zone_id),
  constraint show_zone_operational_capacity_adjustments_within_approval
    check (seats <= approved_maximum),
  constraint show_zone_operational_capacity_adjustments_booking_zone_unique
    unique (booking_id, zone_id),
  constraint show_zone_operational_capacity_adjustments_request_zone_unique
    unique (request_id, booking_id, zone_id)
);

create index if not exists show_zone_operational_capacity_adjustments_show_zone_idx
  on public.show_zone_operational_capacity_adjustments (show_id, zone_id);

alter table public.show_zone_operational_capacity_adjustments enable row level security;
revoke all on table public.show_zone_operational_capacity_adjustments
  from public, anon, authenticated;
grant select on table public.show_zone_operational_capacity_adjustments
  to service_role;

comment on table public.show_zone_operational_capacity_adjustments is
  'Audited show-specific operational seat capacity. These rows do not represent physical tables or public sellable inventory.';

create or replace function public.booking_capacity_zone_state(
  p_show_id uuid,
  p_zone text,
  p_excluded_table_id uuid default null
)
returns table (
  base_capacity integer,
  temporary_capacity integer,
  effective_operational_capacity integer,
  active_entitlement_pax integer,
  represented_physical_capacity integer,
  reserved_table_capacity integer,
  assignable_table_capacity integer,
  capacity_required_count integer,
  base_sellable_remaining integer,
  operational_remaining integer,
  representation_headroom integer
)
language sql
stable
security definer
set search_path = public
as $$
  with context as (
    select
      public.normalize_booking_capacity_zone(p_zone) as zone,
      public.booking_capacity_zone_limit(
        public.normalize_booking_capacity_zone(p_zone)
      ) as base_capacity
  ), table_rows as (
    select
      st.*,
      case
        when st.is_physical
          and st.merged_parent_id is null
          and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
          and st.status::text <> 'disabled'
          and st.capacity_configured
          and coalesce(st.capacity, 0) > 0
          then 'physical'
        when not st.is_physical
          and st.is_override
          and st.availability_scope::text = 'operational'
          and st.merged_parent_id is null
          and cardinality(coalesce(st.merged_from, '{}'::uuid[])) = 0
          and st.status::text <> 'disabled'
          and st.capacity_configured
          and coalesce(st.capacity, 0) > 0
          then 'temporary'
        when not st.is_physical
          and st.is_override
          and st.availability_scope::text = 'operational'
          and st.merged_parent_id is null
          and cardinality(coalesce(st.merged_from, '{}'::uuid[])) >= 2
          and st.status::text <> 'disabled'
          and st.capacity_configured
          and coalesce(st.capacity, 0) > 0
          and (
            select count(*)
              from public.show_tables child
             where child.id = any(st.merged_from)
               and child.show_id = st.show_id
               and child.is_physical
               and child.capacity_configured
               and child.status::text = 'disabled'
               and child.booking_id is null
               and child.merged_parent_id = st.id
               and public.normalize_booking_capacity_zone(child.section) =
                   public.normalize_booking_capacity_zone(st.section)
          ) = cardinality(st.merged_from)
          and (
            select coalesce(sum(child.capacity), 0)
              from public.show_tables child
             where child.id = any(st.merged_from)
          ) = st.capacity
          then 'merged'
        else 'excluded'
      end as representation_kind
    from public.show_tables st
    cross join context capacity_context
    where st.show_id = p_show_id
      and public.normalize_booking_capacity_zone(st.section) = capacity_context.zone
      and (p_excluded_table_id is null or st.id <> p_excluded_table_id)
  ), table_totals as (
    select
      coalesce(sum(capacity) filter (
        where representation_kind = 'temporary'
      ), 0)::integer as temporary_table_capacity,
      coalesce(sum(capacity) filter (
        where representation_kind in ('physical', 'merged')
      ), 0)::integer as represented_physical_capacity,
      coalesce(sum(capacity) filter (
        where representation_kind in ('physical', 'merged', 'temporary')
          and (booking_id is not null or status::text = 'booked')
      ), 0)::integer as reserved_table_capacity,
      coalesce(sum(capacity) filter (
        where representation_kind in ('physical', 'merged', 'temporary')
          and booking_id is null
          and status::text = 'available'
      ), 0)::integer as assignable_table_capacity,
      count(*) filter (
        where is_physical
          and not capacity_configured
          and merged_parent_id is null
      )::integer as capacity_required_count
    from table_rows
  ), approved_adjustments as (
    select coalesce(sum(adjustment.seats), 0)::integer as seats
    from public.show_zone_operational_capacity_adjustments adjustment
    cross join context capacity_context
    where adjustment.show_id = p_show_id
      and adjustment.zone_id = capacity_context.zone
  ), booking_totals as (
    select coalesce(sum(public.booking_zone_entitlement_pax(
      booking.zone_entitlements,
      booking.section,
      booking.guest_count,
      capacity_context.zone
    )), 0)::integer as active_entitlement_pax
    from public.bookings booking
    cross join context capacity_context
    where booking.show_id = p_show_id
      and booking.archived_at is null
      and booking.booking_status::text in (
        'new', 'confirmed', 'pending_payment', 'checked_in'
      )
  ), totals as (
    select
      table_totals.*,
      table_totals.temporary_table_capacity + approved_adjustments.seats
        as temporary_capacity
    from table_totals
    cross join approved_adjustments
  )
  select
    capacity_context.base_capacity,
    totals.temporary_capacity,
    capacity_context.base_capacity + totals.temporary_capacity,
    booking_totals.active_entitlement_pax,
    totals.represented_physical_capacity,
    totals.reserved_table_capacity,
    totals.assignable_table_capacity,
    totals.capacity_required_count,
    greatest(
      capacity_context.base_capacity - booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity + totals.temporary_capacity -
        booking_totals.active_entitlement_pax,
      0
    ),
    greatest(
      capacity_context.base_capacity + totals.temporary_capacity -
        totals.represented_physical_capacity,
      0
    )
  from context capacity_context
  cross join totals
  cross join booking_totals
  where capacity_context.base_capacity is not null
$$;

revoke all on function public.booking_capacity_zone_state(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.booking_capacity_zone_state(uuid, text, uuid)
  to service_role;

comment on function public.booking_capacity_zone_state(uuid, text, uuid) is
  'Authoritative show/zone capacity snapshot. Temporary operational seat adjustments increase effective operations only and never public sellable capacity or physical table representation.';

create or replace function public.recover_approved_capacity_blocked_corporate_booking_atomic(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_request_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added integer;
  v_adjustments jsonb := '[]'::jsonb;
  v_after record;
  v_approval jsonb;
  v_approved_maximum integer;
  v_before record;
  v_booking record;
  v_entitlement record;
  v_expected_pax integer;
  v_existing_audit uuid;
  v_recovery jsonb;
  v_total_added integer := 0;
  v_zone_count integer := 0;
begin
  if nullif(trim(p_booking_reference), '') is null
     or p_expected_updated_at is null
     or nullif(trim(p_request_id), '') is null
     or length(trim(p_request_id)) > 128
     or nullif(trim(p_actor_name), '') is null then
    raise exception 'APPROVED_CAPACITY_RECOVERY_INPUT_INVALID';
  end if;

  v_approval := case upper(trim(p_booking_reference))
    when 'ZNG-HYHXVD' then jsonb_build_object(
      'venue', 'cape-town', 'date', '2026-10-14', 'guest_count', 238,
      'zones', jsonb_build_object(
        'golden-circle', jsonb_build_object('pax', 132, 'maximum', 12),
        'middle-ring', jsonb_build_object('pax', 106, 'maximum', 1)
      ))
    when 'ZNG-PJULVP' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-10-31', 'guest_count', 40,
      'zones', jsonb_build_object('golden-circle', jsonb_build_object('pax', 40, 'maximum', 19)))
    when 'ZNG-2SF9JY' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-11-11', 'guest_count', 140,
      'zones', jsonb_build_object('golden-circle', jsonb_build_object('pax', 140, 'maximum', 20)))
    when 'ZNG-GSU2SY' then jsonb_build_object(
      'venue', 'cape-town', 'date', '2026-11-14', 'guest_count', 40,
      'zones', jsonb_build_object('royal-balcony', jsonb_build_object('pax', 40, 'maximum', 8)))
    when 'ZNG-LXBL5T' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-11-20', 'guest_count', 40,
      'zones', jsonb_build_object('golden-circle', jsonb_build_object('pax', 40, 'maximum', 11)))
    when 'ZNG-MRUPD8' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-11-26', 'guest_count', 45,
      'zones', jsonb_build_object('golden-circle', jsonb_build_object('pax', 45, 'maximum', 12)))
    when 'ZNG-HA9LKS' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-11-27', 'guest_count', 28,
      'zones', jsonb_build_object('golden-circle', jsonb_build_object('pax', 28, 'maximum', 3)))
    when 'ZNG-C2CZNG' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-11-28', 'guest_count', 25,
      'zones', jsonb_build_object('middle-ring', jsonb_build_object('pax', 25, 'maximum', 10)))
    when 'ZNG-MMWLLC' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-12-02', 'guest_count', 40,
      'zones', jsonb_build_object('golden-circle', jsonb_build_object('pax', 40, 'maximum', 2)))
    when 'ZNG-JLDCP6' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-12-04', 'guest_count', 45,
      'zones', jsonb_build_object('middle-ring', jsonb_build_object('pax', 45, 'maximum', 23)))
    when 'ZNG-SQ9MNA' then jsonb_build_object(
      'venue', 'johannesburg', 'date', '2026-12-10', 'guest_count', 60,
      'zones', jsonb_build_object(
        'middle-ring', jsonb_build_object('pax', 20, 'maximum', 11),
        'royal-balcony', jsonb_build_object('pax', 40, 'maximum', 8)
      ))
    when 'ZNG-V5AX95' then jsonb_build_object(
      'venue', 'cape-town', 'date', '2026-12-10', 'guest_count', 50,
      'zones', jsonb_build_object('middle-ring', jsonb_build_object('pax', 50, 'maximum', 1)))
    else null
  end;
  if v_approval is null then
    raise exception 'APPROVED_CAPACITY_RECOVERY_NOT_ALLOWLISTED';
  end if;

  perform pg_advisory_xact_lock(hashtext(upper(trim(p_booking_reference))));
  select booking.*, show_row.date as show_date, show_row.venue as show_venue
  into v_booking
  from public.bookings booking
  join public.shows show_row on show_row.id = booking.show_id
  where booking.booking_reference = upper(trim(p_booking_reference))
  for update of booking;
  if v_booking.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;

  select audit.id into v_existing_audit
  from public.audit_events audit
  where audit.action = 'corporate.booking.expiry-recovered'
    and audit.entity_id = v_booking.id::text
    and audit.request_id = trim(p_request_id)
    and audit.outcome = 'success'
  limit 1;
  if v_existing_audit is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'idempotent', true,
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'booking_status', v_booking.booking_status,
      'payment_status', v_booking.payment_status,
      'updated_at', v_booking.updated_at
    );
  end if;

  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'BOOKING_REVISION_CHANGED';
  end if;
  if v_booking.show_venue::text <> v_approval ->> 'venue'
     or v_booking.show_date::text <> v_approval ->> 'date'
     or v_booking.guest_count <> (v_approval ->> 'guest_count')::integer then
    raise exception 'APPROVED_CAPACITY_RECOVERY_BOOKING_CHANGED';
  end if;

  for v_entitlement in
    select public.normalize_booking_capacity_zone(zone_id) as zone_id, pax
    from (
      select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
      from jsonb_array_elements(coalesce(v_booking.zone_entitlements, '[]'::jsonb)) item
      union all
      select v_booking.section, v_booking.guest_count
      where v_booking.zone_entitlements is null
    ) zones
    where public.normalize_booking_capacity_zone(zone_id) is not null
    order by 1
  loop
    v_zone_count := v_zone_count + 1;
    if not (v_approval -> 'zones' ? v_entitlement.zone_id) then
      raise exception 'APPROVED_CAPACITY_RECOVERY_ZONE_CHANGED|%', v_entitlement.zone_id;
    end if;
    v_expected_pax := (v_approval -> 'zones' -> v_entitlement.zone_id ->> 'pax')::integer;
    v_approved_maximum := (v_approval -> 'zones' -> v_entitlement.zone_id ->> 'maximum')::integer;
    if v_entitlement.pax <> v_expected_pax then
      raise exception 'APPROVED_CAPACITY_RECOVERY_PAX_CHANGED|%|%|%',
        v_entitlement.zone_id, v_expected_pax, v_entitlement.pax;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(v_booking.show_id::text || ':' || v_entitlement.zone_id, 0)
    );
    select * into v_before
    from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);
    if v_before.effective_operational_capacity is null then
      raise exception 'APPROVED_CAPACITY_RECOVERY_ZONE_INVALID|%', v_entitlement.zone_id;
    end if;

    v_added := greatest(
      v_before.active_entitlement_pax + v_entitlement.pax -
        v_before.effective_operational_capacity,
      0
    );
    if v_added > v_approved_maximum then
      raise exception 'APPROVED_CAPACITY_RECOVERY_REAPPROVAL_REQUIRED|%|%|%',
        v_entitlement.zone_id, v_added, v_approved_maximum;
    end if;

    if v_added > 0 then
      insert into public.show_zone_operational_capacity_adjustments (
        show_id, zone_id, seats, booking_id, booking_reference,
        approved_maximum, request_id, actor_name, reason
      ) values (
        v_booking.show_id,
        v_entitlement.zone_id,
        v_added,
        v_booking.id,
        v_booking.booking_reference,
        v_approved_maximum,
        trim(p_request_id),
        trim(p_actor_name),
        'Corporate expiry recovery / management approval'
      );
    end if;

    select * into v_after
    from public.booking_capacity_zone_state(v_booking.show_id, v_entitlement.zone_id);
    if v_after.active_entitlement_pax + v_entitlement.pax >
       v_after.effective_operational_capacity then
      raise exception 'APPROVED_CAPACITY_RECOVERY_CAPACITY_EXCEEDED|%|%|%|%',
        v_entitlement.zone_id,
        v_entitlement.pax,
        v_after.active_entitlement_pax,
        v_after.effective_operational_capacity;
    end if;

    v_total_added := v_total_added + v_added;
    v_adjustments := v_adjustments || jsonb_build_array(jsonb_build_object(
      'zone_id', v_entitlement.zone_id,
      'base_capacity', v_before.base_capacity,
      'temporary_capacity_before', v_before.temporary_capacity,
      'approved_maximum', v_approved_maximum,
      'added', v_added,
      'temporary_capacity_after', v_after.temporary_capacity,
      'effective_capacity_after', v_after.effective_operational_capacity,
      'active_entitlement_before', v_after.active_entitlement_pax,
      'restore_pax', v_entitlement.pax,
      'remaining_after_restore',
        v_after.effective_operational_capacity - v_after.active_entitlement_pax - v_entitlement.pax
    ));
  end loop;

  if v_zone_count <> (
    select count(*) from jsonb_object_keys(v_approval -> 'zones')
  ) then
    raise exception 'APPROVED_CAPACITY_RECOVERY_ZONE_SET_CHANGED';
  end if;

  v_recovery := public.recover_system_expired_corporate_booking_atomic(
    v_booking.booking_reference,
    p_expected_updated_at,
    trim(p_request_id),
    trim(p_actor_name)
  );

  for v_entitlement in
    select item
    from jsonb_array_elements(v_adjustments) item
    where (item ->> 'added')::integer > 0
  loop
    insert into public.audit_events (
      action, actor_location_scope, actor_name, after_values, before_values,
      changed_fields, entity_id, entity_reference, entity_type, outcome, reason,
      request_id, source_area
    ) values (
      'show.zone-operational-capacity.approved-added',
      '{}'::text[],
      trim(p_actor_name),
      jsonb_build_object(
        'show_id', v_booking.show_id,
        'zone_id', v_entitlement.item ->> 'zone_id',
        'temporary_capacity', (v_entitlement.item ->> 'temporary_capacity_after')::integer,
        'effective_capacity', (v_entitlement.item ->> 'effective_capacity_after')::integer,
        'booking_reference', v_booking.booking_reference
      ),
      jsonb_build_object(
        'show_id', v_booking.show_id,
        'zone_id', v_entitlement.item ->> 'zone_id',
        'temporary_capacity', (v_entitlement.item ->> 'temporary_capacity_before')::integer
      ),
      array['temporary_operational_capacity'],
      v_booking.show_id::text,
      v_booking.booking_reference,
      'show',
      'success',
      'Corporate expiry recovery / management approval',
      trim(p_request_id) || ':' || (v_entitlement.item ->> 'zone_id'),
      'Emergency Corporate Expiry Recovery'
    );
  end loop;

  return jsonb_build_object(
    'status', 'processed',
    'idempotent', false,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.booking_reference,
    'approved_capacity_added', v_total_added,
    'capacity_adjustments', v_adjustments,
    'recovery', v_recovery
  );
end;
$$;

revoke all on function public.recover_approved_capacity_blocked_corporate_booking_atomic(
  text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.recover_approved_capacity_blocked_corporate_booking_atomic(
  text, timestamptz, text, text
) to service_role;

comment on function public.recover_approved_capacity_blocked_corporate_booking_atomic(text, timestamptz, text, text) is
  'Bounded P0-E recovery: adds no more than the management-approved show/zone operational seats and atomically delegates lifecycle restoration to the P0-C recovery function.';
