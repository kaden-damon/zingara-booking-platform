-- Existing active staff only. No role changes, new accounts or public authority.
create or replace function public.has_booking_operational_authority(p_staff_id uuid,p_auth_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.staff_profiles s
    join public.role_permissions rp on rp.role_id=s.role_id
    join public.permissions p on p.id=rp.permission_id
    where s.id=p_staff_id and s.user_id=p_auth_id and s.active and p.key='bookings:reconcile'
      and s.id=any(array[
        '3ac09b59-fc3f-4c6d-9bb3-8dd47a077188','fe8dff17-a040-4296-afa1-49c058d070f4',
        'd185b639-054d-4c4f-8f6b-3c1e6fc205af','1ede862e-6e46-48d5-a66f-03094bea28dd',
        'bb58fd74-5995-4544-803a-6baaf0ec129b','92edf75d-06bf-4d40-a142-52b2862a3795',
        'e2314f89-672a-47c9-bd84-ec8f21eb40f5','dfa04423-eaa2-4ff0-8e57-5d8631e276ae'
      ]::uuid[]));
$$;
revoke all on function public.has_booking_operational_authority(uuid,uuid) from public,anon,authenticated;
grant execute on function public.has_booking_operational_authority(uuid,uuid) to service_role;

-- Extend the existing financial correction, keeping its identity, money and lifecycle guards.
do $$ declare definition text; needle text; begin
  definition:=pg_get_functiondef('public.reconcile_booking_financials_atomic(text,timestamptz,numeric,numeric,text,uuid,uuid,text,text)'::regprocedure);
  needle:='and round(v_booking.amount_paid, 2) = round(p_amount_paid, 2) then';
  if position(needle in definition)=0 then raise exception 'OPERATIONAL_FINANCIAL_FUNCTION_DRIFT'; end if;
  execute replace(definition,needle,'and round(v_booking.amount_paid, 2) = round(p_amount_paid, 2)
     and current_setting(''zingara.operational_component_edit'',true) is distinct from v_booking.id::text then');
end $$;

create or replace function public.reconcile_booking_financials_and_links_atomic(
  p_booking_reference text,p_expected_updated_at timestamptz,p_total_amount numeric,p_amount_paid numeric,
  p_reason text,p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid,p_request_id text,p_user_agent text,
  p_operational_components jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  b public.bookings%rowtype; c public.corporate_buyouts%rowtype; m jsonb; old_m jsonb; a jsonb; result jsonb;
  key text; n numeric; component_sum numeric:=0; reserved numeric; now_at timestamptz;
  buyout_net numeric; buyout_base numeric; buyout_vat numeric;
begin
  if not public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then
    raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 500 or nullif(btrim(p_request_id),'') is null then
    raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;
  select * into b from public.bookings where booking_reference=upper(trim(p_booking_reference)) for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if exists(select 1 from public.booking_edit_locks where booking_reference=b.booking_reference
    and released_at is null and last_activity_at>clock_timestamp()-interval '5 minutes'
    and staff_profile_id<>p_actor_staff_profile_id) then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if p_amount_paid is distinct from b.amount_paid then raise exception 'AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE'; end if;
  if exists(select 1 from public.payment_refunds where booking_id=b.id
    and refund_status::text in ('processing','reconciliation_required')) then
    raise exception 'FINANCIAL_RECONCILIATION_INVALID'; end if;
  select * into c from public.corporate_buyouts where booking_id=b.id for update;
  if c.id is not null and c.state not in ('provisional','awaiting_payment','fully_paid','confirmed') then
    raise exception 'BUYOUT_COMPONENT_RECONCILIATION_NOT_ALLOWED'; end if;
  if jsonb_typeof(p_operational_components) is distinct from 'object' then raise exception 'FINANCIAL_RECONCILIATION_INVALID'; end if;
  foreach key in array array['ticketAmount','gratuityAmount','barTabAmount','otherAmount','forfeitedAmount',
    'gratuityForfeitedAmount','refundReviewAmount','gratuityReviewAmount','discountAmount'] loop
    if jsonb_typeof(p_operational_components->key) is distinct from 'number' then raise exception 'FINANCIAL_RECONCILIATION_INVALID'; end if;
    n:=(p_operational_components->>key)::numeric;
    if n<0 or n<>round(n,2) or n>90071992547409.91 then raise exception 'FINANCIAL_RECONCILIATION_INVALID'; end if;
    component_sum:=component_sum+case when key='discountAmount' then -n else n end;
  end loop;
  if component_sum<>p_total_amount or (p_operational_components->>'ticketAmount')::numeric < (p_operational_components->>'discountAmount')::numeric
    or (p_operational_components->>'otherAmount')::numeric<coalesce(b.addons_total,0) then
    raise exception 'FINANCIAL_RECONCILIATION_INVALID'; end if;
  reserved:=(p_operational_components->>'barTabAmount')::numeric+(p_operational_components->>'refundReviewAmount')::numeric+
    (p_operational_components->>'gratuityReviewAmount')::numeric;
  if reserved>b.amount_paid then raise exception 'RETAINED_VALUE_ALLOCATION_MISMATCH'; end if;
  m:=case when b.notes like '__zingara_booking_meta__:%' then substring(b.notes from length('__zingara_booking_meta__:')+1)::jsonb else '{}'::jsonb end;
  old_m:=m;
  if c.id is not null then
    -- Reuse the saved package's VAT/base proportions, as the existing custom
    -- agreed-total workflow does. Never derive tax from an invented package.
    buyout_net:=(p_operational_components->>'ticketAmount')::numeric-(p_operational_components->>'discountAmount')::numeric-coalesce(c.commercial_additional_guest_amount,0);
    if c.commercial_base_amount+c.commercial_vat_amount<=0 or buyout_net<=0 then
      raise exception 'BUYOUT_COMPONENTS_INVALID'; end if;
    buyout_base:=round(buyout_net*c.commercial_base_amount/(c.commercial_base_amount+c.commercial_vat_amount),2);
    buyout_vat:=buyout_net-buyout_base;
  end if;
  perform set_config('zingara.operational_component_edit',b.id::text,true);
  result:=public.reconcile_booking_financials_and_links_atomic(p_booking_reference,p_expected_updated_at,
    p_total_amount,p_amount_paid,p_reason,p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent);
  now_at:=clock_timestamp();
  if m ? 'valueAllocation' then
    m:=jsonb_set(m,'{valueAllocationHistory}',coalesce(m->'valueAllocationHistory','[]'::jsonb)||jsonb_build_array(m->'valueAllocation'));
  end if;
  a:=coalesce(m->'valueAllocation','{}')||p_operational_components||jsonb_build_object(
    'version',1,'policyApplied',true,'guestCount',b.guest_count,
    'ticketAmount',(p_operational_components->>'ticketAmount')::numeric-(p_operational_components->>'discountAmount')::numeric,
    'ticketGratuityAmount',(p_operational_components->>'gratuityAmount')::numeric,
    'ticketPaidAmount',greatest(0,(p_operational_components->>'ticketAmount')::numeric-(p_operational_components->>'discountAmount')::numeric-(p_total_amount-b.amount_paid)),
    'ticketGratuityPaidAmount',greatest(0,(p_operational_components->>'gratuityAmount')::numeric-greatest(0,p_total_amount-b.amount_paid-(p_operational_components->>'ticketAmount')::numeric+(p_operational_components->>'discountAmount')::numeric)),
    'gratuityTransferred',0,'recordedAt',now_at,'recordedByStaffId',p_actor_staff_profile_id,
    'totalRetainedValue',p_total_amount,'newOutstanding',p_total_amount-b.amount_paid,
    'manualResolutionRequired',(p_operational_components->>'refundReviewAmount')::numeric>0 or (p_operational_components->>'gratuityReviewAmount')::numeric>0,
    'operationalException',jsonb_build_object('reason',trim(p_reason),'staffProfileId',p_actor_staff_profile_id,'recordedAt',now_at));
  -- A simple commercial price correction is not a cancellation or accounting allocation.
  if (p_operational_components->>'barTabAmount')::numeric=0 and
    (p_operational_components->>'forfeitedAmount')::numeric=0 and
    (p_operational_components->>'gratuityForfeitedAmount')::numeric=0 and reserved=0 then
    m:=m-'valueAllocation';
  else m:=jsonb_set(m,'{valueAllocation}',a); end if;
  m:=m||jsonb_build_object('subtotalPrice',p_total_amount+(p_operational_components->>'discountAmount')::numeric-(p_operational_components->>'gratuityAmount')::numeric,
    'serviceFeeAmount',(p_operational_components->>'gratuityAmount')::numeric,'discountAmount',(p_operational_components->>'discountAmount')::numeric,
    'totalPrice',p_total_amount,'amountPaid',b.amount_paid,'balanceDue',p_total_amount-b.amount_paid,
    'paymentStatus',case when b.amount_paid=0 then 'pending-payment' when b.amount_paid=p_total_amount then 'fully-paid' else 'deposit-paid' end,
    'pricePerPerson',round(((p_operational_components->>'ticketAmount')::numeric-(p_operational_components->>'discountAmount')::numeric)/b.guest_count,2),
    'operationalFinancialAgreement',p_operational_components||jsonb_build_object('reason',p_reason,'recordedAt',now_at,'staffProfileId',p_actor_staff_profile_id));
  if c.id is not null then
    m:=jsonb_set(m,'{operationalFinancialAgreement,buyoutComposition}',jsonb_build_object(
      'baseAmount',buyout_base,'vatAmount',buyout_vat,'additionalGuestAmount',c.commercial_additional_guest_amount));
    update public.corporate_buyouts set commercial_base_amount=buyout_base,commercial_vat_amount=buyout_vat,
      commercial_gratuity_amount=(p_operational_components->>'gratuityAmount')::numeric,
      commercial_total_amount=buyout_net+coalesce(c.commercial_additional_guest_amount,0)+(p_operational_components->>'gratuityAmount')::numeric,
      updated_at=now_at,revision=revision+1,updated_by_staff_profile_id=p_actor_staff_profile_id where id=c.id;
  end if;
  update public.bookings set service_fee=(p_operational_components->>'gratuityAmount')::numeric,
    subtotal_amount=p_total_amount+(p_operational_components->>'discountAmount')::numeric-(p_operational_components->>'gratuityAmount')::numeric,
    discount_amount=(p_operational_components->>'discountAmount')::numeric,
    notes='__zingara_booking_meta__:'||m::text,updated_at=now_at where id=b.id;
  insert into public.audit_events(action,actor_auth_user_id,actor_staff_profile_id,actor_name,actor_role,actor_location_scope,
    entity_id,entity_reference,entity_type,outcome,reason,request_id,source_area,user_agent,before_values,after_values,changed_fields)
  select 'booking.commercial-exception',s.user_id,s.id,s.full_name,r.name,s.venue_scope,b.id::text,b.booking_reference,'booking','success',
    trim(p_reason),p_request_id,'Bookings',p_user_agent,
    jsonb_build_object('total_amount',b.total_amount,'amount_paid',b.amount_paid,'balance_outstanding',b.balance_outstanding,
      'service_fee',b.service_fee,'discount_amount',b.discount_amount,'valueAllocation',old_m->'valueAllocation',
      'buyout_commercial_base',c.commercial_base_amount,'buyout_commercial_vat',c.commercial_vat_amount,'buyout_commercial_gratuity',c.commercial_gratuity_amount),
    jsonb_build_object('total_amount',p_total_amount,'amount_paid',b.amount_paid,'balance_outstanding',p_total_amount-b.amount_paid,
      'components',p_operational_components,'valueAllocation',m->'valueAllocation',
      'buyout_composition',m#>'{operationalFinancialAgreement,buyoutComposition}'),array['notes','subtotal_amount','service_fee','discount_amount','total_amount']
    from public.staff_profiles s join public.roles r on r.id=s.role_id where s.id=p_actor_staff_profile_id;
  perform set_config('zingara.operational_component_edit','',true);
  return result||jsonb_build_object('updated_at',now_at,'components_reconciled',true);
end $$;
revoke all on function public.reconcile_booking_financials_and_links_atomic(text,timestamptz,numeric,numeric,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_booking_financials_and_links_atomic(text,timestamptz,numeric,numeric,text,uuid,uuid,text,text,jsonb) to service_role;

-- The existing reduction basis remains authoritative; authorised staff can reuse
-- a reconciled allocation, without erasing previous forfeiture/refund evidence.
do $$ declare d text; old text; new text; begin
  d:=pg_get_functiondef('public.booking_guest_reduction_basis(uuid)'::regprocedure);
  old:='deposit_only boolean := false;';
  if position(old in d)=0 then raise exception 'OPERATIONAL_BASIS_DRIFT'; end if;
  d:=replace(d,old,old||$add$
  op boolean := coalesce(current_setting('zingara.operational_basis',true),'')='allowed';
  a jsonb;
  retained jsonb := '{}';$add$);
  old:='if ticket <= 0 or least(gratuity,bar,other) < 0';
  if position(old in d)=0 then raise exception 'OPERATIONAL_BASIS_DRIFT'; end if;
  d:=replace(d,old,$add$
  if op and m ? 'operationalFinancialAgreement' and not(m ? 'valueAllocation') then
    a:=m->'operationalFinancialAgreement';
    ticket:=(a->>'ticketAmount')::numeric-(a->>'discountAmount')::numeric;
    gratuity:=(a->>'gratuityAmount')::numeric; bar:=(a->>'barTabAmount')::numeric; other:=(a->>'otherAmount')::numeric;
    if blocked='The Corporate quote must establish separate ticket and gratuity components before allocation.' then blocked:=null; end if;
  end if;
  if op and m ? 'valueAllocation' and m#>>'{valueAllocation,version}'='1' then
    a:=m->'valueAllocation';
    if blocked='An existing value allocation requires authorised Accounts review before another reduction.' then
      ticket:=(a->>'ticketAmount')::numeric; gratuity:=(a->>'ticketGratuityAmount')::numeric;
      bar:=(a->>'barTabAmount')::numeric; other:=(a->>'otherAmount')::numeric;
      retained:=jsonb_build_object('forfeitedAmount',coalesce((a->>'forfeitedAmount')::numeric,0),
        'gratuityForfeitedAmount',coalesce((a->>'gratuityForfeitedAmount')::numeric,0),
        'refundReviewAmount',coalesce((a->>'refundReviewAmount')::numeric,0),
        'gratuityReviewAmount',coalesce((a->>'gratuityReviewAmount')::numeric,0));
      if ticket+gratuity+bar+other+(retained->>'forfeitedAmount')::numeric+
        (retained->>'gratuityForfeitedAmount')::numeric+(retained->>'refundReviewAmount')::numeric+
        (retained->>'gratuityReviewAmount')::numeric=b.total_amount then blocked:=null; end if;
    end if;
  end if;
  if op and blocked='Priced add-ons require Accounts review so their tax and gratuity are not reallocated as cancelled tickets.' then
    blocked:=null; -- quantities and existing charges remain in `other`, not cancelled tickets.
  end if;
  if ticket <= 0 or least(gratuity,bar,other) < 0$add$);
  d:=replace(d,'round(ticket+gratuity+bar+other,2) <> b.total_amount',
    'round(ticket+gratuity+bar+other+coalesce((retained->>''forfeitedAmount'')::numeric,0)+coalesce((retained->>''gratuityForfeitedAmount'')::numeric,0)+coalesce((retained->>''refundReviewAmount'')::numeric,0)+coalesce((retained->>''gratuityReviewAmount'')::numeric,0),2) <> b.total_amount');
  d:=replace(d,'''totalAmount'',b.total_amount,''amountPaid'',b.amount_paid',
    '''operationalAuthority'',op,''retainedAmounts'',retained,''totalAmount'',b.total_amount,''amountPaid'',b.amount_paid');
  execute d;
end $$;
create or replace function public.booking_guest_reduction_basis(p_booking_id uuid,p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  perform set_config('zingara.operational_basis','allowed',true);
  result:=public.booking_guest_reduction_basis(p_booking_id);
  perform set_config('zingara.operational_basis','',true);
  return result;
end $$;
revoke all on function public.booking_guest_reduction_basis(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.booking_guest_reduction_basis(uuid,uuid,uuid) to service_role;

-- Consume the saved staff agreement on later increases; do not return to stale
-- catalogue/deposit prices or lose retained allocations. Receipts stay unchanged.
do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.reconcile_booking_guest_count_financials_atomic(text,timestamptz,integer,text,uuid,uuid,text,text,numeric)'::regprocedure);
  old:='    if v_payment_basis not in (''deposit'', ''full'')';
  if position(old in d)=0 then raise exception 'OPERATIONAL_INCREASE_DRIFT'; end if;
  d:=replace(d,old,$add$    if v_metadata ? 'operationalFinancialAgreement' then
      v_payment_basis:='full'; v_pricing_source:='staff-agreed';
      v_unit_amount:=round(coalesce((v_metadata#>>'{valueAllocation,ticketAmount}')::numeric,
        (v_metadata#>>'{operationalFinancialAgreement,ticketAmount}')::numeric-(v_metadata#>>'{operationalFinancialAgreement,discountAmount}')::numeric)/v_booking.guest_count,2);
    end if;
    if v_payment_basis not in ('deposit', 'full')$add$);
  old:='if v_booking.booking_origin::text in (''admin_staff'', ''customer_public'')
       and v_booking.booking_source in (''admin'', ''online'')
       and v_pricing_source in (''standard-zone'', ''friends-family'', ''show-specific'') then';
  if position(old in d)=0 then raise exception 'OPERATIONAL_INCREASE_DRIFT'; end if;
  d:=replace(d,old,$add$if (v_booking.booking_origin::text in ('admin_staff','customer_public')
      and v_booking.booking_source in ('admin','online') and v_pricing_source in ('standard-zone','friends-family','show-specific'))
      or v_pricing_source='staff-agreed' then$add$);
  d:=replace(d,'v_ticket_unit_amount := coalesce(', 'v_ticket_unit_amount := case when v_pricing_source=''staff-agreed'' then v_unit_amount else coalesce(');
  d:=replace(d,$text$nullif(v_metadata ->> 'pricePerPerson', '')::numeric);$text$, $text$nullif(v_metadata ->> 'pricePerPerson', '')::numeric) end;$text$);
  d:=replace(d,$text$if v_booking.service_fee > 0 and coalesce(v_metadata ->> 'gratuityPolicy','') <> 'pay-at-venue' then$text$,
    $text$if v_booking.service_fee > 0 and (v_pricing_source='staff-agreed' or coalesce(v_metadata ->> 'gratuityPolicy','') <> 'pay-at-venue') then$text$);
  d:=replace(d,'* 0.125,2);', $add$* case when v_pricing_source='staff-agreed' then
    v_booking.service_fee/nullif(coalesce((v_metadata#>>'{valueAllocation,ticketAmount}')::numeric,
      (v_metadata#>>'{operationalFinancialAgreement,ticketAmount}')::numeric-(v_metadata#>>'{operationalFinancialAgreement,discountAmount}')::numeric),0)
    else 0.125 end,2);$add$);
  old:='    v_new_notes := ''__zingara_booking_meta__:'' || v_metadata::text;';
  if position(old in d)=0 then raise exception 'OPERATIONAL_INCREASE_DRIFT'; end if;
  d:=replace(d,old,$add$    if v_added_guests>0 and (v_metadata ? 'operationalFinancialAgreement' or v_metadata#>>'{valueAllocation,policyApplied}'='true') then
      perform set_config('zingara.operational_component_edit',v_booking.id::text,true);
      if v_metadata ? 'valueAllocation' then
        v_metadata:=jsonb_set(v_metadata,'{valueAllocationHistory}',coalesce(v_metadata->'valueAllocationHistory','[]'::jsonb)||jsonb_build_array(v_metadata->'valueAllocation'));
        v_metadata:=jsonb_set(v_metadata,'{valueAllocation}',(v_metadata->'valueAllocation')||jsonb_build_object(
          'guestCount',p_guest_count,'ticketAmount',(v_metadata#>>'{valueAllocation,ticketAmount}')::numeric+v_additional_amount-v_additional_gratuity,
          'ticketGratuityAmount',(v_metadata#>>'{valueAllocation,ticketGratuityAmount}')::numeric+v_additional_gratuity,
          'totalRetainedValue',v_new_total,'newOutstanding',v_new_balance));
      else
        v_metadata:=jsonb_set(v_metadata,'{operationalFinancialAgreement}',(v_metadata->'operationalFinancialAgreement')||jsonb_build_object(
          'ticketAmount',(v_metadata#>>'{operationalFinancialAgreement,ticketAmount}')::numeric+v_additional_amount-v_additional_gratuity,
          'gratuityAmount',(v_metadata#>>'{operationalFinancialAgreement,gratuityAmount}')::numeric+v_additional_gratuity));
      end if;
    end if;
    v_new_notes := '__zingara_booking_meta__:' || v_metadata::text;$add$);
  d:=replace(d,'  insert into public.audit_events (', '  perform set_config(''zingara.operational_component_edit'','''',true);
  insert into public.audit_events (');
  execute d;
end $$;

do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text)'::regprocedure);
  old:='  key text;';
  if position(old in d)=0 then raise exception 'OPERATIONAL_REDUCTION_DRIFT'; end if;
  d:=replace(d,old,old||$add$
  op boolean := public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id);
  waive boolean := false;
  transfer_gratuity numeric := 0;
  retained jsonb;
  ticket_credit numeric;$add$);
  d:=replace(d,'basis := public.booking_guest_reduction_basis(b.id);',
    $add$basis := case when op then public.booking_guest_reduction_basis(b.id,p_actor_staff_profile_id,p_actor_auth_user_id)
      else public.booking_guest_reduction_basis(b.id) end;
  if p_expected_preview ? 'operationalException' then
    if not op or jsonb_typeof(p_expected_preview#>'{operationalException,waivePenalty}') is distinct from 'boolean'
      or jsonb_typeof(p_expected_preview#>'{operationalException,transferGratuity}') is distinct from 'boolean' then
      raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
    waive:=(p_expected_preview#>>'{operationalException,waivePenalty}')::boolean;
  end if;
  retained:=coalesce(basis->'retainedAmounts','{}');$add$);
  d:=replace(d,'forfeited := case when early then 0', 'forfeited := case when early or waive then 0');
  d:=replace(d,'if corporate and not early then gratuity_forfeited:=cancelled_gratuity;',
    'if corporate and not early and not waive then gratuity_forfeited:=cancelled_gratuity;');
  old:='  credit := case when p_disposition=''bar-credit'' then eligible else 0 end;';
  if position(old in d)=0 then raise exception 'OPERATIONAL_REDUCTION_DRIFT'; end if;
  d:=replace(d,old,$add$  ticket_credit:=case when p_disposition='bar-credit' then eligible else 0 end;
  if op and p_disposition='bar-credit' and (early or waive) and
    coalesce((p_expected_preview#>>'{operationalException,transferGratuity}')::boolean,false) then
    transfer_gratuity:=cancelled_gratuity;
    if not corporate then gratuity_review:=gratuity_review-transfer_gratuity; end if;
  end if;
  credit:=ticket_credit+transfer_gratuity;$add$);
  d:=replace(d,'if p_disposition=''bar-credit'' and eligible<=0 then', 'if p_disposition=''bar-credit'' and credit<=0 then');
  d:=replace(d,'if not early or new_balance<=0 or eligible<=0 then', 'if (not early and not waive) or new_balance<=0 or eligible<=0 then');
  d:=replace(d,'''gratuityTransferred'',0,', '''gratuityTransferred'',transfer_gratuity,');
  d:=replace(d,'''gratuityRefundEligibleAmount'',gratuity_refund,', '''gratuityRefundEligibleAmount'',greatest(0,gratuity_refund-transfer_gratuity),');
  d:=replace(d,'''refundReviewAmount'',eligible-credit-balance_allocation+gratuity_refund,',
    '''refundReviewAmount'',eligible-ticket_credit-balance_allocation+gratuity_refund-case when corporate then transfer_gratuity else 0 end,');
  d:=replace(d,'eligible>credit+balance_allocation or gratuity_review>0 or gratuity_refund>0',
    'eligible>ticket_credit+balance_allocation or gratuity_review>0 or gratuity_refund>transfer_gratuity');
  old:='  if b.amount_paid=0 and (';
  if position(old in d)=0 then raise exception 'OPERATIONAL_REDUCTION_DRIFT'; end if;
  d:=replace(d,old,$add$
  if op then
    foreach key in array array['forfeitedAmount','gratuityForfeitedAmount','refundReviewAmount','gratuityReviewAmount'] loop
      a:=jsonb_set(a,array[key],to_jsonb((a->>key)::numeric+coalesce((retained->>key)::numeric,0)));
    end loop;
    if coalesce((retained->>'refundReviewAmount')::numeric,0)>0 or coalesce((retained->>'gratuityReviewAmount')::numeric,0)>0 then
      a:=jsonb_set(a,'{manualResolutionRequired}','true'); end if;
    if p_expected_preview ? 'operationalException' then a:=a||jsonb_build_object('operationalException',p_expected_preview->'operationalException'); end if;
  end if;
  if b.amount_paid=0 and ($add$);
  -- The complete allocation still has to reconcile, including retained prior entries.
  d:=replace(d,$text$(a->>'ticketAmount')::numeric+remaining_gratuity+gratuity_review+gratuity_forfeited+forfeited+$text$,
    $text$(a->>'ticketAmount')::numeric+remaining_gratuity+(a->>'gratuityReviewAmount')::numeric+(a->>'gratuityForfeitedAmount')::numeric+(a->>'forfeitedAmount')::numeric+$text$);
  d:=replace(d,$text$'otherAmount','totalRetainedValue','releasedUnpaidAmount','newOutstanding']$text$, $text$'otherAmount','totalRetainedValue','releasedUnpaidAmount','newOutstanding','gratuityTransferred']$text$);
  execute d;
end $$;

-- Subject only: preserve editable body, branding and all previously sent messages.
update public.communication_templates
  set subject=regexp_replace(subject,'[[:space:]]*\|[[:space:]]*Zingara[[:space:]]*$','','i'),updated_at=clock_timestamp()
  where name='Staff Issue Resolution' and channel='email' and subject ~* '\|[[:space:]]*Zingara[[:space:]]*$';

-- Store a bounded occupancy agreement through the existing manual assignment.
-- Public minimums, table maxima and permanent capacities are not modified.
create or replace function public.protect_booking_operational_evidence()
returns trigger language plpgsql security definer set search_path=public as $$
declare before_m jsonb:='{}'; after_m jsonb:='{}'; key text;
begin
  begin
    if tg_op='UPDATE' and old.notes like '__zingara_booking_meta__:%' then before_m:=substring(old.notes from length('__zingara_booking_meta__:')+1)::jsonb; end if;
  exception when invalid_text_representation then before_m:='{}'; end;
  begin
    if new.notes like '__zingara_booking_meta__:%' then after_m:=substring(new.notes from length('__zingara_booking_meta__:')+1)::jsonb; end if;
  exception when invalid_text_representation then after_m:='{}'; end;
  foreach key in array array['manualSeatingAgreement','operationalFinancialAgreement','valueAllocationHistory'] loop
    if before_m->key is distinct from after_m->key and
      current_setting('zingara.operational_component_edit',true) is distinct from new.id::text and
      current_setting('zingara.manual_seating_edit',true) is distinct from new.id::text then
      raise exception 'OPERATIONAL_EVIDENCE_CANNOT_BE_CHANGED'; end if;
  end loop;
  return new;
end $$;
revoke all on function public.protect_booking_operational_evidence() from public,anon,authenticated;
create trigger protect_booking_operational_evidence before insert or update of notes on public.bookings
  for each row execute function public.protect_booking_operational_evidence();

do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.resolve_booking_table_assignment_compatibility(uuid,integer)'::regprocedure);
  old:='if v_entitlement < v_set.minimum_occupancy';
  if position(old in d)=0 then raise exception 'OPERATIONAL_SEATING_COMPATIBILITY_DRIFT'; end if;
  d:=replace(d,old,$add$if (v_entitlement < v_set.minimum_occupancy and not (
    coalesce(current_setting('zingara.manual_seating_edit',true)=v_booking.id::text,false) or
    case when v_booking.notes like '__zingara_booking_meta__:%' then
      coalesce((substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb#>>array['manualSeatingAgreement','zones',v_set.zone_id,'guestCount'])::integer,
        (substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb#>>'{manualSeatingAgreement,guestCount}')::integer,2147483647)<=v_entitlement
      and (select array_agg(approved.value order by approved.value) from jsonb_array_elements_text(coalesce(
        substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb#>array['manualSeatingAgreement','zones',v_set.zone_id,'tableIds'],
        substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb#>'{manualSeatingAgreement,tableIds}')) approved)
        = (select array_agg(id::text order by id::text) from public.show_tables where booking_id=v_booking.id and merged_parent_id is null
          and public.normalize_booking_capacity_zone(section)=v_set.zone_id)
    else false end
  ))$add$);
  execute d;
end $$;

-- The existing explicit multi-zone assignment retains each zone's entitlement.
-- Record the precise manual choice so the deferred integrity guard can validate
-- it after the transaction-local authorisation has ended.
do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.assign_corporate_booking_zone_tables_atomic(text,text,timestamptz,uuid[],jsonb,uuid,uuid)'::regprocedure);
  old:='  update public.show_tables set booking_id=null,status=''available'',updated_at=clock_timestamp()';
  if position(old in d)=0 then raise exception 'OPERATIONAL_MULTI_ZONE_ASSIGNMENT_DRIFT'; end if;
  d:=replace(d,old,$add$
  if public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then
    perform set_config('zingara.manual_seating_edit',v_booking.id::text,true);
    update public.bookings set notes='__zingara_booking_meta__:'||jsonb_set(
      case when notes like '__zingara_booking_meta__:%' then substring(notes from length('__zingara_booking_meta__:')+1)::jsonb else '{}'::jsonb end,
      '{manualSeatingAgreement}',jsonb_build_object('zones',coalesce(
        case when notes like '__zingara_booking_meta__:%' then substring(notes from length('__zingara_booking_meta__:')+1)::jsonb#>'{manualSeatingAgreement,zones}' end,'{}'::jsonb)
        ||jsonb_build_object(v_target_zone,jsonb_build_object('guestCount',v_entitlement_pax,'tableIds',to_jsonb(p_table_ids))),
        'staffProfileId',p_actor_staff_profile_id,'recordedAt',clock_timestamp()))::text where id=v_booking.id;
  end if;
  update public.show_tables set booking_id=null,status='available',updated_at=clock_timestamp()$add$);
  d:=replace(d,'  return jsonb_build_object(',$add$  perform set_config('zingara.manual_seating_edit','',true);
  return jsonb_build_object($add$);
  execute d;
end $$;

do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.assign_full_show_buyout_zone_tables_atomic(text,timestamptz,text,uuid[],uuid,uuid)'::regprocedure);
  old:='  update public.show_tables
     set booking_id = null,';
  if position(old in d)=0 then raise exception 'OPERATIONAL_BUYOUT_ASSIGNMENT_DRIFT'; end if;
  d:=replace(d,old,$add$
  if public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then
    perform set_config('zingara.manual_seating_edit',v_booking.id::text,true);
    update public.bookings set notes='__zingara_booking_meta__:'||jsonb_set(
      case when notes like '__zingara_booking_meta__:%' then substring(notes from length('__zingara_booking_meta__:')+1)::jsonb else '{}'::jsonb end,
      '{manualSeatingAgreement}',jsonb_build_object('zones',coalesce(
        case when notes like '__zingara_booking_meta__:%' then substring(notes from length('__zingara_booking_meta__:')+1)::jsonb#>'{manualSeatingAgreement,zones}' end,'{}'::jsonb)
        ||jsonb_build_object(v_zone,jsonb_build_object('guestCount',v_target_pax,'tableIds',to_jsonb(v_requested_ids))),
        'staffProfileId',p_actor_staff_profile_id,'recordedAt',clock_timestamp()))::text where id=v_booking.id;
  end if;
  update public.show_tables
     set booking_id = null,$add$);
  d:=replace(d,'  return jsonb_build_object(',$add$  perform set_config('zingara.manual_seating_edit','',true);
  return jsonb_build_object($add$);
  execute d;
end $$;

-- Reuse the original per-zone editor for explicit count changes. Keep the
-- agreed money unchanged until staff edit its existing financial breakdown.
do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.update_corporate_booking_zone_entitlements_atomic(text,jsonb,timestamptz,uuid,uuid,boolean)'::regprocedure);
  old:='  v_total := v_booking.guest_count;';
  if position(old in d)=0 then raise exception 'OPERATIONAL_ZONE_COUNT_DRIFT'; end if;
  d:=replace(d,old,$add$  v_total := v_booking.guest_count;
  if public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) and jsonb_typeof(p_zone_entitlements)='array' then
    select sum((item->>'pax')::integer)::integer into v_total from jsonb_array_elements(p_zone_entitlements) item;
  end if;
  if exists(select 1 from public.booking_edit_locks where booking_reference=v_booking.booking_reference
    and released_at is null and last_activity_at>clock_timestamp()-interval '5 minutes'
    and staff_profile_id<>p_actor_staff_profile_id) then raise exception 'BOOKING_LOCKED'; end if;$add$);
  d:=replace(d,'v_normalized, v_booking.section, v_booking.guest_count, v_zone','v_normalized, v_booking.section, v_total, v_zone');
  d:=replace(d,'  if v_booking.zone_entitlements is not distinct from v_normalized',
    '  if v_total=v_booking.guest_count and v_booking.zone_entitlements is not distinct from v_normalized');
  d:=replace(d,'  v_total integer;','  v_total integer; v_metadata jsonb;');
  old:='  update public.bookings
     set section = v_primary_section,';
  if position(old in d)=0 then raise exception 'OPERATIONAL_ZONE_COUNT_DRIFT'; end if;
  d:=replace(d,old,$add$
  if v_total<>v_booking.guest_count and v_booking.notes like '__zingara_booking_meta__:%' then
    perform set_config('zingara.operational_component_edit',v_booking.id::text,true);
    v_metadata:=substring(v_booking.notes from length('__zingara_booking_meta__:')+1)::jsonb;
    v_metadata:=jsonb_set(v_metadata,'{partySize}',to_jsonb(v_total));
    if v_metadata ? 'valueAllocation' then
      v_metadata:=jsonb_set(v_metadata,'{valueAllocationHistory}',coalesce(v_metadata->'valueAllocationHistory','[]'::jsonb)||jsonb_build_array(v_metadata->'valueAllocation'));
      v_metadata:=jsonb_set(v_metadata,'{valueAllocation}',(v_metadata->'valueAllocation')||jsonb_build_object('guestCount',v_total,'attendanceOnlyAdjustment',true));
    end if;
    if jsonb_typeof(v_metadata->'guestTickets')='array' then
      v_metadata:=jsonb_set(v_metadata,'{guestTickets}',coalesce((select jsonb_agg(jsonb_set(item,'{total}',to_jsonb(v_total)))
        from jsonb_array_elements(v_metadata->'guestTickets') item where coalesce((item->>'index')::integer,1)<=v_total),'[]'::jsonb));
    end if;
  end if;
  update public.bookings
     set section = v_primary_section,$add$);
  old:='         zone_entitlements = v_normalized,';
  if position(old in d)=0 then raise exception 'OPERATIONAL_ZONE_COUNT_DRIFT'; end if;
  d:=replace(d,old,$add$         zone_entitlements = v_normalized,
         guest_count = v_total,
         notes = case when v_metadata is not null then '__zingara_booking_meta__:'||v_metadata::text else notes end,$add$);
  old:='  insert into public.audit_events(';
  if position(old in d)=0 then raise exception 'OPERATIONAL_ZONE_COUNT_DRIFT'; end if;
  d:=replace(d,old,$add$
  if public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) and not public.booking_table_claims_fit_guest_count(v_booking.id,v_total) then
    update public.show_tables set booking_id=null,status='available',updated_at=clock_timestamp() where booking_id=v_booking.id;
    update public.bookings set table_id=null where id=v_booking.id;
  end if;
  update public.corporate_buyouts set current_guest_count=v_total,final_guest_count=v_total,
    allocated_guest_count=v_total,unallocated_guest_count=0,zone_allocations=v_normalized,
    ticket_entitlement_count=least(ticket_entitlement_count,v_total),revision=revision+1,
    updated_at=clock_timestamp(),updated_by_staff_profile_id=p_actor_staff_profile_id where booking_id=v_booking.id
      and public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id);
  insert into public.audit_events($add$);
  d:=replace(d,$text$jsonb_build_object('zone_entitlements',v_normalized,'guest_count',v_booking.guest_count,'show_id',v_booking.show_id)$text$,
    $text$jsonb_build_object('zone_entitlements',v_normalized,'guest_count',v_total,'show_id',v_booking.show_id,
      'total_amount',v_booking.total_amount,'amount_paid',v_booking.amount_paid,'balance_outstanding',v_booking.balance_outstanding,'financial_change',false)$text$);
  d:=replace(d,$text$array['section','zone_entitlements']$text$,$text$array['section','zone_entitlements','guest_count','table_id']$text$);
  d:=replace(d,'  return jsonb_build_object(', '  perform set_config(''zingara.operational_component_edit'','''',true);
  return jsonb_build_object(');
  execute d;
end $$;

create or replace function public.map_booking_operational_table_atomic(
  p_booking_id uuid,p_expected_previous_table_id uuid,p_target_table_id uuid,
  p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.bookings%rowtype; result jsonb; m jsonb;
begin
  if not public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then raise exception 'FLOOR_MANAGEMENT_PERMISSION_REQUIRED'; end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  perform set_config('zingara.manual_seating_edit',b.id::text,true);
  result:=public.map_booking_operational_table_atomic(p_booking_id,p_expected_previous_table_id,p_target_table_id);
  select case when notes like '__zingara_booking_meta__:%' then substring(notes from length('__zingara_booking_meta__:')+1)::jsonb else '{}'::jsonb end
    into m from public.bookings where id=b.id;
  m:=jsonb_set(m,'{manualSeatingAgreement}',jsonb_build_object('guestCount',b.guest_count,'tableIds',jsonb_build_array(p_target_table_id),
    'staffProfileId',p_actor_staff_profile_id,'recordedAt',clock_timestamp()));
  update public.bookings set notes='__zingara_booking_meta__:'||m::text where id=b.id;
  insert into public.audit_events(action,actor_auth_user_id,actor_staff_profile_id,actor_name,actor_role,actor_location_scope,
    entity_id,entity_reference,entity_type,outcome,reason,source_area,before_values,after_values,changed_fields)
  select 'booking.table-assign',s.user_id,s.id,s.full_name,r.name,s.venue_scope,b.id::text,b.booking_reference,'booking','success',
    'Box Office manual seating saved.','Operations Floor',jsonb_build_object('table_id',b.table_id,'section',b.section,'guest_count',b.guest_count),
    result||jsonb_build_object('guest_count',b.guest_count,'total_amount',b.total_amount,'amount_paid',b.amount_paid,'financial_change',false),array['table_id','section']
    from public.staff_profiles s join public.roles r on r.id=s.role_id where s.id=p_actor_staff_profile_id;
  perform set_config('zingara.manual_seating_edit','',true);
  return result;
end $$;
revoke all on function public.map_booking_operational_table_atomic(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.map_booking_operational_table_atomic(uuid,uuid,uuid,uuid,uuid) to service_role;
create or replace function public.assign_unallocated_booking_table_atomic(
  p_booking_id uuid,p_target_table_id uuid,p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid
) returns jsonb language sql security definer set search_path=public as $$
  select public.map_booking_operational_table_atomic(p_booking_id,null,p_target_table_id,p_actor_staff_profile_id,p_actor_auth_user_id);
$$;
revoke all on function public.assign_unallocated_booking_table_atomic(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_unallocated_booking_table_atomic(uuid,uuid,uuid,uuid) to service_role;

do $$ declare d text; old text; begin
  d:=pg_get_functiondef('public.reallocate_booking_zone_tables_atomic(text,timestamptz,uuid[],text,uuid[],uuid,uuid)'::regprocedure);
  old:='  update public.show_tables
     set booking_id = null,';
  if position(old in d)=0 then raise exception 'OPERATIONAL_MANUAL_TABLE_SET_DRIFT'; end if;
  d:=replace(d,old,$add$  if public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then
    perform set_config('zingara.manual_seating_edit',v_booking.id::text,true);
    update public.bookings set notes='__zingara_booking_meta__:'||jsonb_set(
      case when notes like '__zingara_booking_meta__:%' then substring(notes from length('__zingara_booking_meta__:')+1)::jsonb else '{}'::jsonb end,
      '{manualSeatingAgreement}',jsonb_build_object('guestCount',v_booking.guest_count,'tableIds',to_jsonb(p_target_table_ids),
      'staffProfileId',p_actor_staff_profile_id,'recordedAt',clock_timestamp()))::text where id=v_booking.id;
  end if;
  update public.show_tables
     set booking_id = null,$add$);
  d:=replace(d,'  return jsonb_build_object(', '  perform set_config(''zingara.manual_seating_edit'','''',true);
  return jsonb_build_object(');
  execute d;
end $$;
