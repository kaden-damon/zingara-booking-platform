-- Restore ordinary outstanding-balance reductions within the existing policy
-- transaction. Receipts, permissions, cutoffs and exceptional-basis guards stay.
do $migration$
declare
  definition text;
  marker text;
begin
  definition := pg_get_functiondef('public.booking_guest_reduction_basis(uuid)'::regprocedure);
  if md5(definition) <> '9cf7f5c641f61aac37511d4607c3d90c' then
    raise exception 'GUEST_REDUCTION_BASIS_DRIFT';
  end if;
  definition := replace(definition,
    '(not deposit_only and (b.amount_paid <> b.total_amount or b.payment_status::text <> ''fully_paid'')) or b.total_amount <= 0',
    'b.amount_paid is null or b.amount_paid < 0 or b.amount_paid > b.total_amount or b.total_amount <= 0
      or b.balance_outstanding is distinct from b.total_amount-b.amount_paid
      or b.payment_status::text not in (''pending_payment'',''deposit_paid'',''fully_paid'')
      or (b.payment_status::text=''fully_paid'' and b.amount_paid<>b.total_amount)');
  definition := replace(definition,
    'Deposit, unpaid or exceptional financial arrangements require authorised Accounts review.',
    'The saved payment amounts do not match. Accounts must check them before removing guests.');
  execute definition;

  definition := pg_get_functiondef('public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text)'::regprocedure);
  if md5(definition) <> '1468184d88e435b54b9de7d1b9cee4e0' then
    raise exception 'GUEST_REDUCTION_TRANSACTION_DRIFT';
  end if;
  definition := replace(definition, '  released_paid numeric;',
    E'  outstanding numeric;\n  unpaid_gratuity numeric;\n  released_paid numeric;');
  marker := '  released_paid:=case when (basis->>''depositOnly'')::boolean then 550*(b.guest_count-p_guest_count) else released end;
  released_unpaid:=released-released_paid;';
  if position(marker in definition)=0 then raise exception 'GUEST_REDUCTION_PAYMENT_MARKER_MISSING'; end if;
  definition := replace(definition, marker, $patch$
  outstanding:=greatest(0,b.total_amount-b.amount_paid);
  released_unpaid:=case when (basis->>'depositOnly')::boolean
    then released-550*(b.guest_count-p_guest_count)
    else least(outstanding,released-forfeited) end;
  released_paid:=released-released_unpaid;
  unpaid_gratuity:=case when (basis->>'depositOnly')::boolean then 0
    else least(cancelled_gratuity,greatest(0,outstanding-released_unpaid)) end;
  cancelled_gratuity:=cancelled_gratuity-unpaid_gratuity;
$patch$);
  definition := replace(definition,'new_total:=b.total_amount-released_unpaid;',
    'new_total:=b.total_amount-released_unpaid-unpaid_gratuity;');
  definition := replace(definition,
    'else (basis->>''ticketAmount'')::numeric-released end,',
    'else greatest(0,(basis->>''ticketAmount'')::numeric-released-new_balance) end,');
  definition := replace(definition, '''ticketGratuityAmount'',remaining_gratuity,',
    '''ticketGratuityPaidAmount'',greatest(0,remaining_gratuity-greatest(0,new_balance-(basis->>''ticketAmount'')::numeric+released)),''ticketGratuityAmount'',remaining_gratuity,');
  definition := replace(definition, '''ticketGratuityAmount'',''gratuityReviewAmount''',
    '''ticketGratuityAmount'',''ticketGratuityPaidAmount'',''gratuityReviewAmount''');
  definition := replace(definition,'b.subtotal_amount-released_unpaid',
    'b.subtotal_amount-released_unpaid-unpaid_gratuity');
  definition := replace(definition, '''balanceDue'',new_balance,''amountPaid'',b.amount_paid',
    '''balanceDue'',new_balance,''amountPaid'',b.amount_paid,''paymentStatus'',case when new_balance=0 then ''fully-paid'' when b.amount_paid>0 then ''deposit-paid'' else ''pending-payment'' end');
  definition := replace(definition, 'balance_outstanding=new_balance where id=b.id;',
    'balance_outstanding=new_balance,payment_status=case
      when new_balance=0 then ''fully_paid''::public.payment_status
      when b.amount_paid>0 then ''deposit_paid''::public.payment_status
      else ''pending_payment''::public.payment_status end
      where id=b.id returning payment_status,updated_at into b.payment_status,b.updated_at;');
  definition := replace(definition, '''disposition'',p_disposition,''policy_allocation'',a',
    '''disposition'',p_disposition,''payment_status'',b.payment_status,''updated_at'',b.updated_at,''policy_allocation'',a');
  -- Payment status and old links must reflect the revised obligation atomically.
  marker := '  result:=result||jsonb_build_object(''disposition'',p_disposition';
  if position(marker in definition)=0 then raise exception 'GUEST_REDUCTION_RESULT_MARKER_MISSING'; end if;
  definition := replace(definition, marker, $patch$
  if new_total is distinct from b.total_amount then
    update public.booking_payment_links set status='revoked',revoked_at=now_at,updated_at=now_at
      where booking_id=b.id and status='active';
  end if;
  result:=result||jsonb_build_object('disposition',p_disposition$patch$);
  execute definition;
end $migration$;
