-- Phase 68 follow-up: automatic seating may claim one operational table only.
-- Existing manual multi-table assignments and their audited service-role RPC
-- remain unchanged. These function-definition changes do not mutate bookings
-- or historical table claims.

do $migration$
declare
  v_definition text;
  v_signature regprocedure;
  v_signature_text text;
  v_updated text;
begin
  foreach v_signature_text in array array[
    'public.try_automatic_table_assignment(uuid)',
    'public.try_automatic_table_assignment_phase_54_5(uuid)',
    'public.try_hybrid_table_assignment_phase_54_11(uuid)',
    'public.try_phase55_existing_booking_assignment(uuid)'
  ] loop
    v_signature := v_signature_text::regprocedure;
    select pg_get_functiondef(v_signature) into v_definition;

    if v_signature_text = 'public.try_automatic_table_assignment(uuid)' then
      v_updated := replace(
        v_definition,
        '    v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;',
        '    v_candidate_capacity := v_candidate_capacity + v_candidate.capacity;
    exit;'
      );
    elsif v_signature_text =
      'public.try_automatic_table_assignment_phase_54_5(uuid)' then
      v_updated := regexp_replace(
        v_definition,
        '(v_candidate_minimum := v_candidate_minimum[[:space:][:print:]]*?;)',
        E'\\1\n    exit;'
      );
    else
      v_updated := replace(
        v_definition,
        '    v_candidate_minimum := v_candidate_minimum + v_unit_minimum;',
        '    v_candidate_minimum := v_candidate_minimum + v_unit_minimum;
    exit;'
      );
    end if;

    if v_updated = v_definition then
      raise exception 'PHASE_68_SINGLE_TABLE_LOOP_PATTERN_NOT_FOUND|%',
        v_signature_text;
    end if;

    if v_signature_text =
      'public.try_automatic_table_assignment_phase_54_5(uuid)' then
      v_definition := replace(
        v_updated,
        '  if v_candidate_capacity >= v_booking.guest_count',
        '  if cardinality(v_candidate_ids) > 1 then
    raise exception ''AUTOMATIC_MULTI_TABLE_ASSIGNMENT_BLOCKED'';
  end if;

  if v_candidate_capacity >= v_booking.guest_count'
      );
    else
      v_definition := replace(
        v_updated,
        '  if v_candidate_capacity < v_booking.guest_count then',
        '  if cardinality(v_candidate_ids) > 1 then
    raise exception ''AUTOMATIC_MULTI_TABLE_ASSIGNMENT_BLOCKED'';
  end if;

  if v_candidate_capacity < v_booking.guest_count then'
      );
    end if;

    if v_definition = v_updated then
      raise exception 'PHASE_68_SINGLE_TABLE_GUARD_PATTERN_NOT_FOUND|%',
        v_signature_text;
    end if;

    execute v_definition;
  end loop;
end;
$migration$;

comment on function public.try_automatic_table_assignment(uuid) is
  'Atomic approved-layout assignment: one suitable operational table or manual Box Office queue.';

comment on function public.try_automatic_table_assignment_phase_54_5(uuid) is
  'Single-table minimum-occupancy preflight before the automatic assignment engine.';

comment on function public.try_hybrid_table_assignment_phase_54_11(uuid) is
  'Atomic hybrid assignment: one independently validated table unit or manual Box Office queue.';

comment on function public.try_phase55_existing_booking_assignment(uuid) is
  'Phase 55 reconciliation restricted to one suitable operational table per booking.';
