-- Phase 59: chargeable Media and Tradex COMP bookings retain their explicit
-- R550-per-guest obligation when the guest count changes. Preserve the current
-- reconciliation implementation and every later seating/capacity safeguard.

begin;

do $migration$
declare
  v_definition text;
  v_function regprocedure;
  v_old_declaration text := E'  v_pricing_source text;\n  v_show public.shows%rowtype;';
  v_new_declaration text := E'  v_pricing_source text;\n  v_reprice_chargeable_comp boolean := false;\n  v_show public.shows%rowtype;';
  v_metadata_marker text := E'  if v_added_guests > 0 then\n    if v_metadata ? ''pricingProvenance'' then';
  v_reduction_block text := E'  if v_added_guests = 0\n     and p_guest_count < v_booking.guest_count\n     and v_metadata ->> ''complimentaryCategory'' in (''media'', ''tradex'')\n     and v_metadata #>> ''{pricingProvenance,source}'' = ''complimentary'' then\n    v_payment_basis := ''full'';\n    v_pricing_source := ''complimentary'';\n    v_unit_amount := nullif(v_metadata #>> ''{pricingProvenance,agreedPricePerPerson}'', '''')::numeric;\n    if v_unit_amount is null or v_unit_amount <= 0 then\n      raise exception ''COMP_CATEGORY_FINANCIAL_BASIS_REQUIRED'';\n    end if;\n    v_new_total := round(p_guest_count * v_unit_amount, 2);\n    v_new_subtotal := v_new_total;\n    if v_booking.amount_paid > v_new_total then\n      raise exception ''COMP_CATEGORY_REDUCTION_FINANCIAL_REVIEW_REQUIRED'';\n    end if;\n    v_new_balance := round(v_new_total - v_booking.amount_paid, 2);\n    v_new_payment_status := case\n      when v_booking.amount_paid <= 0 then ''pending_payment''::public.payment_status\n      when v_new_balance <= 0 then ''fully_paid''::public.payment_status\n      else ''deposit_paid''::public.payment_status\n    end;\n    v_additional_amount := round((p_guest_count - v_booking.guest_count) * v_unit_amount, 2);\n    v_reprice_chargeable_comp := true;\n  end if;\n\n  if v_added_guests > 0 then\n    if v_metadata ? ''pricingProvenance'' then';
  v_old_metadata_guard text := E'    if v_added_guests > 0 then\n      v_metadata := jsonb_set(v_metadata, ''{totalPrice}'', to_jsonb(v_new_total), true);';
  v_new_metadata_guard text := E'    if v_added_guests > 0 or v_reprice_chargeable_comp then\n      v_metadata := jsonb_set(v_metadata, ''{totalPrice}'', to_jsonb(v_new_total), true);';
  v_old_audit_guard text := E'    case when v_added_guests > 0 then array[''guest_count'', ''subtotal_amount'', ''total_amount'', ''balance_outstanding'', ''payment_status'', ''table_id''] else array[''guest_count'', ''table_id''] end,';
  v_new_audit_guard text := E'    case when v_added_guests > 0 or v_reprice_chargeable_comp then array[''guest_count'', ''subtotal_amount'', ''total_amount'', ''balance_outstanding'', ''payment_status'', ''table_id''] else array[''guest_count'', ''table_id''] end,';
begin
  v_function := to_regprocedure(
    'public.reconcile_booking_guest_count_financials_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'GUEST_COUNT_RECONCILIATION_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);

  if position('v_reprice_chargeable_comp boolean' in v_definition) = 0 then
    if position(v_old_declaration in v_definition) = 0
       or position(v_metadata_marker in v_definition) = 0
       or position(v_old_metadata_guard in v_definition) = 0
       or position(v_old_audit_guard in v_definition) = 0 then
      raise exception 'PHASE_59_RECONCILIATION_MARKERS_NOT_FOUND';
    end if;

    v_definition := replace(v_definition, v_old_declaration, v_new_declaration);
    v_definition := replace(v_definition, v_metadata_marker, v_reduction_block);
    v_definition := replace(v_definition, v_old_metadata_guard, v_new_metadata_guard);
    v_definition := replace(v_definition, v_old_audit_guard, v_new_audit_guard);
    execute v_definition;
  end if;

  v_definition := pg_get_functiondef(v_function);
  if position('v_reprice_chargeable_comp boolean' in v_definition) = 0
     or position('COMP_CATEGORY_REDUCTION_FINANCIAL_REVIEW_REQUIRED' in v_definition) = 0
     or position('public.booking_table_claims_fit_guest_count' in v_definition) = 0
     or position('v_added_guests > 0 or v_reprice_chargeable_comp' in v_definition) = 0 then
    raise exception 'PHASE_59_GUEST_COUNT_RECONCILIATION_INCOMPLETE';
  end if;
end;
$migration$;

commit;
