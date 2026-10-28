-- Phase 54.3: reconcile only untouched, zero-booking future performances to
-- Richard's approved master. Existing bookings, assignments, overrides,
-- merges, temporary rows, ticket-sale capacities and exports are untouched.

alter table public.show_physical_seating_layouts
  add column if not exists adoption_source text not null default 'staff'
  check (adoption_source in ('staff', 'system_reconciliation'));

alter table public.show_physical_seating_layouts
  drop constraint if exists show_physical_seating_layouts_check;

alter table public.show_physical_seating_layouts
  add constraint show_physical_seating_layouts_check check (
    (
      adoption_status = 'pending_reconciliation'
      and adopted_at is null
      and adopted_by_staff_id is null
    )
    or (
      adoption_status = 'adopted'
      and adopted_at is not null
      and (
        adopted_by_staff_id is not null
        or adoption_source = 'system_reconciliation'
      )
    )
  );

create or replace function public.enforce_show_table_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_maximum integer;
  v_minimum integer;
begin
  if not new.capacity_configured then
    if new.capacity is not null or new.status::text <> 'disabled' or new.booking_id is not null then
      raise exception using
        errcode = '23514',
        message = 'TABLE_CAPACITY_NOT_CONFIGURED';
    end if;
    return new;
  end if;

  if new.capacity is null or new.capacity <= 0 then
    raise exception using
      errcode = '23514',
      message = 'TABLE_CAPACITY_REQUIRED';
  end if;

  if new.is_physical then
    select table_row.minimum_capacity, table_row.maximum_capacity
      into v_minimum, v_maximum
      from public.venue_tables table_row
     where table_row.is_physical
       and public.normalize_booking_capacity_zone(table_row.section) =
         public.normalize_booking_capacity_zone(new.section)
       and table_row.table_code = new.table_code
     limit 1;

    if v_minimum is null then
      select approved.maximum_guests, approved.maximum_guests
        into v_minimum, v_maximum
        from public.shows show_row
        join public.physical_seating_venue_settings setting
          on setting.venue = case
            when lower(trim(coalesce(show_row.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
            when lower(trim(coalesce(show_row.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
            else ''
          end
        join public.physical_seating_layout_tables approved
          on approved.layout_version_id = setting.approved_layout_version_id
         and approved.table_code = new.table_code
         and approved.zone_id = public.normalize_booking_capacity_zone(new.section)
       where show_row.id = new.show_id
       limit 1;
    end if;

    if v_minimum is null
       or new.capacity < v_minimum
       or new.capacity > v_maximum then
      raise exception using
        errcode = '23514',
        message = format(
          'PHYSICAL_TABLE_CAPACITY_OUT_OF_RANGE|%s|%s|%s',
          new.table_code,
          coalesce(v_minimum::text, '?'),
          coalesce(v_maximum::text, '?')
        );
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.booking_id is not null
     and old.booking_id is null
     and not new.is_physical
     and not new.is_override then
    raise exception using
      errcode = '23514',
      message = 'LEGACY_PLACEHOLDER_TABLE_NOT_ASSIGNABLE';
  end if;

  return new;
end
$$;

create or replace function public.get_show_physical_reconciliation_evidence(
  p_show_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with show_context as (
    select
      show_row.*,
      case
        when lower(trim(coalesce(show_row.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
        when lower(trim(coalesce(show_row.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
        else null
      end as venue_key
    from public.shows show_row
    where show_row.id = p_show_id
  ), layout as (
    select setting.approved_layout_version_id as layout_version_id
    from show_context context
    join public.physical_seating_venue_settings setting on setting.venue = context.venue_key
  ), missing as (
    select approved.table_code
    from layout
    join public.physical_seating_layout_tables approved
      on approved.layout_version_id = layout.layout_version_id
    where not exists (
      select 1
      from public.show_tables table_row
      where table_row.show_id = p_show_id
        and table_row.table_code = approved.table_code
        and table_row.is_physical
        and coalesce(cardinality(table_row.merged_from), 0) = 0
        and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
    )
  ), capacity_conflicts as (
    select jsonb_build_object(
      'tableCode', approved.table_code,
      'zone', approved.zone_id,
      'approvedCapacity', approved.maximum_guests,
      'operationalCapacity', table_row.capacity,
      'assigned', table_row.booking_id is not null,
      'override', table_row.is_override
    ) as evidence
    from layout
    join public.physical_seating_layout_tables approved
      on approved.layout_version_id = layout.layout_version_id
    join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and coalesce(cardinality(table_row.merged_from), 0) = 0
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
    where table_row.capacity_configured
      and table_row.capacity is distinct from approved.maximum_guests
  ), structural_conflicts as (
    select jsonb_build_object(
      'tableCode', approved.table_code,
      'approvedZone', approved.zone_id,
      'operationalZone', public.normalize_booking_capacity_zone(table_row.section),
      'operationalCapacity', table_row.capacity,
      'assigned', table_row.booking_id is not null
    ) as evidence
    from layout
    join public.physical_seating_layout_tables approved
      on approved.layout_version_id = layout.layout_version_id
    join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
    where public.normalize_booking_capacity_zone(table_row.section) is distinct from approved.zone_id
  ), additional_operational as (
    select jsonb_build_object(
      'tableCode', table_row.table_code,
      'zone', public.normalize_booking_capacity_zone(table_row.section),
      'capacity', table_row.capacity,
      'status', table_row.status::text,
      'assigned', table_row.booking_id is not null,
      'override', table_row.is_override
    ) as evidence
    from layout
    join public.show_tables table_row on table_row.show_id = p_show_id
    where table_row.is_physical
      and not exists (
        select 1
        from public.physical_seating_layout_tables approved
        where approved.layout_version_id = layout.layout_version_id
          and approved.table_code = table_row.table_code
          and approved.zone_id = public.normalize_booking_capacity_zone(table_row.section)
      )
  )
  select jsonb_build_object(
    'showId', context.id,
    'venue', context.venue_key,
    'performanceDate', context.date,
    'performanceTime', context.time,
    'showStatus', context.status::text,
    'bookingCount', (select count(*) from public.bookings booking where booking.show_id = context.id),
    'assignedTableCount', (select count(*) from public.show_tables table_row where table_row.show_id = context.id and table_row.booking_id is not null),
    'overrideTableCount', (select count(*) from public.show_tables table_row where table_row.show_id = context.id and table_row.is_override),
    'mergedTableCount', (select count(*) from public.show_tables table_row where table_row.show_id = context.id and (cardinality(coalesce(table_row.merged_from, '{}'::uuid[])) > 0 or table_row.merged_parent_id is not null)),
    'temporaryTableCount', (select count(*) from public.show_tables table_row where table_row.show_id = context.id and table_row.is_override and not table_row.is_physical),
    'missingMasterTableCodes', coalesce((select jsonb_agg(missing.table_code order by missing.table_code::integer) from missing), '[]'::jsonb),
    'structuralConflicts', coalesce((select jsonb_agg(structural_conflicts.evidence order by structural_conflicts.evidence ->> 'tableCode') from structural_conflicts), '[]'::jsonb),
    'additionalOperationalTables', coalesce((select jsonb_agg(additional_operational.evidence order by additional_operational.evidence ->> 'tableCode') from additional_operational), '[]'::jsonb),
    'configuredCapacityConflicts', coalesce((select jsonb_agg(capacity_conflicts.evidence order by capacity_conflicts.evidence ->> 'tableCode') from capacity_conflicts), '[]'::jsonb),
    'priorPendingReconciliationCount', (select count(*) from public.physical_seating_reconciliation_queue queue where queue.show_id = context.id and queue.status = 'pending'),
    'evaluatedAt', now()
  )
  from show_context context;
$$;

create or replace function public.reconcile_zero_booking_show_to_approved_layout(
  p_show_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after jsonb;
  v_before jsonb;
  v_inserted integer := 0;
  v_layout_version_id uuid;
  v_show public.shows%rowtype;
  v_updated integer := 0;
  v_venue text;
begin
  perform pg_advisory_xact_lock(hashtextextended('phase-54-3-reconciliation:' || p_show_id::text, 0));
  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  if v_show.status::text <> 'inactive' then raise exception 'SHOW_NOT_INACTIVE'; end if;
  if (v_show.date::date + coalesce(v_show.time, '00:00'::time)) < timezone('Africa/Johannesburg', now()) then
    raise exception 'SHOW_NOT_FUTURE';
  end if;
  if exists (select 1 from public.bookings booking where booking.show_id = p_show_id) then
    raise exception 'EXISTING_BOOKINGS_PRESERVED';
  end if;
  if exists (
    select 1 from public.show_tables table_row
    where table_row.show_id = p_show_id
      and (
        table_row.booking_id is not null
        or table_row.is_override
        or cardinality(coalesce(table_row.merged_from, '{}'::uuid[])) > 0
        or table_row.merged_parent_id is not null
      )
  ) then
    raise exception 'OPERATIONAL_TABLE_DECISIONS_PRESERVED';
  end if;

  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
    else null
  end;
  if v_venue is null then raise exception 'SUPPORTED_VENUE_REQUIRED'; end if;
  select setting.approved_layout_version_id into v_layout_version_id
    from public.physical_seating_venue_settings setting where setting.venue = v_venue;
  if v_layout_version_id is null then raise exception 'APPROVED_LAYOUT_REQUIRED'; end if;
  if (select count(*) from public.physical_seating_layout_tables where layout_version_id = v_layout_version_id) <> 74 then
    raise exception 'APPROVED_LAYOUT_INCOMPLETE';
  end if;

  v_before := public.get_show_physical_reconciliation_evidence(p_show_id);

  if exists (
    select 1
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
    left join public.venue_tables venue_table on venue_table.id = table_row.venue_table_id
    where approved.layout_version_id = v_layout_version_id
      and table_row.capacity_configured
      and table_row.capacity is distinct from approved.maximum_guests
      and (
        venue_table.id is null
        or table_row.capacity is distinct from venue_table.capacity
      )
  ) then
    raise exception 'PERFORMANCE_SPECIFIC_CAPACITY_PRESERVED';
  end if;

  if exists (
    select 1
    from public.physical_seating_layout_tables approved
    join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and public.normalize_booking_capacity_zone(table_row.section) is distinct from approved.zone_id
    where approved.layout_version_id = v_layout_version_id
      and not (
        table_row.is_physical
        and not table_row.is_override
        and table_row.booking_id is null
        and not table_row.capacity_configured
        and table_row.capacity is null
        and table_row.status::text = 'disabled'
        and coalesce(cardinality(table_row.merged_from), 0) = 0
        and table_row.merged_parent_id is null
        and table_row.venue_table_id is not null
      )
  ) then
    raise exception 'TABLE_ZONE_CONFLICT_PRESERVED';
  end if;

  insert into public.show_physical_seating_layouts (
    show_id, layout_version_id, adoption_status, automatic_assignment_enabled,
    adoption_source, pause_threshold_percent, assignment_state,
    threshold_override_active, state_changed_at, state_change_reason
  ) values (
    p_show_id, v_layout_version_id, 'pending_reconciliation', false,
    'system_reconciliation', 70, 'disabled', false, now(),
    'Phase 54.3 controlled zero-booking reconciliation started.'
  ) on conflict (show_id) do nothing;

  update public.show_tables table_row set
    section = approved.zone_id,
    venue_table_id = null,
    capacity = approved.maximum_guests,
    capacity_configured = true,
    status = 'available',
    override_notes = 'Approved Phase 54.1 master capacity populated by Phase 54.3.',
    updated_at = now()
  from public.physical_seating_layout_tables approved
  where approved.layout_version_id = v_layout_version_id
    and table_row.show_id = p_show_id
    and table_row.table_code = approved.table_code
    and public.normalize_booking_capacity_zone(table_row.section) is distinct from approved.zone_id
    and table_row.is_physical
    and not table_row.is_override
    and table_row.booking_id is null
    and not table_row.capacity_configured
    and table_row.capacity is null
    and table_row.status::text = 'disabled'
    and coalesce(cardinality(table_row.merged_from), 0) = 0
    and table_row.merged_parent_id is null;
  get diagnostics v_updated = row_count;

  update public.show_tables table_row set
    capacity = approved.maximum_guests,
    capacity_configured = true,
    status = case when table_row.status::text = 'disabled' then 'available'::public.table_status else table_row.status end,
    override_notes = case
      when table_row.override_notes in (
        'Capacity must be configured for this performance.',
        'Capacity must be configured for each performance.'
      ) then null
      else table_row.override_notes
    end,
    updated_at = now()
  from public.physical_seating_layout_tables approved
  left join public.venue_tables venue_table
    on venue_table.table_code = approved.table_code
   and public.normalize_booking_capacity_zone(venue_table.section) = approved.zone_id
   and venue_table.is_physical
  where approved.layout_version_id = v_layout_version_id
    and table_row.show_id = p_show_id
    and table_row.table_code = approved.table_code
    and table_row.is_physical
    and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
    and table_row.booking_id is null
    and not table_row.is_override
    and coalesce(cardinality(table_row.merged_from), 0) = 0
    and table_row.merged_parent_id is null
    and (
      (not table_row.capacity_configured and table_row.capacity is null and table_row.status::text = 'disabled')
      or table_row.capacity = approved.maximum_guests
      or (venue_table.id is not null and table_row.capacity = venue_table.capacity)
    )
    and (
      table_row.capacity is distinct from approved.maximum_guests
      or not table_row.capacity_configured
      or table_row.status::text = 'disabled'
    );
  get diagnostics v_inserted = row_count;
  v_updated := v_updated + v_inserted;

  insert into public.show_tables (
    show_id, venue_table_id, table_code, section, capacity,
    capacity_configured, status, booking_id, merged_from, override_notes,
    is_override, is_physical, availability_scope
  )
  select
    p_show_id, null, approved.table_code, approved.zone_id,
    approved.maximum_guests, true, 'available'::public.table_status, null,
    '{}'::uuid[],
    'Approved Phase 54.1 master table introduced by Phase 54.3.',
    false, true, 'public'::public.table_availability_scope
  from public.physical_seating_layout_tables approved
  where approved.layout_version_id = v_layout_version_id
    and not exists (
      select 1 from public.show_tables table_row
      where table_row.show_id = p_show_id
        and table_row.table_code = approved.table_code
    );
  get diagnostics v_inserted = row_count;

  if exists (
    select 1
    from public.physical_seating_layout_tables approved
    left join public.show_tables table_row
      on table_row.show_id = p_show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
     and table_row.capacity_configured
     and table_row.capacity = approved.maximum_guests
    where approved.layout_version_id = v_layout_version_id
      and table_row.id is null
  ) then
    raise exception 'MASTER_RECONCILIATION_INCOMPLETE';
  end if;

  update public.show_physical_seating_layouts set
    adoption_status = 'adopted',
    automatic_assignment_enabled = true,
    adoption_source = 'system_reconciliation',
    adopted_at = now(),
    adopted_by_staff_id = null,
    pause_threshold_percent = 70,
    assignment_state = 'enabled',
    threshold_override_active = false,
    assignment_revision = assignment_revision + 1,
    state_changed_at = now(),
    state_changed_by_staff_id = null,
    state_change_reason = 'Phase 54.3 approved zero-booking reconciliation.',
    updated_at = now()
  where show_id = p_show_id;

  v_after := public.get_show_physical_reconciliation_evidence(p_show_id);

  insert into public.audit_events (
    action, actor_name, actor_location_scope, after_values, before_values,
    changed_fields, entity_id, entity_location, entity_reference, entity_type,
    outcome, reason, source_area
  ) values (
    'show.physical-layout-reconciled-and-auto-assignment-enabled',
    'SYSTEM', array[v_venue],
    v_after || jsonb_build_object('updatedMasterRows', v_updated, 'insertedMasterRows', v_inserted),
    v_before,
    array['physical_table_layout', 'permanent_table_capacities', 'automatic_assignment_enabled'],
    p_show_id::text, v_venue, p_show_id::text, 'show', 'success',
    'Zero-booking future performance reconciled to Richard approved master without touching assignments or ticket-sale capacity.',
    'Phase 54.3 Table Reconciliation'
  );

  return jsonb_build_object(
    'showId', p_show_id,
    'outcome', 'activated',
    'updatedMasterRows', v_updated,
    'insertedMasterRows', v_inserted,
    'evidence', v_after
  );
end;
$$;

revoke all on function public.get_show_physical_reconciliation_evidence(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_zero_booking_show_to_approved_layout(uuid) from public, anon, authenticated;
grant execute on function public.get_show_physical_reconciliation_evidence(uuid) to service_role;
grant execute on function public.reconcile_zero_booking_show_to_approved_layout(uuid) to service_role;

do $$
declare
  v_evidence jsonb;
  v_layout_version_id uuid;
  v_outcome text;
  v_result jsonb;
  v_show record;
begin
  for v_show in
    select show_row.id, show_row.venue, show_row.status::text as show_status
    from public.shows show_row
    where (show_row.date::date + coalesce(show_row.time, '00:00'::time)) >= timezone('Africa/Johannesburg', now())
    order by show_row.date, show_row.time, show_row.id
  loop
    v_evidence := public.get_show_physical_reconciliation_evidence(v_show.id);
    select setting.approved_layout_version_id into v_layout_version_id
      from public.physical_seating_venue_settings setting
     where setting.venue = case
       when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town') then 'cape-town'
       when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg') then 'johannesburg'
       else ''
     end;

    v_outcome := case
      when v_show.show_status <> 'inactive' then 'SHOW_STATUS_PRESERVED'
      when coalesce((v_evidence ->> 'bookingCount')::integer, 0) > 0 then 'EXISTING_BOOKINGS_PRESERVED'
      when coalesce((v_evidence ->> 'assignedTableCount')::integer, 0) > 0 then 'EXISTING_ASSIGNMENTS_PRESERVED'
      when coalesce((v_evidence ->> 'overrideTableCount')::integer, 0) > 0 then 'OPERATIONAL_OVERRIDES_PRESERVED'
      when coalesce((v_evidence ->> 'mergedTableCount')::integer, 0) > 0 then 'MERGED_TABLES_PRESERVED'
      else 'SAFE_ZERO_BOOKING_COHORT'
    end;

    if v_layout_version_id is not null and v_outcome = 'SAFE_ZERO_BOOKING_COHORT' then
      begin
        v_result := public.reconcile_zero_booking_show_to_approved_layout(v_show.id);
        insert into public.physical_seating_reconciliation_queue (
          show_id, layout_version_id, reason, evidence_snapshot, status,
          detected_at, resolved_at, resolution_notes
        ) values (
          v_show.id, v_layout_version_id, 'PHASE_54_3_MASTER_RECONCILIATION',
          v_result, 'resolved', now(), now(),
          'Safely reconciled and enabled from the zero-booking cohort.'
        ) on conflict (show_id, layout_version_id, reason) do update set
          evidence_snapshot = excluded.evidence_snapshot,
          status = 'resolved',
          resolved_at = excluded.resolved_at,
          resolution_notes = excluded.resolution_notes;
      exception when others then
        insert into public.physical_seating_reconciliation_queue (
          show_id, layout_version_id, reason, evidence_snapshot, status
        ) values (
          v_show.id, v_layout_version_id, 'PHASE_54_3_MASTER_RECONCILIATION',
          v_evidence || jsonb_build_object('decision', 'EXCLUDED', 'blocker', sqlerrm),
          'pending'
        ) on conflict (show_id, layout_version_id, reason) do update set
          evidence_snapshot = excluded.evidence_snapshot,
          status = 'pending',
          resolved_at = null,
          resolved_by_staff_id = null,
          resolution_notes = null;
      end;
    elsif v_layout_version_id is not null then
      insert into public.physical_seating_reconciliation_queue (
        show_id, layout_version_id, reason, evidence_snapshot, status
      ) values (
        v_show.id, v_layout_version_id, 'PHASE_54_3_MASTER_RECONCILIATION',
        v_evidence || jsonb_build_object('decision', 'EXCLUDED', 'blocker', v_outcome),
        'pending'
      ) on conflict (show_id, layout_version_id, reason) do update set
        evidence_snapshot = excluded.evidence_snapshot,
        status = 'pending',
        resolved_at = null,
        resolved_by_staff_id = null,
        resolution_notes = null;
    end if;
  end loop;
end;
$$;

update public.physical_seating_venue_settings set
  automatic_assignment_enabled = true,
  default_pause_threshold_percent = 70,
  review_reminder_days = 10,
  updated_at = now()
where venue in ('cape-town', 'johannesburg')
  and exists (
    select 1
    from public.show_physical_seating_layouts adoption
    join public.physical_seating_layout_versions version on version.id = adoption.layout_version_id
    where version.venue = physical_seating_venue_settings.venue
      and adoption.adoption_status = 'adopted'
      and adoption.automatic_assignment_enabled
  );

insert into public.audit_events (
  action, actor_name, after_values, before_values, changed_fields,
  entity_id, entity_location, entity_reference, entity_type,
  outcome, reason, source_area
)
select
  'venue.automatic-table-assignment-progressive-rollout-enabled',
  'SYSTEM',
  jsonb_build_object(
    'automatic_assignment_enabled', setting.automatic_assignment_enabled,
    'default_pause_threshold_percent', setting.default_pause_threshold_percent,
    'review_reminder_days', setting.review_reminder_days,
    'activated_show_count', (
      select count(*)
      from public.show_physical_seating_layouts adoption
      join public.physical_seating_layout_versions version on version.id = adoption.layout_version_id
      where version.venue = setting.venue
        and adoption.adoption_status = 'adopted'
        and adoption.automatic_assignment_enabled
    )
  ),
  jsonb_build_object('automatic_assignment_enabled', false),
  array['automatic_assignment_enabled', 'default_pause_threshold_percent', 'review_reminder_days'],
  setting.venue, setting.venue, setting.venue, 'venue', 'success',
  'Phase 54.3 enabled the venue gate only after safe zero-booking performances were reconciled.',
  'Phase 54.3 Table Reconciliation'
from public.physical_seating_venue_settings setting
where setting.automatic_assignment_enabled;

do $$
begin
  if exists (
    select 1
    from public.show_physical_seating_layouts adoption
    join public.shows show_row on show_row.id = adoption.show_id
    where adoption.adoption_status = 'adopted'
      and adoption.automatic_assignment_enabled
      and exists (select 1 from public.bookings booking where booking.show_id = show_row.id)
  ) then
    raise exception 'PHASE_54_3_EXISTING_BOOKING_SHOW_ACTIVATED';
  end if;

  if exists (
    select 1
    from public.show_physical_seating_layouts adoption
    join public.physical_seating_layout_tables approved on approved.layout_version_id = adoption.layout_version_id
    left join public.show_tables table_row
      on table_row.show_id = adoption.show_id
     and table_row.table_code = approved.table_code
     and table_row.is_physical
     and public.normalize_booking_capacity_zone(table_row.section) = approved.zone_id
     and table_row.capacity_configured
     and table_row.capacity = approved.maximum_guests
     and table_row.status::text = 'available'
    where adoption.adoption_status = 'adopted'
      and adoption.automatic_assignment_enabled
      and table_row.id is null
  ) then
    raise exception 'PHASE_54_3_ACTIVATED_LAYOUT_INCOMPLETE';
  end if;
end;
$$;

comment on function public.reconcile_zero_booking_show_to_approved_layout(uuid) is
  'Fail-closed Phase 54.3 reconciliation for inactive future shows with no booking or operational table decisions.';
