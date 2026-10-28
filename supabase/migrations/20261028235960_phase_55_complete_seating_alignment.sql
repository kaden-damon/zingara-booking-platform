-- Phase 55: align current/future physical seating with Richard's approved
-- 74-table master, preserve protected arrangements, and reconcile only the
-- finite set of bookings that existed before this release activation.

begin;

create table if not exists public.seating_alignment_releases (
  release_key text primary key,
  activation_timestamp timestamptz not null,
  source_document text not null,
  source_sha256 text not null,
  approved_tables integer not null check (approved_tables = 74),
  approved_capacity integer not null check (approved_capacity = 415),
  created_at timestamptz not null default now()
);

create table if not exists public.phase55_seating_reconciliation_candidates (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  activation_timestamp timestamptz not null,
  booking_created_at timestamptz not null,
  guest_count integer not null check (guest_count > 0),
  zone_id text,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'manual', 'skipped')),
  reason_code text,
  result jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phase55_reconciliation_pending_idx
  on public.phase55_seating_reconciliation_candidates(status, show_id, booking_created_at)
  where status = 'pending';

alter table public.seating_alignment_releases enable row level security;
alter table public.phase55_seating_reconciliation_candidates enable row level security;
revoke all on table public.seating_alignment_releases from public, anon, authenticated;
revoke all on table public.phase55_seating_reconciliation_candidates from public, anon, authenticated;
grant select on table public.seating_alignment_releases to service_role;
grant select, update on table public.phase55_seating_reconciliation_candidates to service_role;

insert into public.seating_alignment_releases (
  release_key, activation_timestamp, source_document, source_sha256,
  approved_tables, approved_capacity
) values (
  'phase-55', clock_timestamp(), 'Table Plan Template.xlsx',
  '43bf6bca8d0e1094aba7f05b01cc945a992dc4c77e590750db9d3dcfcd88a5b7',
  74, 415
)
on conflict (release_key) do nothing;

alter table public.physical_seating_layout_tables
  add column if not exists minimum_guests integer generated always as (
    case
      when zone_id = 'royal-booths' then least(4, maximum_guests)
      else least(2, maximum_guests)
    end
  ) stored;

create or replace function public.resolve_approved_table_minimum_occupancy(
  p_table_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(approved.minimum_guests, venue_table.minimum_capacity)
  from public.show_tables table_row
  join public.shows show_row on show_row.id = table_row.show_id
  join public.physical_seating_venue_settings setting
    on setting.venue = case
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('cape-town', 'cape town') then 'cape-town'
      when lower(trim(coalesce(show_row.venue, ''))) in
        ('johannesburg', 'joburg') then 'johannesburg'
      else ''
    end
  left join public.physical_seating_layout_tables approved
    on approved.layout_version_id = setting.approved_layout_version_id
   and approved.table_code = table_row.table_code
   and approved.zone_id =
     public.normalize_booking_capacity_zone(table_row.section)
   and approved.maximum_guests = table_row.capacity
  left join public.venue_tables venue_table
    on venue_table.id = table_row.venue_table_id
   and venue_table.is_physical
  where table_row.id = p_table_id
    and table_row.is_physical
    and table_row.capacity_configured
    and table_row.capacity is not null
    and coalesce(cardinality(table_row.merged_from), 0) = 0;
$$;

revoke all on function public.resolve_approved_table_minimum_occupancy(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_approved_table_minimum_occupancy(uuid)
  to service_role;

create temporary table phase55_protected_tables on commit drop as
select table_row.id, to_jsonb(table_row) snapshot
from public.show_tables table_row
join public.shows show_row on show_row.id = table_row.show_id
where table_row.booking_id is not null
   or table_row.merged_parent_id is not null
   or coalesce(cardinality(table_row.merged_from), 0) > 0
   or table_row.is_override
   or (show_row.date + show_row.time) <
      (now() at time zone 'Africa/Johannesburg');

create temporary table phase55_safe_capacity on commit drop as
select table_row.id, table_row.show_id, approved.maximum_guests
from public.show_tables table_row
join public.shows show_row on show_row.id = table_row.show_id
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = setting.approved_layout_version_id
 and approved.table_code = table_row.table_code
 and approved.zone_id =
   public.normalize_booking_capacity_zone(table_row.section)
where (show_row.date + show_row.time) >=
      (now() at time zone 'Africa/Johannesburg')
  and table_row.is_physical
  and not table_row.is_override
  and table_row.booking_id is null
  and table_row.merged_parent_id is null
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and table_row.capacity is distinct from approved.maximum_guests;

create temporary table phase55_safe_zone on commit drop as
select table_row.id, table_row.show_id, approved.zone_id,
  approved.maximum_guests
from public.show_tables table_row
join public.shows show_row on show_row.id = table_row.show_id
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = setting.approved_layout_version_id
 and approved.table_code = table_row.table_code
where (show_row.date + show_row.time) >=
      (now() at time zone 'Africa/Johannesburg')
  and table_row.is_physical
  and not table_row.is_override
  and table_row.booking_id is null
  and table_row.merged_parent_id is null
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and public.normalize_booking_capacity_zone(table_row.section)
      <> approved.zone_id;

create temporary table phase55_missing_master on commit drop as
select show_row.id show_id, approved.table_code, approved.zone_id,
  approved.maximum_guests
from public.shows show_row
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
join public.physical_seating_layout_tables approved
  on approved.layout_version_id = setting.approved_layout_version_id
where (show_row.date + show_row.time) >=
      (now() at time zone 'Africa/Johannesburg')
  and not exists (
    select 1
    from public.show_tables table_row
    where table_row.show_id = show_row.id
      and table_row.table_code = approved.table_code
  );

create temporary table phase55_obsolete_available on commit drop as
select table_row.id, table_row.show_id
from public.show_tables table_row
join public.shows show_row on show_row.id = table_row.show_id
join public.physical_seating_venue_settings setting
  on setting.venue = case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('johannesburg', 'joburg') then 'johannesburg'
    else ''
  end
where (show_row.date + show_row.time) >=
      (now() at time zone 'Africa/Johannesburg')
  and table_row.is_physical
  and not table_row.is_override
  and table_row.booking_id is null
  and table_row.merged_parent_id is null
  and coalesce(cardinality(table_row.merged_from), 0) = 0
  and table_row.status::text = 'available'
  and not exists (
    select 1
    from public.physical_seating_layout_tables approved
    where approved.layout_version_id = setting.approved_layout_version_id
      and approved.table_code = table_row.table_code
  );

update public.show_tables table_row
set capacity = candidate.maximum_guests,
    capacity_configured = true,
    override_notes = case
      when table_row.override_notes =
        'Capacity must be configured before this table can be assigned.'
        then null
      else table_row.override_notes
    end,
    updated_at = now()
from phase55_safe_capacity candidate
where table_row.id = candidate.id;

update public.show_tables table_row
set section = case candidate.zone_id
      when 'golden-circle' then 'Golden Circle'
      when 'middle-ring' then 'Middle Ring'
      when 'royal-booths' then 'Private Booths'
      when 'royal-balcony' then 'Royal Balcony'
    end,
    capacity = candidate.maximum_guests,
    capacity_configured = true,
    override_notes = case
      when table_row.override_notes =
        'Capacity must be configured before this table can be assigned.'
        then null
      else table_row.override_notes
    end,
    updated_at = now()
from phase55_safe_zone candidate
where table_row.id = candidate.id;

insert into public.show_tables (
  show_id, table_code, section, capacity, status, booking_id,
  merged_parent_id, merged_from, override_notes, is_override,
  availability_scope, capacity_configured, is_physical
)
select candidate.show_id, candidate.table_code,
  case candidate.zone_id
    when 'golden-circle' then 'Golden Circle'
    when 'middle-ring' then 'Middle Ring'
    when 'royal-booths' then 'Private Booths'
    when 'royal-balcony' then 'Royal Balcony'
  end,
  candidate.maximum_guests, 'available', null, null, '{}'::uuid[], null,
  false, 'operational', true, true
from phase55_missing_master candidate;

update public.show_tables table_row
set status = 'disabled',
    override_notes = coalesce(
      nullif(trim(table_row.override_notes), ''),
      'Legacy permanent table is outside Richard approved master.'
    ),
    updated_at = now()
from phase55_obsolete_available candidate
where table_row.id = candidate.id;

insert into public.phase55_seating_reconciliation_candidates (
  booking_id, show_id, activation_timestamp, booking_created_at,
  guest_count, zone_id
)
select booking.id, booking.show_id, release.activation_timestamp,
  booking.created_at, booking.guest_count,
  public.normalize_booking_capacity_zone(booking.section)
from public.bookings booking
join public.shows show_row on show_row.id = booking.show_id
cross join public.seating_alignment_releases release
where release.release_key = 'phase-55'
  and (show_row.date + show_row.time) >=
      (release.activation_timestamp at time zone 'Africa/Johannesburg')
  and show_row.status::text in ('active', 'inactive', 'sold_out')
  and booking.created_at < release.activation_timestamp
  and booking.archived_at is null
  and booking.booking_status::text in (
    'new', 'pending_payment', 'confirmed', 'checked_in'
  )
  and booking.table_id is null
  and not exists (
    select 1 from public.show_tables claimed
    where claimed.booking_id = booking.id
      and claimed.merged_parent_id is null
  )
on conflict (booking_id) do nothing;

create table if not exists public.phase55_show_zone_capacity_exceptions (
  show_id uuid not null references public.shows(id) on delete restrict,
  zone_id text not null,
  approved_capacity integer not null,
  active_entitlement integer not null,
  excess_guests integer not null check (excess_guests > 0),
  activation_timestamp timestamptz not null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  primary key (show_id, zone_id, activation_timestamp)
);

alter table public.phase55_show_zone_capacity_exceptions enable row level security;
revoke all on table public.phase55_show_zone_capacity_exceptions
  from public, anon, authenticated;
grant select on table public.phase55_show_zone_capacity_exceptions to service_role;

with approved(zone_id, capacity) as (
  values
    ('golden-circle'::text, 120),
    ('middle-ring', 125),
    ('royal-booths', 138),
    ('royal-balcony', 32)
), exposure as (
  select show_row.id show_id, approved.zone_id, approved.capacity,
    coalesce(sum(public.booking_zone_entitlement_pax(
      booking.zone_entitlements, booking.section, booking.guest_count,
      approved.zone_id
    )) filter (
      where booking.archived_at is null
        and booking.booking_status::text in (
          'new', 'pending_payment', 'confirmed', 'checked_in'
        )
    ), 0)::integer active_entitlement
  from public.shows show_row
  cross join approved
  left join public.bookings booking on booking.show_id = show_row.id
  cross join public.seating_alignment_releases release
  where release.release_key = 'phase-55'
    and (show_row.date + show_row.time) >=
        (release.activation_timestamp at time zone 'Africa/Johannesburg')
  group by show_row.id, approved.zone_id, approved.capacity
)
insert into public.phase55_show_zone_capacity_exceptions (
  show_id, zone_id, approved_capacity, active_entitlement, excess_guests,
  activation_timestamp, evidence
)
select exposure.show_id, exposure.zone_id, exposure.capacity,
  exposure.active_entitlement,
  exposure.active_entitlement - exposure.capacity,
  release.activation_timestamp,
  jsonb_build_object(
    'rule', 'Existing guest entitlements preserved; no further base availability.',
    'approvedCapacity', exposure.capacity,
    'activeEntitlement', exposure.active_entitlement
  )
from exposure
cross join public.seating_alignment_releases release
where release.release_key = 'phase-55'
  and exposure.active_entitlement > exposure.capacity
on conflict do nothing;

update public.venue_settings
set settings = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(coalesce(settings, '{}'::jsonb),
                  '{zonePricing,golden-circle,maxSeats}', '120'::jsonb, true),
                '{zonePricing,golden-circle,maxTables}', '23'::jsonb, true),
              '{zonePricing,middle-ring,maxSeats}', '125'::jsonb, true),
            '{zonePricing,middle-ring,maxTables}', '24'::jsonb, true),
          '{zonePricing,royal-booths,maxSeats}', '138'::jsonb, true),
        '{zonePricing,royal-booths,maxTables}', '23'::jsonb, true),
      '{zonePricing,royal-balcony,maxSeats}', '32'::jsonb, true),
    '{zonePricing,royal-balcony,maxTables}', '4'::jsonb, true),
    operational_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(coalesce(operational_config, '{}'::jsonb),
                    '{zonePricing,golden-circle,maxSeats}', '120'::jsonb, true),
                  '{zonePricing,golden-circle,maxTables}', '23'::jsonb, true),
                '{zonePricing,middle-ring,maxSeats}', '125'::jsonb, true),
              '{zonePricing,middle-ring,maxTables}', '24'::jsonb, true),
            '{zonePricing,royal-booths,maxSeats}', '138'::jsonb, true),
          '{zonePricing,royal-booths,maxTables}', '23'::jsonb, true),
        '{zonePricing,royal-balcony,maxSeats}', '32'::jsonb, true),
      '{zonePricing,royal-balcony,maxTables}', '4'::jsonb, true),
    updated_at = now()
where venue_key = 'zingara-cape-town';

create or replace function public.booking_capacity_zone_limit(p_zone text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_configured text;
  v_fallback integer;
begin
  v_fallback := case p_zone
    when 'golden-circle' then 120
    when 'middle-ring' then 125
    when 'royal-booths' then 138
    when 'royal-balcony' then 32
    else null
  end;

  select settings -> 'zonePricing' -> p_zone ->> 'maxSeats'
    into v_configured
  from public.venue_settings
  where venue_key = 'zingara-cape-town'
  limit 1;

  if v_configured ~ '^[1-9][0-9]*$' then
    return v_configured::integer;
  end if;
  return v_fallback;
end
$$;

revoke all on function public.booking_capacity_zone_limit(text) from public;
grant execute on function public.booking_capacity_zone_limit(text)
  to anon, authenticated, service_role;

create or replace function public.try_phase55_existing_booking_assignment(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adoption public.show_physical_seating_layouts%rowtype;
  v_booking public.bookings%rowtype;
  v_booking_kind text := 'standard';
  v_candidate public.show_tables%rowtype;
  v_candidate_capacity integer := 0;
  v_candidate_count integer := 0;
  v_candidate_id uuid;
  v_candidate_ids uuid[] := '{}';
  v_candidate_codes text[] := '{}';
  v_candidate_minimum integer := 0;
  v_compatibility jsonb;
  v_layout_version_id uuid;
  v_occupancy integer := 0;
  v_occupancy_percent numeric(7,2) := 0;
  v_override_authorized boolean := false;
  v_result jsonb;
  v_settings public.physical_seating_venue_settings%rowtype;
  v_show public.shows%rowtype;
  v_threshold numeric(5,2) := 70;
  v_unit_minimum integer;
  v_venue text;
  v_zone text;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not exists (
    select 1
    from public.phase55_seating_reconciliation_candidates candidate
    join public.seating_alignment_releases release
      on release.release_key = 'phase-55'
    where candidate.booking_id = p_booking_id
      and candidate.status = 'pending'
      and candidate.activation_timestamp = release.activation_timestamp
      and v_booking.created_at < release.activation_timestamp
  ) then
    return jsonb_build_object(
      'outcome', 'skipped',
      'reason', 'PHASE_55_PREEXISTING_CANDIDATE_REQUIRED'
    );
  end if;

  if v_booking.id is null
     or v_booking.archived_at is not null
     or v_booking.booking_status::text not in (
       'new', 'pending_payment', 'confirmed', 'checked_in'
     )
     or v_booking.table_id is not null
     or exists (
       select 1 from public.show_tables claimed
       where claimed.booking_id = v_booking.id
         and claimed.merged_parent_id is null
     ) then
    return jsonb_build_object(
      'outcome', 'skipped', 'reason', 'BOOKING_NOT_ASSIGNABLE'
    );
  end if;

  select * into v_show
  from public.shows
  where id = v_booking.show_id;
  if v_show.id is null then
    return jsonb_build_object('outcome', 'skipped', 'reason', 'SHOW_NOT_FOUND');
  end if;

  v_venue := case
    when lower(trim(coalesce(v_show.venue, ''))) in ('cape-town', 'cape town')
      then 'cape-town'
    when lower(trim(coalesce(v_show.venue, ''))) in ('johannesburg', 'joburg')
      then 'johannesburg'
    else null
  end;

  select * into v_settings
  from public.physical_seating_venue_settings
  where venue = v_venue;
  if v_venue is null
     or not coalesce(v_settings.automatic_assignment_enabled, false)
     or v_settings.approved_layout_version_id is null then
    return jsonb_build_object(
      'outcome', 'skipped', 'reason', 'GLOBAL_FEATURE_DISABLED'
    );
  end if;
  v_layout_version_id := v_settings.approved_layout_version_id;

  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = v_booking.show_id;
  if v_adoption.assignment_state = 'manual_paused' then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'SHOW_MANUALLY_PAUSED'
    );
  end if;

  if exists (
    select 1 from public.corporate_buyouts buyout
    where buyout.booking_id = v_booking.id
  ) then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'BUYOUT_MANUAL_PLANNING'
    );
  end if;

  if v_booking.zone_entitlements is not null
     and jsonb_array_length(v_booking.zone_entitlements) > 1 then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'MULTI_ZONE_MANUAL_PLANNING'
    );
  end if;

  v_booking_kind := case
    when v_booking.booking_source = 'corporate-direct' then 'corporate'
    else 'standard'
  end;
  v_zone := public.normalize_booking_capacity_zone(v_booking.section);
  if v_zone is null then
    return jsonb_build_object(
      'outcome', 'manual_queue', 'reason', 'SEATING_ZONE_REVIEW_REQUIRED'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'automatic-table-assignment:' || v_booking.show_id::text,
    0
  ));

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if v_booking.table_id is not null
     or exists (
       select 1 from public.show_tables claimed
       where claimed.booking_id = v_booking.id
         and claimed.merged_parent_id is null
     ) then
    return jsonb_build_object(
      'outcome', 'skipped', 'reason', 'BOOKING_ALREADY_ASSIGNED'
    );
  end if;

  select * into v_adoption
  from public.show_physical_seating_layouts
  where show_id = v_booking.show_id
  for update;

  v_override_authorized := coalesce(
    v_adoption.threshold_override_active
    and v_adoption.assignment_state = 'enabled'
    and v_adoption.state_changed_by_staff_id is not null
    and nullif(trim(coalesce(v_adoption.state_change_reason, '')), '') is not null
    and exists (
      select 1
      from public.audit_events audit
      where audit.action = 'show.automatic-table-assignment-resume'
        and audit.outcome = 'success'
        and audit.entity_type = 'show'
        and audit.entity_id = v_booking.show_id::text
        and audit.actor_staff_profile_id = v_adoption.state_changed_by_staff_id
        and audit.created_at between
          v_adoption.state_changed_at - interval '5 seconds'
          and v_adoption.state_changed_at + interval '5 seconds'
        and coalesce(
          (audit.after_values ->> 'threshold_override_active')::boolean,
          false
        )
        and audit.after_values ->> 'assignment_state' = 'enabled'
    ),
    false
  );

  select coalesce(sum(active_booking.guest_count), 0)::integer
    into v_occupancy
  from public.bookings active_booking
  where active_booking.show_id = v_booking.show_id
    and active_booking.archived_at is null
    and active_booking.booking_status::text in (
      'new', 'pending_payment', 'confirmed', 'checked_in'
    );
  v_occupancy_percent := round(
    (v_occupancy::numeric / 415::numeric) * 100,
    2
  );
  v_threshold := coalesce(
    v_adoption.pause_threshold_percent,
    v_settings.default_pause_threshold_percent,
    70
  );

  -- Phase 55 candidates were snapshotted before activation. Only this exact
  -- finite set bypasses the 70% pause during the one-time reconciliation.
  while v_candidate_capacity < v_booking.guest_count loop
    select table_row.id,
      public.resolve_hybrid_table_minimum_occupancy(
        table_row.id,
        v_layout_version_id
      )
      into v_candidate_id, v_unit_minimum
    from public.show_tables table_row
    where table_row.show_id = v_booking.show_id
      and table_row.merged_parent_id is null
      and table_row.booking_id is null
      and table_row.status::text = 'available'
      and table_row.capacity_configured
      and table_row.capacity is not null
      and table_row.capacity > 0
      and public.normalize_booking_capacity_zone(table_row.section) = v_zone
      and public.resolve_hybrid_table_minimum_occupancy(
        table_row.id,
        v_layout_version_id
      ) is not null
      and v_candidate_minimum
        + public.resolve_hybrid_table_minimum_occupancy(
          table_row.id,
          v_layout_version_id
        ) <= v_booking.guest_count
      and not (table_row.id = any(v_candidate_ids))
    order by
      case when table_row.capacity >=
        v_booking.guest_count - v_candidate_capacity then 0 else 1 end,
      case when table_row.capacity >=
        v_booking.guest_count - v_candidate_capacity
        then table_row.capacity end asc,
      case when table_row.capacity <
        v_booking.guest_count - v_candidate_capacity
        then table_row.capacity end desc,
      table_row.table_code asc
    limit 1
    for update of table_row skip locked;

    exit when v_candidate_id is null;
    select * into v_candidate
    from public.show_tables
    where id = v_candidate_id;
    v_candidate_ids := array_append(v_candidate_ids, v_candidate.id);
    v_candidate_codes := array_append(v_candidate_codes, v_candidate.table_code);
    v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;
    v_candidate_minimum := v_candidate_minimum + v_unit_minimum;
  end loop;

  if v_candidate_capacity < v_booking.guest_count then
    return jsonb_build_object(
      'outcome', 'manual_queue',
      'reason', 'HYBRID_NO_SUITABLE_TABLE_UNIT'
    );
  end if;

  begin
    update public.show_tables table_row set
      booking_id = v_booking.id,
      status = 'booked',
      updated_at = now()
    where table_row.id = any(v_candidate_ids)
      and table_row.booking_id is null
      and table_row.status::text = 'available';
    get diagnostics v_candidate_count = row_count;
    if v_candidate_count <> cardinality(v_candidate_ids) then
      raise exception 'HYBRID_TABLE_SET_CHANGED';
    end if;

    update public.bookings booking set
      table_id = v_candidate_ids[1],
      updated_at = now()
    where booking.id = v_booking.id
      and booking.table_id is null;
    if not found then
      raise exception 'BOOKING_ALREADY_ASSIGNED';
    end if;

    v_compatibility := public.resolve_booking_table_assignment_compatibility(
      v_booking.id,
      v_booking.guest_count
    );
    if not coalesce((v_compatibility ->> 'compatible')::boolean, false) then
      raise exception 'HYBRID_ASSIGNMENT_INTEGRITY_FAILED|%',
        coalesce(v_compatibility ->> 'reason', 'UNKNOWN');
    end if;

    v_result := jsonb_build_object(
      'booking_id', v_booking.id,
      'booking_reference', v_booking.booking_reference,
      'show_id', v_booking.show_id,
      'table_ids', v_candidate_ids,
      'table_codes', v_candidate_codes,
      'combined_capacity', v_candidate_capacity,
      'combined_minimum', v_candidate_minimum
    );

    insert into public.automatic_table_assignment_attempts (
      booking_id, show_id, booking_reference, booking_kind, outcome,
      reason_code, reason_detail, target_table_id, target_table_code,
      target_table_ids, target_table_codes, occupancy_guests,
      occupancy_percent, threshold_percent
    ) values (
      v_booking.id, v_booking.show_id, v_booking.booking_reference,
      v_booking_kind, 'assigned', 'PHASE_55_PREEXISTING_SAFE_FIT',
      'Pre-activation booking assigned atomically to independently validated table units.',
      v_candidate_ids[1], v_candidate_codes[1], v_candidate_ids,
      v_candidate_codes, v_occupancy, v_occupancy_percent, v_threshold
    ) on conflict (booking_id) do nothing;

    insert into public.audit_events (
      action, actor_name, actor_location_scope, after_values, before_values,
      changed_fields, entity_id, entity_location, entity_reference,
      entity_type, outcome, reason, source_area
    ) values (
      'booking.table-phase55-reconciled', 'SYSTEM', array[v_venue],
      v_result || jsonb_build_object(
        'zone', v_zone,
        'minimumOccupancy', v_candidate_minimum,
        'thresholdOverrideUsed', v_override_authorized
      ),
      jsonb_build_object('table_id', null),
      array['table_id'], v_booking.id::text, v_venue,
      v_booking.booking_reference, 'booking', 'success',
      'Phase 55 reconciled this pre-activation booking without applying the new-booking threshold.',
      'Table Plan'
    );

    return v_result || jsonb_build_object('outcome', 'assigned');
  exception when others then
    return jsonb_build_object(
      'outcome', 'manual_queue',
      'reason', 'HYBRID_ATOMIC_ASSIGNMENT_CONFLICT',
      'detail', sqlstate
    );
  end;
exception when others then
  return jsonb_build_object(
    'outcome', 'skipped', 'reason', 'FAIL_SAFE', 'detail', sqlstate
  );
end;
$$;


revoke all on function public.try_phase55_existing_booking_assignment(uuid)
  from public, anon, authenticated;
grant execute on function public.try_phase55_existing_booking_assignment(uuid)
  to service_role;

create or replace function public.process_phase55_seating_reconciliation_batch(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned integer := 0;
  v_manual integer := 0;
  v_processed integer := 0;
  v_result jsonb;
  v_row record;
  v_skipped integer := 0;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'PHASE_55_BATCH_LIMIT_INVALID';
  end if;

  for v_row in
    select candidate.booking_id
    from public.phase55_seating_reconciliation_candidates candidate
    join public.shows show_row on show_row.id = candidate.show_id
    where candidate.status = 'pending'
    order by show_row.date, show_row.time, candidate.booking_created_at,
      candidate.booking_id
    limit p_limit
    for update of candidate skip locked
  loop
    v_result := public.try_phase55_existing_booking_assignment(
      v_row.booking_id
    );
    v_processed := v_processed + 1;

    update public.phase55_seating_reconciliation_candidates candidate
    set status = case v_result ->> 'outcome'
        when 'assigned' then 'assigned'
        when 'manual_queue' then 'manual'
        else 'skipped'
      end,
      reason_code = coalesce(v_result ->> 'reason',
        case when v_result ->> 'outcome' = 'assigned'
          then 'PHASE_55_PREEXISTING_SAFE_FIT' else 'UNKNOWN' end),
      result = v_result,
      processed_at = now()
    where candidate.booking_id = v_row.booking_id;

    if v_result ->> 'outcome' = 'assigned' then
      v_assigned := v_assigned + 1;
    elsif v_result ->> 'outcome' = 'manual_queue' then
      v_manual := v_manual + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'assigned', v_assigned,
    'manual', v_manual,
    'skipped', v_skipped,
    'remaining', (
      select count(*)
      from public.phase55_seating_reconciliation_candidates
      where status = 'pending'
    )
  );
end;
$$;

revoke all on function public.process_phase55_seating_reconciliation_batch(integer)
  from public, anon, authenticated;
grant execute on function public.process_phase55_seating_reconciliation_batch(integer)
  to service_role;

insert into public.audit_events (
  action, actor_name, actor_location_scope, after_values, before_values,
  changed_fields, entity_id, entity_reference, entity_type, outcome,
  reason, source_area
)
select 'show.phase55-seating-aligned', 'SYSTEM',
  array[case
    when lower(trim(coalesce(show_row.venue, ''))) in
      ('cape-town', 'cape town') then 'cape-town'
    else 'johannesburg'
  end],
  jsonb_build_object(
    'capacityCorrections', count(distinct capacity_fix.id),
    'zoneCorrections', count(distinct zone_fix.id),
    'masterTablesAdded', count(distinct missing.table_code),
    'obsoleteTablesDisabled', count(distinct obsolete.id),
    'activationTimestamp', release.activation_timestamp
  ),
  '{}'::jsonb,
  array['physical_table_configuration'],
  show_row.id::text,
  show_row.name,
  'show',
  'success',
  'Safe Phase 55 master alignment; assigned and operational arrangements preserved.',
  'Table Plan'
from public.shows show_row
cross join public.seating_alignment_releases release
left join phase55_safe_capacity capacity_fix
  on capacity_fix.show_id = show_row.id
left join phase55_safe_zone zone_fix
  on zone_fix.show_id = show_row.id
left join phase55_missing_master missing
  on missing.show_id = show_row.id
left join phase55_obsolete_available obsolete
  on obsolete.show_id = show_row.id
where release.release_key = 'phase-55'
  and (
    capacity_fix.id is not null
    or zone_fix.id is not null
    or missing.table_code is not null
    or obsolete.id is not null
  )
group by show_row.id, show_row.name, show_row.venue,
  release.activation_timestamp;

do $$
declare
  v_mutated integer;
  v_release timestamptz;
begin
  select activation_timestamp into v_release
  from public.seating_alignment_releases
  where release_key = 'phase-55';

  if (
    select count(*)
    from public.physical_seating_layout_tables
    where layout_version_id in (
      select approved_layout_version_id
      from public.physical_seating_venue_settings
    )
  ) <> 148 then
    raise exception 'PHASE_55_MASTER_TABLE_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from public.physical_seating_layout_tables table_row
    where table_row.layout_version_id in (
      select approved_layout_version_id
      from public.physical_seating_venue_settings
    )
    group by table_row.layout_version_id
    having count(*) <> 74
      or sum(table_row.maximum_guests) <> 415
      or sum(table_row.minimum_guests) <> 194
  ) then
    raise exception 'PHASE_55_MASTER_RECONCILIATION_INVALID';
  end if;

  select count(*) into v_mutated
  from phase55_protected_tables protected
  join public.show_tables table_row on table_row.id = protected.id
  where to_jsonb(table_row) is distinct from protected.snapshot;
  if v_mutated > 0 then
    raise exception 'PHASE_55_PROTECTED_TABLE_MUTATED|%', v_mutated;
  end if;

  if exists (
    select 1
    from public.show_tables table_row
    join public.shows show_row on show_row.id = table_row.show_id
    join public.physical_seating_venue_settings setting
      on setting.venue = case
        when lower(trim(coalesce(show_row.venue, ''))) in
          ('cape-town', 'cape town') then 'cape-town'
        when lower(trim(coalesce(show_row.venue, ''))) in
          ('johannesburg', 'joburg') then 'johannesburg'
        else ''
      end
    join public.physical_seating_layout_tables approved
      on approved.layout_version_id = setting.approved_layout_version_id
     and approved.table_code = table_row.table_code
     and approved.zone_id =
       public.normalize_booking_capacity_zone(table_row.section)
    where (show_row.date + show_row.time) >=
          (v_release at time zone 'Africa/Johannesburg')
      and table_row.is_physical
      and not table_row.is_override
      and table_row.booking_id is null
      and table_row.merged_parent_id is null
      and coalesce(cardinality(table_row.merged_from), 0) = 0
      and table_row.capacity is distinct from approved.maximum_guests
  ) then
    raise exception 'PHASE_55_SAFE_MASTER_CAPACITY_REMAINS';
  end if;

  if exists (
    select show_row.id
    from public.shows show_row
    join public.physical_seating_venue_settings setting
      on setting.venue = case
        when lower(trim(coalesce(show_row.venue, ''))) in
          ('cape-town', 'cape town') then 'cape-town'
        when lower(trim(coalesce(show_row.venue, ''))) in
          ('johannesburg', 'joburg') then 'johannesburg'
        else ''
      end
    join public.physical_seating_layout_tables approved
      on approved.layout_version_id = setting.approved_layout_version_id
    left join public.show_tables table_row
      on table_row.show_id = show_row.id
     and table_row.table_code = approved.table_code
    where (show_row.date + show_row.time) >=
          (v_release at time zone 'Africa/Johannesburg')
    group by show_row.id
    having count(table_row.id) <> 74
  ) then
    raise exception 'PHASE_55_MASTER_TABLE_IDENTITY_MISSING';
  end if;

  if public.booking_capacity_zone_limit('golden-circle') <> 120
     or public.booking_capacity_zone_limit('middle-ring') <> 125
     or public.booking_capacity_zone_limit('royal-booths') <> 138
     or public.booking_capacity_zone_limit('royal-balcony') <> 32 then
    raise exception 'PHASE_55_TICKET_CAPACITY_NOT_ALIGNED';
  end if;

  if exists (
    select show_id, table_code
    from public.show_tables
    group by show_id, table_code
    having count(*) > 1
  ) then
    raise exception 'PHASE_55_DUPLICATE_TABLE_CODE';
  end if;
end;
$$;

comment on table public.phase55_seating_reconciliation_candidates is
  'Finite Phase 55 pre-activation booking set; only these rows may bypass the new-booking automatic-assignment threshold during one-time seating reconciliation.';
comment on table public.phase55_show_zone_capacity_exceptions is
  'Current/future show-zone commitments above Richard approved physical capacity; guest entitlements are preserved and no additional base availability is created.';
comment on function public.process_phase55_seating_reconciliation_batch(integer) is
  'Processes Phase 55 pre-activation bookings in bounded, atomic and idempotent batches; new bookings remain subject to the configured threshold.';

commit;

