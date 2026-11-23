-- Prospective only: preserve original receipts, totals and accounting documents.
create or replace function public.booking_guest_reduction_basis(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  s public.shows%rowtype;
  e public.legacy_booking_payment_evidence%rowtype;
  m jsonb := '{}';
  ticket numeric := 0;
  gratuity numeric := 0;
  bar numeric := 0;
  other numeric := 0;
  blocked text;
  deposit_only boolean := false;
begin
  select * into b from public.bookings where id = p_booking_id;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into s from public.shows where id = b.show_id;
  if s.id is null then raise exception 'SHOW_NOT_FOUND'; end if;
  begin
    if b.notes like '__zingara_booking_meta__:%' then
      m := substring(b.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    end if;
  exception when others then blocked := 'Saved financial metadata needs Accounts review.';
  end;
  deposit_only := b.booking_origin::text in ('admin_staff','customer_public')
    and b.booking_source in ('admin','online') and b.payment_status::text='deposit_paid'
    and b.amount_paid=550*b.guest_count and b.service_fee=0 and coalesce(b.addons_total,0)=0
    and b.amount_paid<b.total_amount
    and (m#>>'{pricingProvenance,depositPerPerson}')::numeric=550;
  deposit_only := coalesce(deposit_only,false);
  if exists(select 1 from public.corporate_buyouts where booking_id = b.id)
     or m->>'commercialModel' = 'fixed-buyout-package' or m ? 'buyoutComponentAgreement'
     or b.section = 'Full Show Buyout' then
    blocked := 'Buyout: preserve the fixed package and separately agreed contractual terms.';
  elsif m ? 'valueAllocation' then
    blocked := 'An existing value allocation requires authorised Accounts review before another reduction.';
  elsif (not deposit_only and (b.amount_paid <> b.total_amount or b.payment_status::text <> 'fully_paid')) or b.total_amount <= 0 then
    blocked := 'Deposit, unpaid or exceptional financial arrangements require authorised Accounts review.';
  elsif b.archived_at is not null or b.booking_status::text not in ('new','confirmed','pending_payment') then
    blocked := 'This booking cannot be reduced in its current status.';
  elsif coalesce(jsonb_array_length(b.zone_entitlements),0) > 1 then
    blocked := 'Mixed seating prices require authorised Accounts review.';
  elsif exists(select 1 from public.payment_refunds where booking_id=b.id and refund_status::text in ('accepted','processing','reconciliation_required')) then
    blocked := 'An existing refund requires Accounts review before another allocation.';
  end if;
  if b.booking_origin = 'data_import' then
    select * into e from public.legacy_booking_payment_evidence where booking_id=b.id and source_system='manual_invoice';
    if e.id is null then blocked := coalesce(blocked,'Original invoice component evidence is required.'); end if;
    ticket := coalesce(e.source_ticket_amount,0);
    gratuity := coalesce(e.ticket_gratuity_amount,0);
    bar := coalesce(e.bar_tab_paid_amount,0);
    other := coalesce(e.bar_gratuity_amount,0);
  else
    gratuity := b.service_fee;
    if b.booking_source='corporate-direct' and b.service_fee=0 then
      blocked := coalesce(blocked,'The Corporate quote must establish separate ticket and gratuity components before allocation.');
    end if;
    if coalesce(b.addons_total,0)>0 then
      blocked := coalesce(blocked,'Priced add-ons require Accounts review so their tax and gratuity are not reallocated as cancelled tickets.');
    end if;
    -- Add-ons are not cancelled by a ticket-count change; retain their exact sum.
    other := coalesce(b.addons_total,0) + coalesce((m#>>'{pricingProvenance,bookingFeeAmount}')::numeric,
      case when b.total_amount > 0 then 10 else 0 end);
    ticket := b.total_amount - gratuity - other;
  end if;
  if ticket <= 0 or least(gratuity,bar,other) < 0 or round(ticket+gratuity+bar+other,2) <> b.total_amount then
    blocked := coalesce(blocked,'The existing financial components do not reconcile; Accounts review is required.');
  end if;
  if deposit_only and ticket/b.guest_count<550 then blocked:=coalesce(blocked,'The recorded deposit exceeds the ticket rate; Accounts review is required.'); end if;
  return jsonb_build_object('bookingKind',case when b.booking_origin='corporate' or b.booking_source='corporate-direct' or b.corporate_request_id is not null then 'corporate' else 'standard' end,
    'performanceDate',s.date,'performanceTime',s.time,'guestCount',b.guest_count,
    'ticketAmount',ticket,'gratuityAmount',gratuity,'barTabAmount',bar,'otherAmount',other,
    'totalAmount',b.total_amount,'amountPaid',b.amount_paid,'depositOnly',deposit_only,'blockedReason',blocked);
end $$;

create or replace function public.reconcile_booking_guest_reduction_policy_atomic(
  p_booking_reference text, p_expected_updated_at timestamptz, p_guest_count integer,
  p_disposition text, p_expected_preview jsonb, p_reason text,
  p_actor_staff_profile_id uuid, p_actor_auth_user_id uuid, p_request_id text, p_user_agent text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  b public.bookings%rowtype;
  s public.shows%rowtype;
  basis jsonb;
  a jsonb;
  m jsonb;
  result jsonb;
  actor_name text;
  actor_role text;
  actor_scope text[];
  now_at timestamptz := clock_timestamp();
  cutoff timestamptz;
  early boolean;
  corporate boolean;
  released numeric;
  remaining_gratuity numeric;
  cancelled_gratuity numeric;
  forfeited numeric;
  gratuity_forfeited numeric := 0;
  gratuity_refund numeric := 0;
  gratuity_review numeric := 0;
  eligible numeric;
  credit numeric;
  released_paid numeric;
  released_unpaid numeric;
  new_total numeric;
  new_balance numeric;
  key text;
begin
  select staff.full_name,role.name,staff.venue_scope into actor_name,actor_role,actor_scope
    from public.staff_profiles staff join public.roles role on role.id=staff.role_id
    join public.role_permissions rp on rp.role_id=role.id
    join public.permissions permission on permission.id=rp.permission_id
    where staff.id=p_actor_staff_profile_id and staff.user_id=p_actor_auth_user_id
      and staff.active and permission.key='bookings:reconcile';
  if actor_name is null then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if nullif(trim(p_reason),'') is null or nullif(trim(p_request_id),'') is null then raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;
  select * into b from public.bookings where booking_reference=upper(trim(p_booking_reference)) for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  select * into s from public.shows where id=b.show_id for share;
  if not ('all'=any(coalesce(actor_scope,'{}')) or lower(trim(s.venue))=any(coalesce(actor_scope,'{}'))) then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if exists(select 1 from public.booking_edit_locks where booking_reference=b.booking_reference
    and released_at is null and last_activity_at >= now_at-interval '5 minutes'
    and staff_profile_id<>p_actor_staff_profile_id) then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  select after_values into result from public.audit_events where action='booking.policy-guest-reduction'
    and entity_reference=b.booking_reference and request_id=p_request_id and outcome='success' order by created_at desc limit 1;
  if result is not null then
    if (result->>'guest_count')::integer<>p_guest_count or result->>'disposition'<>p_disposition then raise exception 'BOOKING_REVISION_CHANGED'; end if;
    return result;
  end if;
  if b.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if p_guest_count is null or p_guest_count<1 or p_guest_count>=b.guest_count then raise exception 'GUEST_COUNT_REDUCTION_REQUIRED'; end if;
  if p_disposition not in ('review-refund','bar-credit') or p_disposition is null then raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end if;
  basis := public.booking_guest_reduction_basis(b.id);
  if basis->>'blockedReason' is not null then raise exception 'GUEST_REDUCTION_MANUAL_REVIEW'; end if;
  corporate := basis->>'bookingKind'='corporate';
  now_at := clock_timestamp();
  cutoff := ((s.date::text||'T'||s.time::text||'+02:00')::timestamptz) - make_interval(days=>case when corporate then 7 else 5 end);
  early := now_at<=cutoff;
  released := (basis->>'ticketAmount')::numeric-round((basis->>'ticketAmount')::numeric*p_guest_count/b.guest_count,2);
  remaining_gratuity := round((basis->>'gratuityAmount')::numeric*p_guest_count/b.guest_count,2);
  cancelled_gratuity := (basis->>'gratuityAmount')::numeric-remaining_gratuity;
  forfeited := case when early then 0 when corporate then released else least(released,550*(b.guest_count-p_guest_count)) end;
  released_paid:=case when (basis->>'depositOnly')::boolean then 550*(b.guest_count-p_guest_count) else released end;
  released_unpaid:=released-released_paid;
  eligible := greatest(0,released_paid-forfeited);
  new_total:=b.total_amount-released_unpaid;
  new_balance:=greatest(0,new_total-b.amount_paid);
  if corporate and not early then gratuity_forfeited:=cancelled_gratuity;
  elsif corporate then gratuity_refund:=cancelled_gratuity;
  else gratuity_review:=cancelled_gratuity; end if;
  credit := case when p_disposition='bar-credit' then eligible else 0 end;
  if p_disposition='bar-credit' and eligible<=0 then raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end if;
  a := jsonb_build_object('version',1,'policyApplied',true,'previousGuestCount',b.guest_count,'guestCount',p_guest_count,
    'bookingKind',basis->>'bookingKind','cutoffAt',cutoff,'fullRefundWindow',early,'disposition',p_disposition,
    'ticketAmount',(basis->>'ticketAmount')::numeric-released,'releasedTicketValue',released,
    'ticketPaidAmount',case when (basis->>'depositOnly')::boolean then 550*p_guest_count else (basis->>'ticketAmount')::numeric-released end,
    'releasedUnpaidAmount',released_unpaid,
    'ticketGratuityAmount',remaining_gratuity,'gratuityReviewAmount',gratuity_review,
    'gratuityForfeitedAmount',gratuity_forfeited,'gratuityRefundEligibleAmount',gratuity_refund,
    'gratuityTransferred',0,'forfeitedAmount',forfeited,'eligibleTicketAmount',eligible,
    'refundReviewAmount',eligible-credit+gratuity_refund,'barCreditAmount',credit,
    'barTabAmount',(basis->>'barTabAmount')::numeric+credit,'otherAmount',(basis->>'otherAmount')::numeric,
    'totalRetainedValue',new_total,'newOutstanding',new_balance,'manualResolutionRequired',eligible>credit or gratuity_review>0 or gratuity_refund>0);
  -- Reject stale/altered previews, including a cutoff crossed while the form was open.
  if p_expected_preview is null then raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end if;
  foreach key in array array['guestCount','previousGuestCount','bookingKind','fullRefundWindow','disposition','ticketAmount','ticketPaidAmount','ticketGratuityAmount','gratuityReviewAmount','gratuityForfeitedAmount','gratuityRefundEligibleAmount','forfeitedAmount','refundReviewAmount','barTabAmount','otherAmount','totalRetainedValue','releasedUnpaidAmount','newOutstanding'] loop
    if a->key is distinct from p_expected_preview->key then raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end if;
  end loop;
  if (a->>'ticketAmount')::numeric+remaining_gratuity+gratuity_review+gratuity_forfeited+forfeited+
      (a->>'refundReviewAmount')::numeric+(a->>'barTabAmount')::numeric+(a->>'otherAmount')::numeric<>new_total then
    raise exception 'RETAINED_VALUE_ALLOCATION_MISMATCH';
  end if;
  -- Existing atomic reduction retains zone/table/ticket guards and immutable money.
  if b.booking_origin='corporate' and b.booking_source='corporate-direct' then
    result:=public.reconcile_corporate_booking_guest_count_atomic(p_booking_reference,p_expected_updated_at,p_guest_count,p_reason,p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent);
  else
    result:=public.reconcile_booking_guest_count_financials_atomic(p_booking_reference,p_expected_updated_at,p_guest_count,p_reason,p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent);
  end if;
  select substring(notes from length('__zingara_booking_meta__:')+1)::jsonb into m from public.bookings where id=b.id;
  a:=a||jsonb_build_object('paymentMethod','unknown','recordedAt',now_at,'recordedByStaffId',p_actor_staff_profile_id);
  m:=jsonb_set(coalesce(m,'{}'),'{valueAllocation}',a,true);
  m:=m||jsonb_build_object('totalPrice',new_total,'subtotalPrice',b.subtotal_amount-released_unpaid,'balanceDue',new_balance,'amountPaid',b.amount_paid);
  update public.bookings set notes='__zingara_booking_meta__:'||m::text,
    total_amount=new_total,subtotal_amount=b.subtotal_amount-released_unpaid,balance_outstanding=new_balance where id=b.id;
  result:=result||jsonb_build_object('disposition',p_disposition,'policy_allocation',a,'total_amount',new_total,'amount_paid',b.amount_paid,'balance_outstanding',new_balance);
  insert into public.audit_events(action,actor_auth_user_id,actor_staff_profile_id,actor_name,actor_role,actor_location_scope,
    entity_id,entity_reference,entity_type,outcome,reason,request_id,source_area,user_agent,before_values,after_values,changed_fields)
    values('booking.policy-guest-reduction',p_actor_auth_user_id,p_actor_staff_profile_id,actor_name,actor_role,actor_scope,
      b.id::text,b.booking_reference,'booking','success',trim(p_reason),p_request_id,'Bookings',p_user_agent,
      jsonb_build_object('guest_count',b.guest_count,'total_amount',b.total_amount,'amount_paid',b.amount_paid),result,array['guest_count','notes']);
  return result;
end $$;

-- Old callers must not retain the all-gratuity transfer behaviour.
create or replace function public.reconcile_paid_booking_guest_reduction_atomic(
  p_booking_reference text,p_expected_updated_at timestamptz,p_guest_count integer,
  p_transfer_released_value_to_bar_tab boolean,p_transfer_gratuity_to_bar_tab boolean,
  p_reason text,p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid,p_request_id text,p_user_agent text
) returns jsonb language plpgsql security definer set search_path=public as $$
begin raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end $$;

revoke all on function public.booking_guest_reduction_basis(uuid) from public,anon,authenticated;
grant execute on function public.booking_guest_reduction_basis(uuid) to service_role;
revoke all on function public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text) to service_role;
