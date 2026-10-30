-- Phase 68 keeps the existing atomic assignment engines and changes only the
-- tie-break order used after a split becomes necessary. Single-table fit,
-- table count, capacity, minimum occupancy, locks and thresholds are unchanged.

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.try_automatic_table_assignment(uuid)'::regprocedure
  ) into v_definition;

  v_updated := regexp_replace(
    v_definition,
    $pattern$case when approved\.maximum_guests >= v_booking\.guest_count - v_candidate_capacity then 0 else 1 end,$pattern$,
    $replacement$case when approved.maximum_guests >= v_booking.guest_count - v_candidate_capacity then 0 else 1 end,
       case
         when v_candidate_capacity > 0
          and approved.maximum_guests >= v_booking.guest_count - v_candidate_capacity
         then abs(
           approved.sort_order - coalesce((
             select anchor.sort_order
             from public.show_tables anchor_table
             join public.physical_seating_layout_tables anchor
               on anchor.layout_version_id = v_adoption.layout_version_id
              and anchor.table_code = anchor_table.table_code
             where anchor_table.id = v_candidate_ids[1]
           ), approved.sort_order)
         )
         else 0
       end asc,$replacement$
  );

  if v_updated = v_definition then
    raise exception 'PHASE_68_PRIMARY_ASSIGNMENT_PATTERN_NOT_FOUND';
  end if;

  execute v_updated;

  select pg_get_functiondef(
    'public.try_hybrid_table_assignment_phase_54_11(uuid)'::regprocedure
  ) into v_definition;

  v_updated := regexp_replace(
    v_definition,
    $pattern$case when table_row\.capacity >=[[:space:]]+v_booking\.guest_count - v_candidate_capacity then 0 else 1 end,$pattern$,
    $replacement$case when table_row.capacity >=
        v_booking.guest_count - v_candidate_capacity then 0 else 1 end,
      case
        when v_candidate_capacity > 0
         and table_row.capacity >=
           v_booking.guest_count - v_candidate_capacity
        then coalesce(abs(
          (select candidate.sort_order
           from public.physical_seating_layout_tables candidate
           where candidate.layout_version_id = v_layout_version_id
             and candidate.table_code = table_row.table_code) -
          (select anchor.sort_order
           from public.show_tables anchor_table
           join public.physical_seating_layout_tables anchor
             on anchor.layout_version_id = v_layout_version_id
            and anchor.table_code = anchor_table.table_code
           where anchor_table.id = v_candidate_ids[1])
        ), 2147483647)
        else 0
      end asc,$replacement$
  );

  if v_updated = v_definition then
    raise exception 'PHASE_68_HYBRID_ASSIGNMENT_PATTERN_NOT_FOUND';
  end if;

  execute v_updated;
end;
$migration$;

comment on function public.try_automatic_table_assignment(uuid) is
  'Atomic approved-layout assignment: single-table fit first, then minimum-table compatible proximity using approved master order.';

comment on function public.try_hybrid_table_assignment_phase_54_11(uuid) is
  'Atomic hybrid assignment: single-table fit first, then compatible proximity where approved master order is available.';
