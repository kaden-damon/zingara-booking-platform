-- Phase 46.3: widen only the authoritative permanent-table occupancy ranges.
-- Public and operational booking capacity remain independently configured.

create temporary table phase_46_3_expected_table_fit (
  group_name text not null,
  section text not null,
  table_code text not null,
  old_minimum integer not null,
  old_maximum integer not null,
  new_minimum integer not null,
  new_maximum integer not null,
  primary key (section, table_code)
) on commit drop;

insert into phase_46_3_expected_table_fit
  (group_name, section, table_code, old_minimum, old_maximum, new_minimum, new_maximum)
select 'Booths 1-24', 'royal-booths', code::text, 4, 6, 4, 8
from unnest(array[1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24]) code
union all
select '200s', 'middle-ring', code::text, 2, 8, 2, 8
from unnest(array[200,201,202,203,204,205,206,207,208,209,210,211,212,213]) code
union all
select '300s', 'middle-ring', code::text, 2, 8, 2, 8
from unnest(array[300,301,302,303,304,305,306,307,308,309,310,311,312,313]) code
union all
select '400s', 'golden-circle', code::text, 8, 12, 2, 12
from unnest(array[400,401,402,403,404,405]) code
union all
select '500s', 'golden-circle', code::text, 8, 12, 2, 12
from unnest(array[500,501,502,503,504,505]) code
union all
select '600s', 'golden-circle', code::text, 2, 4, 2, 4
from unnest(array[600,601,602,603,604,605,606,607,608,609,610,611]) code
union all
select '800s', 'royal-balcony', code::text, 10, 10, 2, 10
from unnest(array[800,801]) code
union all
select '900s', 'royal-balcony', code::text, 10, 10, 2, 10
from unnest(array[900,901]) code;

do $validation$
begin
  if (select count(*) from phase_46_3_expected_table_fit) <> 79 then
    raise exception 'Expected 79 permanent table identities for Phase 46.3';
  end if;

  if exists (
    select 1
    from phase_46_3_expected_table_fit expected
    left join public.venue_tables table_row
      on table_row.section = expected.section
     and table_row.table_code = expected.table_code
     and table_row.is_physical
    where table_row.id is null
  ) then
    raise exception 'A required permanent table identity is missing';
  end if;

  if exists (
    select 1
    from public.venue_tables table_row
    left join phase_46_3_expected_table_fit expected
      on expected.section = table_row.section
     and expected.table_code = table_row.table_code
    where table_row.is_physical
      and table_row.table_code ~ '^[0-9]+$'
      and (
        (table_row.section = 'royal-booths' and table_row.table_code::integer between 1 and 24)
        or (table_row.section = 'middle-ring' and table_row.table_code::integer between 200 and 399)
        or (table_row.section = 'golden-circle' and table_row.table_code::integer between 400 and 699)
        or (table_row.section = 'royal-balcony' and table_row.table_code::integer between 800 and 999)
      )
      and expected.table_code is null
  ) then
    raise exception 'An unreviewed permanent table identity falls inside a requested group';
  end if;

  if exists (
    select 1
    from phase_46_3_expected_table_fit expected
    join public.venue_tables table_row
      on table_row.section = expected.section
     and table_row.table_code = expected.table_code
     and table_row.is_physical
    where (table_row.minimum_capacity, table_row.maximum_capacity) not in (
      (expected.old_minimum, expected.old_maximum),
      (expected.new_minimum, expected.new_maximum)
    )
  ) then
    raise exception 'A permanent table range differs from both the reviewed before and requested after state';
  end if;
end
$validation$;

create temporary table phase_46_3_table_fit_changes on commit drop as
select
  table_row.id,
  expected.group_name,
  table_row.minimum_capacity as before_minimum,
  table_row.maximum_capacity as before_maximum,
  expected.new_minimum,
  expected.new_maximum
from public.venue_tables table_row
join phase_46_3_expected_table_fit expected
  on expected.section = table_row.section
 and expected.table_code = table_row.table_code
where table_row.is_physical
  and (table_row.minimum_capacity, table_row.maximum_capacity)
      is distinct from (expected.new_minimum, expected.new_maximum);

update public.venue_tables table_row
set
  minimum_capacity = expected.new_minimum,
  maximum_capacity = expected.new_maximum,
  updated_at = clock_timestamp()
from phase_46_3_expected_table_fit expected
where table_row.section = expected.section
  and table_row.table_code = expected.table_code
  and table_row.is_physical
  and (table_row.minimum_capacity, table_row.maximum_capacity)
      is distinct from (expected.new_minimum, expected.new_maximum);

insert into public.audit_events (
  actor_name,
  action,
  entity_type,
  entity_reference,
  entity_id,
  outcome,
  source_area,
  reason,
  before_values,
  after_values,
  changed_fields
)
select
  'SYSTEM',
  'venue-table.fit-range-updated',
  'venue-table-group',
  changes.group_name,
  'phase-46-3:' || lower(replace(changes.group_name, ' ', '-')),
  'success',
  'Operations Floor',
  'Jacques approved permanent-table occupancy range update; public and operational capacity unchanged.',
  jsonb_build_object(
    'minimum_capacity', min(changes.before_minimum),
    'maximum_capacity', max(changes.before_maximum),
    'table_count', count(*)
  ),
  jsonb_build_object(
    'minimum_capacity', min(changes.new_minimum),
    'maximum_capacity', max(changes.new_maximum),
    'table_count', count(*)
  ),
  array['minimum_capacity', 'maximum_capacity']
from phase_46_3_table_fit_changes changes
group by changes.group_name;
