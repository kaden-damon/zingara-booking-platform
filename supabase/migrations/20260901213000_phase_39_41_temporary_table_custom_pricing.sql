-- Phase 39.41: optional show-specific pricing for temporary operational tables.

alter table public.show_tables
  add column if not exists custom_price_per_person numeric(10,2);

alter table public.show_tables
  drop constraint if exists show_tables_temporary_custom_price_check;

alter table public.show_tables
  add constraint show_tables_temporary_custom_price_check
  check (
    custom_price_per_person is null
    or (
      custom_price_per_person > 0
      and is_override
      and not is_physical
      and availability_scope = 'operational'
      and merged_parent_id is null
      and cardinality(merged_from) = 0
    )
  );

comment on column public.show_tables.custom_price_per_person is
  'Optional agreed per-person price for bookings deliberately created on this show-specific temporary table.';
