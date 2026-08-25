-- Phase 37: physical table identities with per-show configured capacities.
-- Legacy placeholder rows and their booking assignments remain unchanged.

alter table public.venue_tables
  alter column capacity drop not null,
  add column if not exists minimum_capacity integer,
  add column if not exists maximum_capacity integer,
  add column if not exists is_physical boolean not null default false;

alter table public.show_tables
  alter column capacity drop not null,
  add column if not exists capacity_configured boolean not null default true,
  add column if not exists is_physical boolean not null default false;

update public.venue_tables
set
  minimum_capacity = coalesce(minimum_capacity, capacity),
  maximum_capacity = coalesce(maximum_capacity, capacity)
where capacity is not null;

alter table public.venue_tables
  drop constraint if exists venue_tables_physical_capacity_range_check;

alter table public.venue_tables
  add constraint venue_tables_physical_capacity_range_check
  check (
    not is_physical
    or (
      minimum_capacity is not null
      and maximum_capacity is not null
      and minimum_capacity > 0
      and maximum_capacity >= minimum_capacity
      and (capacity is null or capacity between minimum_capacity and maximum_capacity)
    )
  );

alter table public.show_tables
  drop constraint if exists show_tables_capacity_configuration_check;

alter table public.show_tables
  add constraint show_tables_capacity_configuration_check
  check (
    (capacity_configured and capacity is not null and capacity > 0)
    or (
      not capacity_configured
      and capacity is null
      and status::text = 'disabled'
      and booking_id is null
    )
  );

-- Replace the old placeholder venue catalogue. Referencing show rows retain
-- their IDs and assignments; their venue_table_id is cleared by the existing
-- ON DELETE SET NULL foreign key.
delete from public.venue_tables
where public.normalize_booking_capacity_zone(section) is not null;

insert into public.venue_tables (
  table_code,
  section,
  capacity,
  minimum_capacity,
  maximum_capacity,
  base_status,
  mergeable,
  notes,
  is_physical
)
select
  code,
  zone,
  default_capacity,
  minimum_capacity,
  maximum_capacity,
  case when default_capacity is null then 'disabled'::public.table_status else 'available'::public.table_status end,
  true,
  case when default_capacity is null then 'Capacity must be configured for each performance.' else null end,
  true
from (
  select
    booth_number::text as code,
    'royal-booths'::text as zone,
    6::integer as default_capacity,
    4::integer as minimum_capacity,
    6::integer as maximum_capacity
  from generate_series(1, 24) booth_number
  where booth_number <> 13

  union all

  select
    middle_number::text,
    'middle-ring',
    null::integer,
    2,
    8
  from (
    select generate_series(200, 213) as middle_number
    union all
    select generate_series(300, 313)
  ) middle

  union all

  select
    golden_number::text,
    'golden-circle',
    null::integer,
    case when golden_number between 600 and 611 then 2 else 8 end,
    case when golden_number between 600 and 611 then 4 else 12 end
  from (
    select generate_series(400, 405) as golden_number
    union all
    select generate_series(500, 505)
    union all
    select generate_series(600, 611)
  ) golden

  union all

  select
    balcony_number::text,
    'royal-balcony',
    10::integer,
    10::integer,
    10::integer
  from unnest(array[800, 801, 900, 901]) balcony_number
) physical_catalogue;

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
    select vt.minimum_capacity, vt.maximum_capacity
      into v_minimum, v_maximum
      from public.venue_tables vt
     where vt.is_physical
       and public.normalize_booking_capacity_zone(vt.section) = public.normalize_booking_capacity_zone(new.section)
       and vt.table_code = new.table_code
     limit 1;

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

drop trigger if exists show_tables_zone_capacity_guard on public.show_tables;

create trigger show_tables_zone_capacity_guard
before insert or update of show_id, section, capacity, capacity_configured, status, booking_id, is_physical
on public.show_tables
for each row
execute function public.enforce_show_table_zone_capacity();

-- Existing correctly numbered operational rows are retained and linked to the
-- new catalogue. Their explicit capacities are already inside approved ranges.
update public.show_tables st
set
  venue_table_id = vt.id,
  is_physical = true,
  capacity_configured = st.capacity is not null,
  updated_at = now()
from public.venue_tables vt
where vt.is_physical
  and st.table_code = vt.table_code
  and public.normalize_booking_capacity_zone(st.section) = public.normalize_booking_capacity_zone(vt.section);

-- Current/future active performances receive the physical identities. MR and
-- GC rows remain disabled and capacity-null until Floor configures them.
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
  s.id,
  vt.id,
  vt.table_code,
  vt.section,
  vt.capacity,
  vt.capacity is not null,
  case when vt.capacity is null then 'disabled'::public.table_status else 'available'::public.table_status end,
  null,
  '{}'::uuid[],
  case when vt.capacity is null then 'Capacity must be configured for this performance.' else null end,
  false,
  true,
  'public'::public.table_availability_scope
from public.shows s
cross join public.venue_tables vt
where s.date >= current_date
  and s.status::text = 'active'
  and vt.is_physical
on conflict (show_id, table_code) do nothing;

create or replace function public.map_booking_physical_table_atomic(
  p_booking_id uuid,
  p_expected_previous_table_id uuid,
  p_target_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_previous_table public.show_tables%rowtype;
  v_target_table public.show_tables%rowtype;
begin
  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.table_id is distinct from p_expected_previous_table_id then
    raise exception 'BOOKING_TABLE_ASSIGNMENT_CHANGED';
  end if;

  if v_booking.table_id is null then
    raise exception 'LEGACY_TABLE_ASSIGNMENT_REQUIRED';
  end if;

  select *
    into v_previous_table
    from public.show_tables
   where id = v_booking.table_id
   for update;

  if v_previous_table.id is null
     or v_previous_table.is_physical
     or v_previous_table.is_override
     or not (
       (public.normalize_booking_capacity_zone(v_previous_table.section) = 'golden-circle' and v_previous_table.table_code ~* '^GC[0-9]+$')
       or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'middle-ring' and v_previous_table.table_code ~* '^MR[0-9]+$')
       or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-booths' and v_previous_table.table_code ~* '^B[0-9]+$')
       or (public.normalize_booking_capacity_zone(v_previous_table.section) = 'royal-balcony' and v_previous_table.table_code ~* '^RB[0-9]+$')
     ) then
    raise exception 'LEGACY_TABLE_ASSIGNMENT_REQUIRED';
  end if;

  select *
    into v_target_table
    from public.show_tables
   where id = p_target_table_id
   for update;

  if v_target_table.id is null
     or v_target_table.show_id <> v_booking.show_id
     or public.normalize_booking_capacity_zone(v_target_table.section) <> public.normalize_booking_capacity_zone(v_booking.section)
     or not v_target_table.is_physical
     or not v_target_table.capacity_configured
     or v_target_table.capacity is null
     or v_target_table.capacity < v_booking.guest_count
     or v_target_table.status::text = 'disabled'
     or (v_target_table.booking_id is not null and v_target_table.booking_id <> v_booking.id) then
    raise exception 'PHYSICAL_TABLE_NOT_AVAILABLE';
  end if;

  if v_booking.table_id = v_target_table.id then
    return jsonb_build_object(
      'booking_id', v_booking.id,
      'previous_table_id', v_booking.table_id,
      'target_table_id', v_target_table.id,
      'target_table_code', v_target_table.table_code
    );
  end if;

  update public.show_tables
     set booking_id = v_booking.id,
         status = 'booked',
         updated_at = now()
   where id = v_target_table.id;

  update public.bookings
     set table_id = v_target_table.id,
         updated_at = now()
   where id = v_booking.id;

  if v_previous_table.id is not null and v_previous_table.id <> v_target_table.id then
    update public.show_tables
       set booking_id = null,
           status = 'available',
           updated_at = now()
     where id = v_previous_table.id
       and booking_id = v_booking.id;
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'previous_table_id', v_previous_table.id,
    'previous_table_code', v_previous_table.table_code,
    'target_table_id', v_target_table.id,
    'target_table_code', v_target_table.table_code
  );
end
$$;

revoke all on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) from public;
revoke all on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) from anon;
revoke all on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.map_booking_physical_table_atomic(uuid, uuid, uuid) to service_role;
