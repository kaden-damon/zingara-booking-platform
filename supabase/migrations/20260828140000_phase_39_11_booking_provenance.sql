alter table public.bookings
  add column if not exists booking_origin text,
  add column if not exists created_by_staff_id uuid,
  add column if not exists provenance_recorded_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_booking_origin_check;

alter table public.bookings
  add constraint bookings_booking_origin_check
  check (
    booking_origin is null or booking_origin in (
      'customer_public',
      'corporate',
      'admin_staff',
      'data_import',
      'other',
      'legacy_unknown'
    )
  );

alter table public.bookings
  drop constraint if exists bookings_created_by_staff_id_fkey;

alter table public.bookings
  add constraint bookings_created_by_staff_id_fkey
  foreign key (created_by_staff_id)
  references public.staff_profiles(id)
  on update restrict
  on delete restrict;

create index if not exists bookings_booking_origin_idx
  on public.bookings (booking_origin, created_at desc);

create index if not exists bookings_created_by_staff_id_idx
  on public.bookings (created_by_staff_id, created_at desc);

create or replace function public.assign_booking_provenance_from_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_creator text;
begin
  if new.booking_origin is null
     and new.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(
        new.notes from length('__zingara_booking_meta__:') + 1
      )::jsonb;
      new.booking_origin := nullif(v_metadata ->> 'bookingOrigin', '');
      v_creator := nullif(v_metadata ->> 'createdByStaffId', '');

      if new.created_by_staff_id is null and v_creator is not null then
        new.created_by_staff_id := v_creator::uuid;
      end if;
    exception
      when others then
        new.booking_origin := null;
        new.created_by_staff_id := null;
    end;
  end if;

  if new.booking_origin is not null then
    if new.booking_origin not in (
      'customer_public',
      'corporate',
      'admin_staff',
      'data_import',
      'other',
      'legacy_unknown'
    ) then
      raise exception 'BOOKING_PROVENANCE_ORIGIN_INVALID';
    end if;

    new.provenance_recorded_at := coalesce(
      new.provenance_recorded_at,
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_assign_creation_provenance on public.bookings;
create trigger bookings_assign_creation_provenance
  before insert on public.bookings
  for each row execute function public.assign_booking_provenance_from_metadata();

create or replace function public.prevent_booking_provenance_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.provenance_recorded_at is not null
     and (
       new.booking_origin is distinct from old.booking_origin
       or new.created_by_staff_id is distinct from old.created_by_staff_id
       or new.provenance_recorded_at is distinct from old.provenance_recorded_at
     ) then
    raise exception 'BOOKING_PROVENANCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_provenance_immutable on public.bookings;
create trigger bookings_provenance_immutable
  before update on public.bookings
  for each row execute function public.prevent_booking_provenance_mutation();

create unique index if not exists audit_events_booking_provenance_unique_idx
  on public.audit_events (entity_id, action)
  where action = 'booking.provenance-recorded';

create or replace function public.audit_booking_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff_profiles%rowtype;
begin
  if new.provenance_recorded_at is null
     or (
       tg_op = 'UPDATE'
       and old.provenance_recorded_at is not null
     ) then
    return new;
  end if;

  if new.created_by_staff_id is not null then
    select * into v_staff
      from public.staff_profiles
     where id = new.created_by_staff_id;
  end if;

  insert into public.audit_events (
    actor_staff_profile_id,
    actor_auth_user_id,
    actor_name,
    actor_location_scope,
    action,
    entity_type,
    entity_reference,
    entity_id,
    outcome,
    source_area,
    reason,
    after_values,
    changed_fields
  )
  values (
    new.created_by_staff_id,
    v_staff.user_id,
    v_staff.full_name,
    coalesce(v_staff.venue_scope, '{}'),
    'booking.provenance-recorded',
    'booking',
    new.booking_reference,
    new.id::text,
    'success',
    case new.booking_origin
      when 'data_import' then 'Data Portability'
      when 'customer_public' then 'Public Booking'
      when 'corporate' then 'Corporate'
      else 'Bookings'
    end,
    'Original booking source and creator recorded.',
    jsonb_build_object(
      'booking_origin', new.booking_origin,
      'created_by_staff_id', new.created_by_staff_id,
      'provenance_recorded_at', new.provenance_recorded_at
    ),
    array['booking_origin', 'created_by_staff_id', 'provenance_recorded_at']
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists bookings_audit_creation_provenance on public.bookings;
create trigger bookings_audit_creation_provenance
  after insert or update of booking_origin, created_by_staff_id, provenance_recorded_at
  on public.bookings
  for each row execute function public.audit_booking_provenance();

create or replace function public.record_successful_booking_import_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dataset <> 'bookings'
     or new.final_status <> 'success'
     or old.final_status = 'success' then
    return new;
  end if;

  with created_references as (
    select distinct item ->> 'reference' as booking_reference
      from jsonb_array_elements(new.result_log) item
     where item ->> 'status' = 'Success'
       and item ->> 'action' = 'Create'
       and coalesce(item ->> 'reference', '') <> ''
  )
  update public.bookings booking
     set booking_origin = 'data_import',
         created_by_staff_id = new.initiated_by,
         provenance_recorded_at = coalesce(new.completed_at, now())
    from created_references created
   where booking.booking_reference = created.booking_reference
     and booking.provenance_recorded_at is null;

  return new;
end;
$$;

drop trigger if exists data_portability_record_booking_provenance
  on public.data_portability_import_runs;
create trigger data_portability_record_booking_provenance
  after update of final_status, result_log
  on public.data_portability_import_runs
  for each row execute function public.record_successful_booking_import_provenance();

revoke all on function public.assign_booking_provenance_from_metadata() from public, anon, authenticated;
revoke all on function public.prevent_booking_provenance_mutation() from public, anon, authenticated;
revoke all on function public.audit_booking_provenance() from public, anon, authenticated;
revoke all on function public.record_successful_booking_import_provenance() from public, anon, authenticated;
