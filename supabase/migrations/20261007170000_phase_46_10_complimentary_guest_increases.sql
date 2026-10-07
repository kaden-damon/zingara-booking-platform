-- Phase 46.10: a proven Complimentary booking has an intentional R0 price.
-- Allow that narrow state through the existing atomic guest-count workflow
-- while preserving every capacity, table-fit, ticket, permission and audit guard.

begin;

do $migration$
declare
  v_definition text;
  v_function regprocedure;
  v_old_guard text := E'    if v_payment_basis not in (''deposit'', ''full'')\n       or v_unit_amount is null or v_unit_amount <= 0 then\n      raise exception ''ADDED_GUEST_FINANCIAL_BASIS_REQUIRED'';\n    end if;';
  v_new_guard text := E'    if v_payment_basis not in (''deposit'', ''full'')\n       or v_unit_amount is null\n       or (\n         v_unit_amount <= 0\n         and not (\n           v_payment_basis = ''full''\n           and v_pricing_source = ''complimentary''\n           and v_booking.payment_status::text = ''comp_vip''\n           and v_booking.subtotal_amount = 0\n           and v_booking.total_amount = 0\n           and v_booking.amount_paid = 0\n           and v_booking.balance_outstanding = 0\n         )\n       ) then\n      raise exception ''ADDED_GUEST_FINANCIAL_BASIS_REQUIRED'';\n    end if;';
  v_old_status text := E'    v_new_payment_status := case\n      when v_booking.amount_paid <= 0 then ''pending_payment''::public.payment_status\n      when v_new_balance <= 0 then ''fully_paid''::public.payment_status\n      else ''deposit_paid''::public.payment_status\n    end;';
  v_new_status text := E'    v_new_payment_status := case\n      when v_payment_basis = ''full''\n       and v_pricing_source = ''complimentary''\n       and v_booking.payment_status::text = ''comp_vip''\n       and v_unit_amount = 0\n        then ''comp_vip''::public.payment_status\n      when v_booking.amount_paid <= 0 then ''pending_payment''::public.payment_status\n      when v_new_balance <= 0 then ''fully_paid''::public.payment_status\n      else ''deposit_paid''::public.payment_status\n    end;';
begin
  v_function := to_regprocedure(
    'public.reconcile_booking_guest_count_financials_atomic(text,timestamp with time zone,integer,text,uuid,uuid,text,text)'
  );
  if v_function is null then
    raise exception 'GUEST_COUNT_RECONCILIATION_FUNCTION_NOT_FOUND';
  end if;

  v_definition := pg_get_functiondef(v_function);

  if position('v_booking.payment_status::text = ''comp_vip''' in v_definition) = 0 then
    if position(v_old_guard in v_definition) = 0 then
      raise exception 'EXPECTED_ADDED_GUEST_FINANCIAL_GUARD_NOT_FOUND';
    end if;
    if position(v_old_status in v_definition) = 0 then
      raise exception 'EXPECTED_ADDED_GUEST_PAYMENT_STATUS_RESOLVER_NOT_FOUND';
    end if;
    if position('public.booking_table_claims_fit_guest_count' in v_definition) = 0 then
      raise exception 'CURRENT_TABLE_FIT_GUARD_NOT_FOUND';
    end if;

    v_definition := replace(v_definition, v_old_guard, v_new_guard);
    v_definition := replace(v_definition, v_old_status, v_new_status);
    v_definition := replace(
      v_definition,
      '''payment_basis'', v_payment_basis, ''unit_amount'', v_unit_amount',
      '''payment_basis'', v_payment_basis, ''pricing_source'', v_pricing_source, ''unit_amount'', v_unit_amount'
    );
    execute v_definition;
  end if;

  v_definition := pg_get_functiondef(v_function);
  if position('v_booking.payment_status::text = ''comp_vip''' in v_definition) = 0
     or position('v_pricing_source = ''complimentary''' in v_definition) = 0
     or position('v_booking.total_amount = 0' in v_definition) = 0
     or position('public.booking_table_claims_fit_guest_count' in v_definition) = 0
     or position('ADDED_GUEST_FINANCIAL_BASIS_REQUIRED' in v_definition) = 0 then
    raise exception 'COMPLIMENTARY_GUEST_INCREASE_GUARDS_INCOMPLETE';
  end if;
end;
$migration$;

commit;
