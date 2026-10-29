-- Phase 59.1: Media and Tradex are fully complimentary. Remove the Phase 59
-- financial repricing branch while preserving every later guest-count,
-- table-fit, capacity, permission and audit safeguard. Existing rows are not
-- rewritten; new R0 COMP bookings use the Phase 46 complimentary path.

begin;

do $migration$
declare
  v_definition text;
  v_function regprocedure;
  v_declaration text := E'  v_reprice_chargeable_comp boolean := false;\n';
  v_reduction_block text := E'  if v_added_guests = 0\n     and p_guest_count < v_booking.guest_count\n     and v_metadata ->> ''complimentaryCategory'' in (''media'', ''tradex'')\n     and v_metadata #>> ''{pricingProvenance,source}'' = ''complimentary'' then\n    v_payment_basis := ''full'';\n    v_pricing_source := ''complimentary'';\n    v_unit_amount := nullif(v_metadata #>> ''{pricingProvenance,agreedPricePerPerson}'', '''')::numeric;\n    if v_unit_amount is null or v_unit_amount <= 0 then\n      raise exception ''COMP_CATEGORY_FINANCIAL_BASIS_REQUIRED'';\n    end if;\n    v_new_total := round(p_guest_count * v_unit_amount, 2);\n    v_new_subtotal := v_new_total;\n    if v_booking.amount_paid > v_new_total then\n      raise exception ''COMP_CATEGORY_REDUCTION_FINANCIAL_REVIEW_REQUIRED'';\n    end if;\n    v_new_balance := round(v_new_total - v_booking.amount_paid, 2);\n    v_new_payment_status := case\n      when v_booking.amount_paid <= 0 then ''pending_payment''::public.payment_status\n      when v_new_balance <= 0 then ''fully_paid''::public.payment_status\n      else ''deposit_paid''::public.payment_status\n    end;\n    v_additional_amount := round((p_guest_count - v_booking.guest_count) * v_unit_amount, 2);\n    v_reprice_chargeable_comp := true;\n  end if;\n\n';
begin
  v_function := to_regprocedure(
    'public.reconcile_booking_guest_count_financials_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'GUEST_COUNT_RECONCILIATION_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);
  if position(v_declaration in v_definition) > 0 then
    if position(v_reduction_block in v_definition) = 0 then
      raise exception 'PHASE_59_CHARGEABLE_COMP_BLOCK_NOT_FOUND';
    end if;
    v_definition := replace(v_definition, v_declaration, '');
    v_definition := replace(v_definition, v_reduction_block, '');
    v_definition := replace(
      v_definition,
      'v_added_guests > 0 or v_reprice_chargeable_comp',
      'v_added_guests > 0'
    );
    execute v_definition;
  end if;

  v_definition := pg_get_functiondef(v_function);
  if position('v_reprice_chargeable_comp' in v_definition) > 0
     or position('COMP_CATEGORY_FINANCIAL_BASIS_REQUIRED' in v_definition) > 0
     or position('COMP_CATEGORY_REDUCTION_FINANCIAL_REVIEW_REQUIRED' in v_definition) > 0
     or position('public.booking_table_claims_fit_guest_count' in v_definition) = 0
     or position('v_pricing_source = ''complimentary''' in v_definition) = 0 then
    raise exception 'PHASE_59_1_COMP_RECONCILIATION_INCOMPLETE';
  end if;
end;
$migration$;

commit;
