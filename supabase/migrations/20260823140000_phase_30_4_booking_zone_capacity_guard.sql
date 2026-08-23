-- Prevent future booking writes from increasing a show's active zone
-- entitlement beyond the fixed venue ceiling. Existing imported over-capacity
-- rows remain unchanged, and unchanged/reducing edits remain allowed.

create or replace function public.normalize_booking_capacity_zone(p_section text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_section, '')))
    when 'golden circle' then 'golden-circle'
    when 'golden-circle' then 'golden-circle'
    when 'middle ring' then 'middle-ring'
    when 'middle-ring' then 'middle-ring'
    when 'private booth' then 'royal-booths'
    when 'private booths' then 'royal-booths'
    when 'royal booth' then 'royal-booths'
    when 'royal booths' then 'royal-booths'
    when 'royal-booths' then 'royal-booths'
    when 'booth' then 'royal-booths'
    when 'booths' then 'royal-booths'
    when 'royal balcony' then 'royal-balcony'
    when 'royal-balcony' then 'royal-balcony'
    else null
  end
$$;

create or replace function public.booking_capacity_zone_limit(p_zone text)
returns integer
language sql
immutable
as $$
  select case p_zone
    when 'golden-circle' then 148
    when 'middle-ring' then 132
    when 'royal-booths' then 138
    when 'royal-balcony' then 40
    else null
  end
$$;

create or replace function public.enforce_booking_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing_entitlement integer := 0;
  v_limit integer;
  v_new_contribution integer := 0;
  v_new_occupies boolean;
  v_new_zone text;
  v_old_contribution integer := 0;
  v_old_occupies boolean := false;
  v_old_zone text;
begin
  v_new_zone := public.normalize_booking_capacity_zone(new.section);
  v_limit := public.booking_capacity_zone_limit(v_new_zone);
  v_new_occupies :=
    new.archived_at is null
    and new.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

  if not v_new_occupies or v_limit is null then
    return new;
  end if;

  v_new_contribution := greatest(coalesce(new.guest_count, 0), 0);

  if tg_op = 'UPDATE' then
    v_old_zone := public.normalize_booking_capacity_zone(old.section);
    v_old_occupies :=
      old.archived_at is null
      and old.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');

    if v_old_occupies and old.show_id = new.show_id and v_old_zone = v_new_zone then
      v_old_contribution := greatest(coalesce(old.guest_count, 0), 0);

      -- Existing over-capacity records remain editable when the entitlement is
      -- unchanged or reduced. Only positive exposure is rejected.
      if v_new_contribution <= v_old_contribution then
        return new;
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.show_id::text || ':' || v_new_zone, 0)
  );

  select coalesce(sum(greatest(coalesce(b.guest_count, 0), 0)), 0)::integer
    into v_existing_entitlement
    from public.bookings b
   where b.show_id = new.show_id
     and b.archived_at is null
     and b.booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in')
     and public.normalize_booking_capacity_zone(b.section) = v_new_zone
     and (tg_op = 'INSERT' or b.id <> new.id);

  if v_existing_entitlement + v_new_contribution > v_limit then
    raise exception using
      errcode = '23514',
      message = format(
        'ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_new_zone,
        v_limit,
        v_existing_entitlement + v_new_contribution
      );
  end if;

  return new;
end
$$;

drop trigger if exists bookings_zone_capacity_guard on public.bookings;

create trigger bookings_zone_capacity_guard
before insert or update of show_id, section, guest_count, booking_status, archived_at
on public.bookings
for each row
execute function public.enforce_booking_zone_capacity();

create or replace function public.enforce_show_table_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active_capacity integer := 0;
  v_limit integer;
  v_merge_source_capacity integer := 0;
  v_merge_source_count integer := 0;
  v_new_active boolean;
  v_new_zone text;
  v_old_active boolean := false;
  v_old_zone text;
begin
  v_new_zone := public.normalize_booking_capacity_zone(new.section);
  v_limit := public.booking_capacity_zone_limit(v_new_zone);
  v_new_active := new.status::text <> 'disabled';

  if not v_new_active or v_limit is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_zone := public.normalize_booking_capacity_zone(old.section);
    v_old_active := old.status::text <> 'disabled';

    if v_old_active
       and old.show_id = new.show_id
       and v_old_zone = v_new_zone
       and greatest(coalesce(new.capacity, 0), 0) <= greatest(coalesce(old.capacity, 0), 0) then
      return new;
    end if;
  elsif cardinality(coalesce(new.merged_from, '{}'::uuid[])) > 0 then
    select
      count(*)::integer,
      coalesce(sum(greatest(coalesce(st.capacity, 0), 0)), 0)::integer
      into v_merge_source_count, v_merge_source_capacity
      from public.show_tables st
     where st.id = any(new.merged_from)
       and st.show_id = new.show_id
       and st.status::text = 'disabled'
       and public.normalize_booking_capacity_zone(st.section) = v_new_zone;

    -- A merge replaces disabled source rows without increasing their combined
    -- operational capacity, including on a pre-existing over-capacity layout.
    if v_merge_source_count = cardinality(new.merged_from)
       and greatest(coalesce(new.capacity, 0), 0) <= v_merge_source_capacity then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.show_id::text || ':tables:' || v_new_zone, 0)
  );

  select coalesce(sum(greatest(coalesce(st.capacity, 0), 0)), 0)::integer
    into v_active_capacity
    from public.show_tables st
   where st.show_id = new.show_id
     and st.status::text <> 'disabled'
     and public.normalize_booking_capacity_zone(st.section) = v_new_zone
     and (tg_op = 'INSERT' or st.id <> new.id);

  if v_active_capacity + greatest(coalesce(new.capacity, 0), 0) > v_limit then
    raise exception using
      errcode = '23514',
      message = format(
        'TABLE_ZONE_CAPACITY_EXCEEDED|%s|%s|%s',
        v_new_zone,
        v_limit,
        v_active_capacity + greatest(coalesce(new.capacity, 0), 0)
      );
  end if;

  return new;
end
$$;

drop trigger if exists show_tables_zone_capacity_guard on public.show_tables;

create trigger show_tables_zone_capacity_guard
before insert or update of show_id, section, capacity, status
on public.show_tables
for each row
execute function public.enforce_show_table_zone_capacity();
