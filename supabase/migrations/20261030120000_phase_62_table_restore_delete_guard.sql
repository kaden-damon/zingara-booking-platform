-- Phase 62: the table-capacity trigger validates NEW values for inserts and
-- updates. Deletes have no NEW row and must pass through so transactional
-- merged-table restoration can remove its show-scoped parent safely.

create or replace function public.enforce_show_table_zone_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_maximum integer;
  v_minimum integer;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

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
