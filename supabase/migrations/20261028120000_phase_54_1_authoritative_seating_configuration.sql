-- Phase 54.1: additive, versioned physical seating authority.
-- Existing operational tables, show tables, assignments and ticket-sale limits
-- are intentionally untouched. Phase 54.2 must explicitly adopt a layout.

create table public.physical_seating_layout_versions (
  id uuid primary key default gen_random_uuid(),
  venue text not null check (venue in ('cape-town', 'johannesburg')),
  version_number integer not null check (version_number > 0),
  layout_name text not null,
  source_document text not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  approved_by_label text not null,
  approved_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  total_physical_capacity integer not null check (total_physical_capacity > 0),
  created_at timestamptz not null default now(),
  unique (venue, version_number),
  unique (id, venue)
);

create table public.physical_seating_layout_zones (
  layout_version_id uuid not null references public.physical_seating_layout_versions(id) on delete restrict,
  zone_id text not null check (zone_id in ('golden-circle', 'middle-ring', 'royal-booths', 'royal-balcony')),
  display_name text not null,
  approved_physical_capacity integer not null check (approved_physical_capacity > 0),
  sort_order integer not null check (sort_order > 0),
  primary key (layout_version_id, zone_id),
  unique (layout_version_id, sort_order)
);

create table public.physical_seating_layout_tables (
  id uuid primary key default gen_random_uuid(),
  layout_version_id uuid not null references public.physical_seating_layout_versions(id) on delete restrict,
  table_code text not null check (table_code ~ '^[0-9]+$'),
  zone_id text not null,
  maximum_guests integer not null check (maximum_guests > 0),
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  unique (layout_version_id, table_code),
  unique (layout_version_id, sort_order),
  foreign key (layout_version_id, zone_id)
    references public.physical_seating_layout_zones(layout_version_id, zone_id)
    on delete restrict
);

create table public.physical_seating_venue_settings (
  venue text primary key check (venue in ('cape-town', 'johannesburg')),
  approved_layout_version_id uuid not null,
  automatic_assignment_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (approved_layout_version_id, venue)
    references public.physical_seating_layout_versions(id, venue)
    on delete restrict
);

create table public.show_physical_seating_layouts (
  show_id uuid primary key references public.shows(id) on delete restrict,
  layout_version_id uuid not null references public.physical_seating_layout_versions(id) on delete restrict,
  adoption_status text not null default 'pending_reconciliation'
    check (adoption_status in ('pending_reconciliation', 'adopted')),
  automatic_assignment_enabled boolean not null default false,
  adopted_at timestamptz,
  adopted_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (adoption_status = 'pending_reconciliation' and adopted_at is null and adopted_by_staff_id is null)
    or
    (adoption_status = 'adopted' and adopted_at is not null and adopted_by_staff_id is not null)
  )
);

create table public.physical_seating_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete restrict,
  layout_version_id uuid not null references public.physical_seating_layout_versions(id) on delete restrict,
  reason text not null,
  evidence_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'not_applicable')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_staff_id uuid references public.staff_profiles(id) on delete restrict,
  resolution_notes text,
  unique (show_id, layout_version_id, reason),
  check (
    (status = 'pending' and resolved_at is null and resolved_by_staff_id is null)
    or status <> 'pending'
  )
);

create index physical_seating_layout_tables_lookup_idx
  on public.physical_seating_layout_tables(layout_version_id, zone_id, sort_order);
create index physical_seating_reconciliation_pending_idx
  on public.physical_seating_reconciliation_queue(status, show_id)
  where status = 'pending';
create index show_physical_seating_layout_version_idx
  on public.show_physical_seating_layouts(layout_version_id, adoption_status);

create or replace function public.prevent_approved_physical_layout_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception using
      errcode = '55000',
      message = 'APPROVED_PHYSICAL_LAYOUT_VERSION_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.prevent_approved_physical_layout_child_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_layout_version_id uuid;
begin
  v_layout_version_id := case
    when tg_op = 'INSERT' then new.layout_version_id
    else old.layout_version_id
  end;

  if exists (
    select 1
    from public.physical_seating_layout_versions version
    where version.id = v_layout_version_id
      and version.status = 'approved'
  ) then
    raise exception using
      errcode = '55000',
      message = 'APPROVED_PHYSICAL_LAYOUT_CONTENT_IMMUTABLE';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger physical_seating_layout_versions_immutable
before update or delete on public.physical_seating_layout_versions
for each row execute function public.prevent_approved_physical_layout_version_mutation();

create trigger physical_seating_layout_zones_immutable
before insert or update or delete on public.physical_seating_layout_zones
for each row execute function public.prevent_approved_physical_layout_child_mutation();

create trigger physical_seating_layout_tables_immutable
before insert or update or delete on public.physical_seating_layout_tables
for each row execute function public.prevent_approved_physical_layout_child_mutation();

insert into public.physical_seating_layout_versions (
  id,
  venue,
  version_number,
  layout_name,
  source_document,
  source_sha256,
  approved_by_label,
  approved_at,
  status,
  total_physical_capacity
)
values
  (
    '54010000-0000-4000-8000-000000000001',
    'cape-town',
    1,
    'Richard Approved Master',
    'Table Plan Template.xlsx',
    '43bf6bca8d0e1094aba7f05b01cc945a992dc4c77e590750db9d3dcfcd88a5b7',
    'Richard',
    now(),
    'draft',
    415
  ),
  (
    '54010000-0000-4000-8000-000000000002',
    'johannesburg',
    1,
    'Richard Approved Master',
    'Table Plan Template.xlsx',
    '43bf6bca8d0e1094aba7f05b01cc945a992dc4c77e590750db9d3dcfcd88a5b7',
    'Richard',
    now(),
    'draft',
    415
  );

with approved_zones(zone_id, display_name, capacity, sort_order) as (
  values
    ('golden-circle'::text, 'Golden Circle'::text, 120, 1),
    ('middle-ring', 'Middle Ring', 125, 2),
    ('royal-booths', 'Private Booths', 138, 3),
    ('royal-balcony', 'Royal Balcony (ESA)', 32, 4)
)
insert into public.physical_seating_layout_zones (
  layout_version_id,
  zone_id,
  display_name,
  approved_physical_capacity,
  sort_order
)
select version.id, zone.zone_id, zone.display_name, zone.capacity, zone.sort_order
from public.physical_seating_layout_versions version
cross join approved_zones zone
where version.id in (
  '54010000-0000-4000-8000-000000000001',
  '54010000-0000-4000-8000-000000000002'
);

with master_tables(table_code, zone_id, maximum_guests, sort_order) as (
  values
    ('1'::text, 'royal-booths'::text, 6, 1),
    ('2', 'royal-booths', 6, 2),
    ('3', 'royal-booths', 6, 3),
    ('4', 'royal-booths', 6, 4),
    ('5', 'royal-booths', 6, 5),
    ('6', 'royal-booths', 6, 6),
    ('7', 'royal-booths', 6, 7),
    ('8', 'royal-booths', 6, 8),
    ('9', 'royal-booths', 6, 9),
    ('10', 'royal-booths', 6, 10),
    ('11', 'royal-booths', 6, 11),
    ('12', 'royal-booths', 6, 12),
    ('14', 'royal-booths', 6, 13),
    ('15', 'royal-booths', 6, 14),
    ('16', 'royal-booths', 6, 15),
    ('17', 'royal-booths', 6, 16),
    ('18', 'royal-booths', 6, 17),
    ('19', 'royal-booths', 6, 18),
    ('20', 'royal-booths', 6, 19),
    ('21', 'royal-booths', 6, 20),
    ('22', 'royal-booths', 6, 21),
    ('23', 'royal-booths', 6, 22),
    ('24', 'royal-booths', 6, 23),
    ('200', 'middle-ring', 4, 24),
    ('201', 'middle-ring', 2, 25),
    ('202', 'middle-ring', 8, 26),
    ('203', 'middle-ring', 8, 27),
    ('204', 'middle-ring', 6, 28),
    ('205', 'middle-ring', 6, 29),
    ('206', 'middle-ring', 5, 30),
    ('207', 'middle-ring', 4, 31),
    ('208', 'middle-ring', 4, 32),
    ('209', 'middle-ring', 4, 33),
    ('210', 'middle-ring', 4, 34),
    ('211', 'middle-ring', 6, 35),
    ('300', 'middle-ring', 7, 36),
    ('301', 'middle-ring', 4, 37),
    ('302', 'middle-ring', 2, 38),
    ('303', 'middle-ring', 3, 39),
    ('304', 'middle-ring', 4, 40),
    ('305', 'middle-ring', 4, 41),
    ('306', 'middle-ring', 6, 42),
    ('307', 'middle-ring', 6, 43),
    ('308', 'middle-ring', 6, 44),
    ('309', 'middle-ring', 6, 45),
    ('310', 'middle-ring', 6, 46),
    ('400', 'middle-ring', 10, 47),
    ('401', 'golden-circle', 6, 48),
    ('402', 'golden-circle', 6, 49),
    ('403', 'golden-circle', 4, 50),
    ('404', 'golden-circle', 8, 51),
    ('405', 'golden-circle', 8, 52),
    ('406', 'golden-circle', 10, 53),
    ('500', 'golden-circle', 10, 54),
    ('501', 'golden-circle', 6, 55),
    ('502', 'golden-circle', 8, 56),
    ('503', 'golden-circle', 6, 57),
    ('504', 'golden-circle', 6, 58),
    ('505', 'golden-circle', 8, 59),
    ('506', 'golden-circle', 10, 60),
    ('600', 'golden-circle', 2, 61),
    ('601', 'golden-circle', 2, 62),
    ('602', 'golden-circle', 4, 63),
    ('603', 'golden-circle', 2, 64),
    ('604', 'golden-circle', 2, 65),
    ('605', 'golden-circle', 2, 66),
    ('606', 'golden-circle', 4, 67),
    ('607', 'golden-circle', 2, 68),
    ('608', 'golden-circle', 2, 69),
    ('609', 'golden-circle', 2, 70),
    ('900', 'royal-balcony', 8, 71),
    ('901', 'royal-balcony', 8, 72),
    ('800', 'royal-balcony', 8, 73),
    ('801', 'royal-balcony', 8, 74)
)
insert into public.physical_seating_layout_tables (
  layout_version_id,
  table_code,
  zone_id,
  maximum_guests,
  sort_order
)
select version.id, master.table_code, master.zone_id, master.maximum_guests, master.sort_order
from public.physical_seating_layout_versions version
cross join master_tables master
where version.id in (
  '54010000-0000-4000-8000-000000000001',
  '54010000-0000-4000-8000-000000000002'
);

do $$
declare
  v_invalid_versions integer;
begin
  select count(*) into v_invalid_versions
  from (
    select
      version.id,
      (select count(*) from public.physical_seating_layout_tables table_config
        where table_config.layout_version_id = version.id) as table_count,
      (select count(*) from public.physical_seating_layout_zones zone
        where zone.layout_version_id = version.id) as zone_count,
      (select coalesce(sum(table_config.maximum_guests), 0)
        from public.physical_seating_layout_tables table_config
        where table_config.layout_version_id = version.id) as table_capacity,
      version.total_physical_capacity as declared_capacity
    from public.physical_seating_layout_versions version
    where version.id in (
      '54010000-0000-4000-8000-000000000001',
      '54010000-0000-4000-8000-000000000002'
    )
  ) validation
  where validation.table_count <> 74
     or validation.zone_count <> 4
     or validation.table_capacity <> 415
     or validation.declared_capacity <> 415;

  if v_invalid_versions <> 0 then
    raise exception 'AUTHORITATIVE_PHYSICAL_LAYOUT_TOTALS_INVALID';
  end if;

  if exists (
    select 1
    from public.physical_seating_layout_zones zone
    left join lateral (
      select count(*)::integer as table_count, coalesce(sum(table_config.maximum_guests), 0)::integer as capacity
      from public.physical_seating_layout_tables table_config
      where table_config.layout_version_id = zone.layout_version_id
        and table_config.zone_id = zone.zone_id
    ) totals on true
    where totals.capacity <> zone.approved_physical_capacity
      or (zone.zone_id = 'golden-circle' and (totals.table_count <> 23 or totals.capacity <> 120))
      or (zone.zone_id = 'middle-ring' and (totals.table_count <> 24 or totals.capacity <> 125))
      or (zone.zone_id = 'royal-booths' and (totals.table_count <> 23 or totals.capacity <> 138))
      or (zone.zone_id = 'royal-balcony' and (totals.table_count <> 4 or totals.capacity <> 32))
  ) then
    raise exception 'AUTHORITATIVE_PHYSICAL_LAYOUT_ZONE_TOTALS_INVALID';
  end if;
end;
$$;

update public.physical_seating_layout_versions
set status = 'approved'
where id in (
  '54010000-0000-4000-8000-000000000001',
  '54010000-0000-4000-8000-000000000002'
);

insert into public.physical_seating_venue_settings (
  venue,
  approved_layout_version_id,
  automatic_assignment_enabled
)
values
  ('cape-town', '54010000-0000-4000-8000-000000000001', false),
  ('johannesburg', '54010000-0000-4000-8000-000000000002', false);

create or replace view public.physical_seating_layout_zone_validation
with (security_invoker = true)
as
select
  version.id as layout_version_id,
  version.venue,
  version.version_number,
  zone.zone_id,
  zone.display_name,
  count(table_config.id)::integer as table_count,
  coalesce(sum(table_config.maximum_guests), 0)::integer as configured_capacity,
  zone.approved_physical_capacity,
  coalesce(sum(table_config.maximum_guests), 0) = zone.approved_physical_capacity as reconciled
from public.physical_seating_layout_versions version
join public.physical_seating_layout_zones zone
  on zone.layout_version_id = version.id
left join public.physical_seating_layout_tables table_config
  on table_config.layout_version_id = zone.layout_version_id
 and table_config.zone_id = zone.zone_id
group by version.id, version.venue, version.version_number,
  zone.zone_id, zone.display_name, zone.approved_physical_capacity;

with active_entitlements as (
  select
    booking.show_id,
    public.normalize_booking_capacity_zone(item ->> 'zoneId') as zone_id,
    greatest(coalesce((item ->> 'pax')::integer, 0), 0)::integer as pax
  from public.bookings booking
  cross join lateral jsonb_array_elements(coalesce(booking.zone_entitlements, '[]'::jsonb)) item
  where booking.zone_entitlements is not null
    and booking.archived_at is null
    and booking.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')

  union all

  select
    booking.show_id,
    public.normalize_booking_capacity_zone(booking.section),
    greatest(coalesce(booking.guest_count, 0), 0)::integer
  from public.bookings booking
  where booking.zone_entitlements is null
    and booking.archived_at is null
    and booking.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
), zone_occupancy as (
  select show_id, zone_id, sum(pax)::integer as occupied_guests
  from active_entitlements
  where zone_id is not null
  group by show_id, zone_id
), conflicts as (
  select
    show.id as show_id,
    version.id as layout_version_id,
    show.venue,
    show.date,
    show.time,
    show.status::text as show_status,
    occupancy.zone_id,
    occupancy.occupied_guests,
    zone.approved_physical_capacity
  from public.shows show
  join public.physical_seating_layout_versions version
    on version.venue = show.venue
   and version.status = 'approved'
  join zone_occupancy occupancy
    on occupancy.show_id = show.id
  join public.physical_seating_layout_zones zone
    on zone.layout_version_id = version.id
   and zone.zone_id = occupancy.zone_id
  where show.date >= current_date
    and occupancy.occupied_guests > zone.approved_physical_capacity
), show_conflicts as (
  select
    show_id,
    layout_version_id,
    jsonb_build_object(
      'venue', max(venue),
      'performance_date', max(date),
      'performance_time', max(time),
      'show_status', max(show_status),
      'affected_zones', jsonb_agg(
        jsonb_build_object(
          'zone_id', zone_id,
          'occupied_guests', occupied_guests,
          'approved_physical_capacity', approved_physical_capacity,
          'excess_guests', occupied_guests - approved_physical_capacity
        ) order by zone_id
      )
    ) as evidence_snapshot
  from conflicts
  group by show_id, layout_version_id
)
insert into public.physical_seating_reconciliation_queue (
  show_id,
  layout_version_id,
  reason,
  evidence_snapshot
)
select
  conflict.show_id,
  conflict.layout_version_id,
  'active-bookings-exceed-approved-physical-zone-capacity',
  conflict.evidence_snapshot
from show_conflicts conflict;

create or replace function public.get_authoritative_show_table_availability(p_show_id uuid)
returns table (
  layout_version_id uuid,
  layout_table_id uuid,
  venue text,
  zone_id text,
  table_code text,
  maximum_guests integer,
  operational_table_id uuid,
  operational_capacity integer,
  operational_status text,
  booking_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    adoption.layout_version_id,
    table_config.id,
    version.venue,
    table_config.zone_id,
    table_config.table_code,
    table_config.maximum_guests,
    operational.id,
    operational.capacity,
    operational.status::text,
    operational.booking_id
  from public.show_physical_seating_layouts adoption
  join public.physical_seating_layout_versions version
    on version.id = adoption.layout_version_id
   and version.status = 'approved'
  join public.physical_seating_layout_tables table_config
    on table_config.layout_version_id = adoption.layout_version_id
  left join public.show_tables operational
    on operational.show_id = adoption.show_id
   and operational.table_code = table_config.table_code
   and public.normalize_booking_capacity_zone(operational.section) = table_config.zone_id
  where adoption.show_id = p_show_id
    and adoption.adoption_status = 'adopted'
  order by table_config.sort_order;
$$;

alter table public.physical_seating_layout_versions enable row level security;
alter table public.physical_seating_layout_zones enable row level security;
alter table public.physical_seating_layout_tables enable row level security;
alter table public.physical_seating_venue_settings enable row level security;
alter table public.show_physical_seating_layouts enable row level security;
alter table public.physical_seating_reconciliation_queue enable row level security;

revoke all on table public.physical_seating_layout_versions from public, anon, authenticated;
revoke all on table public.physical_seating_layout_zones from public, anon, authenticated;
revoke all on table public.physical_seating_layout_tables from public, anon, authenticated;
revoke all on table public.physical_seating_venue_settings from public, anon, authenticated;
revoke all on table public.show_physical_seating_layouts from public, anon, authenticated;
revoke all on table public.physical_seating_reconciliation_queue from public, anon, authenticated;
revoke all on table public.physical_seating_layout_zone_validation from public, anon, authenticated;

grant all on table public.physical_seating_layout_versions to service_role;
grant all on table public.physical_seating_layout_zones to service_role;
grant all on table public.physical_seating_layout_tables to service_role;
grant all on table public.physical_seating_venue_settings to service_role;
grant all on table public.show_physical_seating_layouts to service_role;
grant all on table public.physical_seating_reconciliation_queue to service_role;
grant select on table public.physical_seating_layout_zone_validation to service_role;

revoke all on function public.prevent_approved_physical_layout_version_mutation() from public, anon, authenticated;
revoke all on function public.prevent_approved_physical_layout_child_mutation() from public, anon, authenticated;
revoke all on function public.get_authoritative_show_table_availability(uuid) from public, anon, authenticated;
grant execute on function public.get_authoritative_show_table_availability(uuid) to service_role;

comment on table public.physical_seating_layout_versions is
  'Immutable approved physical seating masters, versioned independently per venue.';
comment on table public.physical_seating_layout_tables is
  'Authoritative physical table identities and maxima. Not ticket-sale capacity.';
comment on table public.physical_seating_venue_settings is
  'Venue pointer to the approved physical master. Automatic assignment remains disabled in Phase 54.1.';
comment on table public.show_physical_seating_layouts is
  'Explicit per-performance adoption boundary. Phase 54.1 creates no adoptions.';
comment on table public.physical_seating_reconciliation_queue is
  'Performances requiring controlled reconciliation before adopting an approved physical layout.';
comment on function public.get_authoritative_show_table_availability(uuid) is
  'Service-only future assignment input. Returns no rows until a performance is explicitly adopted.';
