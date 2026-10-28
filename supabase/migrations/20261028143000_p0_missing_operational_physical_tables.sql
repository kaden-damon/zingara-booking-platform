-- P0: restore missing operational physical rows for legacy shows that were
-- inactive when Phase 37 seeded the physical catalogue. This deliberately uses
-- the current operational venue_tables catalogue; Phase 54.1 approved layouts
-- remain dormant until an explicit future adoption.

create or replace function public.ensure_show_operational_physical_tables(
  p_show_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if not exists (select 1 from public.shows show where show.id = p_show_id) then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  insert into public.show_tables (
    show_id,
    venue_table_id,
    table_code,
    section,
    capacity,
    capacity_configured,
    status,
    booking_id,
    merged_from,
    override_notes,
    is_override,
    is_physical,
    availability_scope
  )
  select
    p_show_id,
    venue_table.id,
    venue_table.table_code,
    venue_table.section,
    venue_table.capacity,
    venue_table.capacity is not null,
    case
      when venue_table.capacity is null
        then 'disabled'::public.table_status
      else venue_table.base_status
    end,
    null,
    '{}'::uuid[],
    case
      when venue_table.capacity is null
        then 'Capacity must be configured for this performance.'
      else venue_table.notes
    end,
    false,
    true,
    'public'::public.table_availability_scope
  from public.venue_tables venue_table
  where venue_table.is_physical
  order by venue_table.section, venue_table.table_code
  on conflict (show_id, table_code) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.ensure_operational_physical_tables_on_show_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if old.status is not distinct from new.status or new.date < current_date then
    return new;
  end if;

  v_inserted := public.ensure_show_operational_physical_tables(new.id);

  if v_inserted > 0 then
    insert into public.audit_events (
      action,
      actor_name,
      after_values,
      before_values,
      changed_fields,
      entity_id,
      entity_location,
      entity_reference,
      entity_type,
      outcome,
      reason,
      source_area
    ) values (
      'show_tables.permanent-rows-restored',
      'System',
      jsonb_build_object(
        'inserted_physical_rows', v_inserted,
        'show_status', new.status::text
      ),
      jsonb_build_object('inserted_physical_rows', 0),
      array['physical_table_rows'],
      new.id::text,
      new.venue,
      new.id::text,
      'show',
      'success',
      'Operational physical tables restored when the future performance status changed.',
      'P0 Show Activation Safeguard'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists shows_restore_operational_physical_tables_on_activation
  on public.shows;
create trigger shows_restore_operational_physical_tables_on_activation
after update of status on public.shows
for each row
execute function public.ensure_operational_physical_tables_on_show_activation();

with target_shows as (
  select show.id, show.venue, show.date, show.time, show.status::text as status
  from public.shows show
  where show.date >= current_date
    and exists (
      select 1
      from public.venue_tables venue_table
      where venue_table.is_physical
        and not exists (
          select 1
          from public.show_tables show_table
          where show_table.show_id = show.id
            and show_table.table_code = venue_table.table_code
            and show_table.is_physical
        )
    )
), repaired_shows as materialized (
  select
    target.*,
    public.ensure_show_operational_physical_tables(target.id) as inserted_physical_rows
  from target_shows target
)
insert into public.audit_events (
  action,
  actor_name,
  after_values,
  before_values,
  changed_fields,
  entity_id,
  entity_location,
  entity_reference,
  entity_type,
  outcome,
  reason,
  source_area
)
select
  'show_tables.permanent-rows-restored',
  'System',
  jsonb_build_object(
    'inserted_physical_rows', repaired.inserted_physical_rows,
    'performance_date', repaired.date,
    'performance_time', repaired.time,
    'show_status', repaired.status
  ),
  jsonb_build_object('inserted_physical_rows', 0),
  array['physical_table_rows'],
  repaired.id::text,
  repaired.venue,
  repaired.id::text,
  'show',
  'success',
  'Missing permanent rows restored from the unchanged operational physical catalogue.',
  'Phase 54.1 P0 Repair'
from repaired_shows repaired
where repaired.inserted_physical_rows > 0;

do $$
begin
  if exists (
    select 1
    from public.shows show
    cross join public.venue_tables venue_table
    where show.date >= current_date
      and venue_table.is_physical
      and not exists (
        select 1
        from public.show_tables show_table
        where show_table.show_id = show.id
          and show_table.table_code = venue_table.table_code
          and show_table.is_physical
      )
  ) then
    raise exception 'CURRENT_FUTURE_SHOW_PHYSICAL_TABLE_BACKFILL_INCOMPLETE';
  end if;
end;
$$;

revoke all on function public.ensure_show_operational_physical_tables(uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_show_operational_physical_tables(uuid)
  to service_role;

revoke all on function public.ensure_operational_physical_tables_on_show_activation()
  from public, anon, authenticated;

comment on function public.ensure_show_operational_physical_tables(uuid) is
  'Idempotently fills missing permanent show rows from the existing operational catalogue without changing assignments or capacity policy.';
