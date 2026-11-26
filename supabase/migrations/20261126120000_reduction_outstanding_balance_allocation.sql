-- Reuse the existing cancellation allocation transaction; no financial rows
-- change until an authorised, revision-checked guest amendment is submitted.
do $migration$
declare
  definition text := pg_get_functiondef('public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text)'::regprocedure);
  marker text;
begin
  if md5(definition) <> 'a310f5e3209c1af6830cba3f0604ec37' then
    raise exception 'GUEST_REDUCTION_TRANSACTION_DRIFT';
  end if;
  definition := replace(definition, '  credit numeric;', E'  credit numeric;\n  balance_allocation numeric := 0;');
  definition := replace(definition, 'p_disposition not in (''review-refund'',''bar-credit'')',
    'p_disposition not in (''review-refund'',''bar-credit'',''outstanding-balance'')');
  marker := '  a := jsonb_build_object(''version'',1,''policyApplied'',true';
  if position(marker in definition)=0 then raise exception 'GUEST_REDUCTION_ALLOCATION_MARKER_MISSING'; end if;
  definition := replace(definition, marker, $patch$
  if p_disposition='outstanding-balance' then
    if not early or new_balance<=0 or eligible<=0 then
      raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED';
    end if;
    balance_allocation:=least(eligible,new_balance);
    new_total:=new_total-balance_allocation;
    new_balance:=new_balance-balance_allocation;
  end if;
  a := jsonb_build_object('version',1,'policyApplied',true$patch$);
  definition := replace(definition, 'then 550*p_guest_count else',
    'then least((basis->>''ticketAmount'')::numeric-released,550*p_guest_count+balance_allocation) else');
  definition := replace(definition, '''refundReviewAmount'',eligible-credit+gratuity_refund',
    '''outstandingBalanceAllocationAmount'',balance_allocation,''refundReviewAmount'',eligible-credit-balance_allocation+gratuity_refund');
  definition := replace(definition, 'eligible>credit or gratuity_review>0',
    'eligible>credit+balance_allocation or gratuity_review>0');
  definition := replace(definition, '''refundReviewAmount'',''barTabAmount''',
    '''refundReviewAmount'',''outstandingBalanceAllocationAmount'',''barTabAmount''');
  definition := replace(definition, 'b.subtotal_amount-released_unpaid-unpaid_gratuity',
    'b.subtotal_amount-released_unpaid-unpaid_gratuity-balance_allocation');
  execute definition;
end $migration$;
