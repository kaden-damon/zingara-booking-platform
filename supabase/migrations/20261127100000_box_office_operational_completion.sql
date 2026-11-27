-- Extend the existing protected commercial edit, not public financial authority.
do $migration$
declare d text; marker text;
begin
  d:=pg_get_functiondef('public.reconcile_booking_financials_atomic(text,timestamptz,numeric,numeric,text,uuid,uuid,text,text)'::regprocedure);
  marker:='p_total_amount is null or p_total_amount <= 0';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_FINANCIAL_DRIFT';end if;
  d:=replace(d,marker,$patch$p_total_amount is null or p_total_amount < 0
     or (p_total_amount=0 and not public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id))$patch$);
  marker:='or v_booking.payment_status::text in (''cancelled'', ''comp_vip'', ''refunded'')';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_FINANCIAL_DRIFT';end if;
  d:=replace(d,marker,$patch$or v_booking.payment_status::text in ('cancelled','refunded')
     or (v_booking.payment_status::text='comp_vip' and
       (current_setting('zingara.operational_component_edit',true) is distinct from v_booking.id::text
        or not public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id)))$patch$);
  marker:='when round(p_amount_paid, 2) <= 0 then ''pending_payment''::public.payment_status';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_FINANCIAL_DRIFT';end if;
  d:=replace(d,marker,$patch$when p_total_amount=0 and p_amount_paid=0 then 'comp_vip'::public.payment_status
    when round(p_amount_paid, 2) <= 0 then 'pending_payment'::public.payment_status$patch$);
  execute d;
  d:=pg_get_functiondef('public.reconcile_booking_financials_and_links_atomic(text,timestamptz,numeric,numeric,text,uuid,uuid,text,text,jsonb)'::regprocedure);
  marker:='''paymentStatus'',case when b.amount_paid=0 then ''pending-payment''';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_FINANCIAL_DRIFT';end if;
  d:=replace(d,marker,'''paymentStatus'',case when p_total_amount=0 and b.amount_paid=0 then ''comp-vip'' when b.amount_paid=0 then ''pending-payment''');
  d:=replace(d,'if c.commercial_base_amount+c.commercial_vat_amount<=0 or buyout_net<=0 then',
    'if buyout_net<0 or (c.commercial_base_amount+c.commercial_vat_amount<=0 and buyout_net<>0) then');
  d:=replace(d,'buyout_base:=round(buyout_net*c.commercial_base_amount/(c.commercial_base_amount+c.commercial_vat_amount),2);',
    'buyout_base:=case when buyout_net=0 then 0 else round(buyout_net*c.commercial_base_amount/(c.commercial_base_amount+c.commercial_vat_amount),2) end;');
  execute d;
  d:=pg_get_functiondef('public.reconcile_booking_guest_count_financials_atomic(text,timestamptz,integer,text,uuid,uuid,text,text,numeric)'::regprocedure);
  marker:='v_unit_amount numeric;';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_COMPLIMENTARY_INCREASE_DRIFT';end if;
  d:=replace(d,marker,marker||' v_zero_ticket_agreement boolean:=false;');
  marker:='v_unit_amount:=round(coalesce((v_metadata#>>''{valueAllocation,ticketAmount}'')::numeric,
        (v_metadata#>>''{operationalFinancialAgreement,ticketAmount}'')::numeric-(v_metadata#>>''{operationalFinancialAgreement,discountAmount}'')::numeric)/v_booking.guest_count,2);';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_COMPLIMENTARY_INCREASE_DRIFT';end if;
  d:=replace(d,marker,marker||$patch$
      v_zero_ticket_agreement:=public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id)
        and v_unit_amount=0 and v_booking.service_fee=0 and v_booking.amount_paid>=0
        and v_booking.amount_paid<=v_booking.total_amount
        and v_booking.balance_outstanding=v_booking.total_amount-v_booking.amount_paid;
      if v_unit_amount=0 and v_booking.payment_status::text='comp_vip'
         and v_booking.total_amount=0 and v_booking.amount_paid=0 then
        v_pricing_source:='complimentary';
      end if;$patch$);
  marker:='and v_booking.subtotal_amount = 0';
  if position(marker in d)=0 then raise exception 'OPERATIONAL_COMPLIMENTARY_INCREASE_DRIFT';end if;
  d:=replace(d,marker,'and v_booking.subtotal_amount-coalesce(v_booking.discount_amount,0) = 0');
  d:=replace(d,'v_unit_amount <= 0','v_unit_amount <= 0 and not v_zero_ticket_agreement');
  d:=replace(d,'v_ticket_unit_amount <= 0','(v_ticket_unit_amount < 0 or (v_ticket_unit_amount=0 and not v_zero_ticket_agreement))');
  execute d;
end $migration$;

-- A fixed Buyout remains outside guest-cancellation repricing, while its saved
-- contract can still establish reliable components for independent add-on edits.
do $migration$
declare d text; marker text;
begin
 d:=pg_get_functiondef('public.booking_guest_reduction_basis(uuid)'::regprocedure);
 marker:='recovered_other numeric;';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_CONTRACT_BASIS_DRIFT';end if;
 d:=replace(d,marker,marker||$patch$
  contract public.corporate_buyouts%rowtype;
  contract_known boolean:=false;$patch$);
 marker:='  preserve_financials:=op and blocked in (';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_CONTRACT_BASIS_DRIFT';end if;
 d:=replace(d,marker,$patch$
  if op and blocked like 'Buyout:%' then
    if m#>>'{valueAllocation,version}'='1' then
      a:=m->'valueAllocation';
      ticket:=(a->>'ticketAmount')::numeric;gratuity:=(a->>'ticketGratuityAmount')::numeric;
      bar:=(a->>'barTabAmount')::numeric;other:=(a->>'otherAmount')::numeric;
      retained:=jsonb_build_object('forfeitedAmount',coalesce((a->>'forfeitedAmount')::numeric,0),
        'gratuityForfeitedAmount',coalesce((a->>'gratuityForfeitedAmount')::numeric,0),
        'refundReviewAmount',coalesce((a->>'refundReviewAmount')::numeric,0),
        'gratuityReviewAmount',coalesce((a->>'gratuityReviewAmount')::numeric,0));
    end if;
    if m ? 'valueAllocation' or m ? 'operationalFinancialAgreement' then
      contract_known:=least(ticket,gratuity,bar,other)>=0 and ticket+gratuity+bar+other+
        coalesce((retained->>'forfeitedAmount')::numeric,0)+coalesce((retained->>'gratuityForfeitedAmount')::numeric,0)+
        coalesce((retained->>'refundReviewAmount')::numeric,0)+coalesce((retained->>'gratuityReviewAmount')::numeric,0)=b.total_amount;
    end if;
    select * into contract from public.corporate_buyouts where booking_id=b.id;
    if not coalesce(contract_known,false) and not(m ? 'valueAllocation' or m ? 'operationalFinancialAgreement')
      and contract.id is not null and contract.commercial_base_amount>=0 and contract.commercial_vat_amount>=0
      and contract.commercial_gratuity_amount>=0 and coalesce(contract.commercial_additional_guest_amount,0)>=0
      and contract.commercial_base_amount+contract.commercial_vat_amount+contract.commercial_gratuity_amount+
        coalesce(contract.commercial_additional_guest_amount,0)=contract.commercial_total_amount
      and contract.commercial_total_amount+coalesce(b.addons_total,0)=b.total_amount
      then
      ticket:=contract.commercial_base_amount+contract.commercial_vat_amount+coalesce(contract.commercial_additional_guest_amount,0);
      gratuity:=contract.commercial_gratuity_amount;bar:=0;other:=coalesce(b.addons_total,0);contract_known:=true;
    end if;
  end if;
  preserve_financials:=op and blocked in ($patch$);
 marker:='''componentRecoverySource'',recovery_source,''bookingKind''';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_CONTRACT_BASIS_DRIFT';end if;
 d:=replace(d,marker,'''contractComponentsKnown'',contract_known,''componentRecoverySource'',recovery_source,''bookingKind''');
 execute d;
end $migration$;

-- The existing add-on editor uses the same atomic commercial edit and receipt
-- protection. Its validated operational metadata cannot arrive via price drafts.
do $migration$
declare d text; marker text;
begin
 d:=pg_get_functiondef('public.reconcile_booking_financials_and_links_atomic(text,timestamptz,numeric,numeric,text,uuid,uuid,text,text,jsonb)'::regprocedure);
 marker:='buyout_net numeric; buyout_base numeric; buyout_vat numeric;';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_ADDON_DRIFT';end if;
 d:=replace(d,marker,marker||$patch$
  addon_meta jsonb;
  addon_total numeric;
  old_addon_total numeric;
  preserved_basis jsonb;$patch$);
 marker:='  select * into c from public.corporate_buyouts';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_ADDON_DRIFT';end if;
 d:=replace(d,marker,$patch$
  old_addon_total:=b.addons_total;
  addon_meta:=p_operational_components->'_bookingMetadata';
  if addon_meta is not null then
    if jsonb_typeof(addon_meta) is distinct from 'object'
      or jsonb_typeof(addon_meta->'addons') is distinct from 'array'
      or exists(select 1 from jsonb_array_elements(addon_meta->'addons') x
        where jsonb_typeof(x->'price') is distinct from 'number'
        or (x->>'price')::numeric<0 or (x->>'price')::numeric<>round((x->>'price')::numeric,2)) then
      raise exception 'FINANCIAL_RECONCILIATION_INVALID';end if;
    select coalesce(sum((x->>'price')::numeric),0) into addon_total from jsonb_array_elements(addon_meta->'addons') x;
    m:=case when b.notes like '__zingara_booking_meta__:%' then substring(b.notes from length('__zingara_booking_meta__:')+1)::jsonb else '{}'::jsonb end;
    if p_operational_components->>'_preserveFinancials'='true' then
      preserved_basis:=public.booking_guest_reduction_basis(b.id,p_actor_staff_profile_id,p_actor_auth_user_id);
      if (preserved_basis->>'preserveFinancials' is distinct from 'true'
          and not(coalesce(preserved_basis->>'blockedReason','') like 'Buyout:%'
            and preserved_basis->>'contractComponentsKnown'='false'))
         or b.archived_at is not null or b.booking_status::text not in ('new','confirmed','pending_payment')
         or b.amount_paid<0 or b.amount_paid>b.total_amount or b.balance_outstanding<>b.total_amount-b.amount_paid
         or exists(select 1 from public.payment_refunds where booking_id=b.id and refund_status::text in ('accepted','processing','reconciliation_required'))
         or p_total_amount is distinct from b.total_amount then raise exception 'FINANCIAL_RECONCILIATION_INVALID';end if;
      old_m:=m;
      m:=m||addon_meta||jsonb_build_object('addonsTotal',b.addons_total,'financialAmountsPreserved',true);
      update public.bookings set notes='__zingara_booking_meta__:'||m::text,
        dietary_requirements=case when addon_meta ? 'dietaryRequirements' then addon_meta->>'dietaryRequirements' else dietary_requirements end,
        updated_at=clock_timestamp() where id=b.id;
      insert into public.audit_events(action,actor_auth_user_id,actor_staff_profile_id,actor_name,actor_role,actor_location_scope,
        entity_id,entity_reference,entity_type,outcome,reason,request_id,source_area,user_agent,before_values,after_values,changed_fields)
      select 'booking.addons-updated',s.user_id,s.id,s.full_name,r.name,s.venue_scope,b.id::text,b.booking_reference,'booking','success',
        p_reason,p_request_id,'Bookings',p_user_agent,jsonb_build_object('addons',old_m->'addons','total_amount',b.total_amount,'amount_paid',b.amount_paid),
        jsonb_build_object('addons',m->'addons','financials_preserved',true,'total_amount',b.total_amount,'amount_paid',b.amount_paid),array['notes']
        from public.staff_profiles s join public.roles r on r.id=s.role_id where s.id=p_actor_staff_profile_id;
      return jsonb_build_object('booking_id',b.id,'updated_at',(select updated_at from public.bookings where id=b.id),
        'total_amount',b.total_amount,'amount_paid',b.amount_paid,'balance_outstanding',b.balance_outstanding,
        'subtotal_amount',b.subtotal_amount,'service_fee',b.service_fee,'addons_total',b.addons_total,
        'financials_preserved',true,'payment_links_revoked',0);
    end if;
    b.addons_total:=addon_total;
  end if;
  select * into c from public.corporate_buyouts$patch$);
 marker:='  if m ? ''valueAllocation'' then';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_ADDON_DRIFT';end if;
 d:=replace(d,marker,$patch$  if addon_meta is not null then m:=m||addon_meta||jsonb_build_object('addonsTotal',addon_total);end if;
  if m ? 'valueAllocation' then$patch$);
 marker:='  update public.bookings set service_fee=';
 if position(marker in d)=0 then raise exception 'OPERATIONAL_ADDON_DRIFT';end if;
 d:=replace(d,marker,$patch$  update public.bookings set addons_total=coalesce(addon_total,addons_total),
    dietary_requirements=case when addon_meta ? 'dietaryRequirements' then addon_meta->>'dietaryRequirements' else dietary_requirements end,
    service_fee=$patch$);
 d:=replace(d,'''service_fee'',b.service_fee,''discount_amount'',b.discount_amount,''valueAllocation''',
   '''addons'',old_m->''addons'',''addons_total'',old_addon_total,''service_fee'',b.service_fee,''discount_amount'',b.discount_amount,''valueAllocation''');
 d:=replace(d,'''components'',p_operational_components,''valueAllocation''',
   '''addons'',m->''addons'',''addons_total'',coalesce(addon_total,b.addons_total),''components'',p_operational_components,''valueAllocation''');
 d:=replace(d,'''updated_at'',now_at,''components_reconciled'',true',
   '''updated_at'',now_at,''components_reconciled'',true,''subtotal_amount'',p_total_amount+(p_operational_components->>''discountAmount'')::numeric-(p_operational_components->>''gratuityAmount'')::numeric,''service_fee'',(p_operational_components->>''gratuityAmount'')::numeric,''addons_total'',coalesce(addon_total,b.addons_total)');
 execute d;
end $migration$;
