-- Payment plans describe instalments, not the ticket obligation for added guests.
-- Keep the old signature intact during rollout; the reviewed-price overload
-- preserves its capacity, permission, revision and COMP guards.
do $migration$
declare
  v_oid regprocedure := 'public.reconcile_booking_guest_count_financials_atomic(text,timestamptz,integer,text,uuid,uuid,text,text)'::regprocedure;
  d text := pg_get_functiondef(v_oid);
begin
  if md5(d) <> '4a04d2041ca867e849cb12acd334517d' then
    raise exception 'GUEST_INCREASE_FUNCTION_DRIFT';
  end if;
  if to_regprocedure('public.reconcile_booking_guest_count_financials_atomic(text,timestamptz,integer,text,uuid,uuid,text,text,numeric)') is not null then
    raise exception 'GUEST_INCREASE_OVERLOAD_ALREADY_EXISTS';
  end if;
  d := replace(d, 'p_user_agent text)', 'p_user_agent text, p_expected_additional_amount numeric)');
  d := replace(d, '  v_unit_amount numeric;', '  v_unit_amount numeric;
  v_native_full_ticket boolean := false;
  v_additional_gratuity numeric := 0;
  v_ticket_unit_amount numeric;
  v_saved_provenance jsonb;
  v_new_service_fee numeric;');
  d := replace(d, '  v_new_total := v_booking.total_amount;', '  v_new_total := v_booking.total_amount;
  v_new_service_fee := v_booking.service_fee;');
  d := replace(d,
    '    v_additional_amount := round(v_added_guests * v_unit_amount, 2);',
    '    if v_booking.booking_origin::text in (''admin_staff'', ''customer_public'')
       and v_booking.booking_source in (''admin'', ''online'')
       and v_pricing_source in (''standard-zone'', ''friends-family'', ''show-specific'') then
      v_ticket_unit_amount := coalesce(
        nullif(v_metadata #>> ''{pricingProvenance,agreedPricePerPerson}'', '''')::numeric,
        nullif(v_metadata ->> ''pricePerPerson'', '''')::numeric);
      if v_ticket_unit_amount is null or v_ticket_unit_amount <= 0 then
        raise exception ''ADDED_GUEST_FINANCIAL_BASIS_REQUIRED'';
      end if;
      v_saved_provenance := coalesce(v_metadata -> ''pricingProvenance'', jsonb_build_object(
        ''agreedPricePerPerson'',v_ticket_unit_amount,
        ''authorizedByStaffId'',v_booking.created_by_staff_id,
        ''depositPerPerson'',case when v_payment_basis=''deposit'' then v_unit_amount else 0 end,
        ''paymentModel'',v_payment_basis,''source'',v_pricing_source));
      v_unit_amount := v_ticket_unit_amount;
      v_native_full_ticket := true;
      if v_booking.service_fee > 0 and coalesce(v_metadata ->> ''gratuityPolicy'','''') <> ''pay-at-venue'' then
        v_additional_gratuity := round(round(v_added_guests * v_unit_amount,2) * 0.125,2);
      end if;
      v_new_service_fee := round(v_booking.service_fee + v_additional_gratuity,2);
    end if;
    v_additional_amount := round(v_added_guests * v_unit_amount, 2) + v_additional_gratuity;
    if p_expected_additional_amount is null or p_expected_additional_amount is distinct from v_additional_amount then
      raise exception ''ADDED_GUEST_PRICE_REVIEW_REQUIRED'';
    end if;');
  d := replace(d,
    'v_new_subtotal := round(v_booking.subtotal_amount + v_additional_amount, 2);',
    'v_new_subtotal := round(v_booking.subtotal_amount + v_additional_amount - v_additional_gratuity, 2);');
  d := replace(d,
    '      v_metadata := jsonb_set(v_metadata, ''{subtotalPrice}'', to_jsonb(v_new_subtotal), true);',
    '      v_metadata := jsonb_set(v_metadata, ''{subtotalPrice}'', to_jsonb(v_new_subtotal), true);
      v_metadata := jsonb_set(v_metadata, ''{serviceFeeAmount}'', to_jsonb(v_new_service_fee), true);');
  d := replace(d,
    '        jsonb_build_object(
          ''agreedPricePerPerson'', coalesce',
    '        case when v_native_full_ticket then v_saved_provenance else jsonb_build_object(
          ''agreedPricePerPerson'', coalesce');
  d := replace(d,
    '          ''source'', coalesce(v_pricing_source, ''standard-zone'')
        ),',
    '          ''source'', coalesce(v_pricing_source, ''standard-zone'')
        ) end,');
  d := replace(d, '         subtotal_amount = v_new_subtotal,',
    '         subtotal_amount = v_new_subtotal,
         service_fee = v_new_service_fee,');
  d := replace(d, '''additional_amount'', v_additional_amount)',
    '''additional_amount'', v_additional_amount, ''additional_gratuity'', v_additional_gratuity,
      ''service_fee'', v_new_service_fee, ''obligation_basis'', case when v_native_full_ticket then ''full-ticket'' else v_payment_basis end)');
  d := replace(d, 'jsonb_build_object(''guest_count'', v_booking.guest_count, ''total_amount'',',
    'jsonb_build_object(''guest_count'', v_booking.guest_count, ''service_fee'', v_booking.service_fee, ''total_amount'',');
  d := replace(d, 'array[''guest_count'', ''subtotal_amount'', ''total_amount''',
    'array[''guest_count'', ''subtotal_amount'', ''service_fee'', ''total_amount''');
  if position('v_native_full_ticket := true;' in d) = 0
    or position('case when v_native_full_ticket then v_saved_provenance else jsonb_build_object' in d) = 0
    or position('service_fee = v_new_service_fee' in d) = 0 then
    raise exception 'GUEST_INCREASE_PATCH_INCOMPLETE';
  end if;
  execute d;
end;
$migration$;

revoke all on function public.reconcile_booking_guest_count_financials_atomic(
  text,timestamptz,integer,text,uuid,uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.reconcile_booking_guest_count_financials_atomic(
  text,timestamptz,integer,text,uuid,uuid,text,text,numeric) to service_role;
