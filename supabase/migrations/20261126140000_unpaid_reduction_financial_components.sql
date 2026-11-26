-- Keep an unpaid reduction's saved ticket/gratuity components consistent with
-- its existing policy allocation. No historical booking or receipt is changed.
do $migration$
declare
  definition text := pg_get_functiondef('public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text)'::regprocedure);
  marker text;
begin
  if md5(definition) <> '4f38a4b71037c73ce338f0f9ebfb2f86' then
    raise exception 'GUEST_REDUCTION_TRANSACTION_DRIFT';
  end if;
  marker := '  -- Reject stale/altered previews';
  if position(marker in definition)=0 then raise exception 'GUEST_REDUCTION_PREVIEW_MARKER_MISSING'; end if;
  definition := replace(definition, marker, $patch$
  if b.amount_paid=0 and (
    (a->>'refundReviewAmount')::numeric<>0 or
    (a->>'barCreditAmount')::numeric<>0 or
    (a->>'gratuityRefundEligibleAmount')::numeric<>0
  ) then raise exception 'RETAINED_VALUE_ALLOCATION_MISMATCH'; end if;
  -- Reject stale/altered previews$patch$);
  marker := '  update public.bookings set notes=';
  if position(marker in definition)=0 then raise exception 'GUEST_REDUCTION_SAVE_MARKER_MISSING'; end if;
  definition := replace(definition, marker, $patch$
  if early and b.amount_paid=0 and b.booking_origin<>'data_import' then
    m:=m||jsonb_build_object('subtotalPrice',new_total-remaining_gratuity,
      'serviceFeeAmount',remaining_gratuity);
  end if;
  update public.bookings set notes=$patch$);
  marker := 'subtotal_amount=b.subtotal_amount-released_unpaid-unpaid_gratuity-balance_allocation,balance_outstanding=new_balance';
  if position(marker in definition)=0 then raise exception 'GUEST_REDUCTION_COMPONENT_MARKER_MISSING'; end if;
  definition := replace(definition, marker, $patch$subtotal_amount=case
    when early and b.amount_paid=0 and b.booking_origin<>'data_import'
      then new_total-remaining_gratuity
    else b.subtotal_amount-released_unpaid-unpaid_gratuity-balance_allocation end,
    service_fee=case when early and b.amount_paid=0 and b.booking_origin<>'data_import'
      then remaining_gratuity else service_fee end,balance_outstanding=new_balance$patch$);
  definition := replace(definition,
    '''total_amount'',b.total_amount,''amount_paid'',b.amount_paid),result,array[''guest_count'',''notes'']',
    '''total_amount'',b.total_amount,''amount_paid'',b.amount_paid,''subtotal_amount'',b.subtotal_amount,''service_fee'',b.service_fee),result,array[''guest_count'',''notes'',''subtotal_amount'',''service_fee'']');
  definition := replace(definition, '''policy_allocation'',a,''total_amount'',new_total',
    '''policy_allocation'',a,''subtotal_amount'',case when early and b.amount_paid=0 and b.booking_origin<>''data_import'' then new_total-remaining_gratuity else b.subtotal_amount-released_unpaid-unpaid_gratuity-balance_allocation end,''service_fee'',case when early and b.amount_paid=0 and b.booking_origin<>''data_import'' then remaining_gratuity else b.service_fee end,''total_amount'',new_total');
  execute definition;
end $migration$;
