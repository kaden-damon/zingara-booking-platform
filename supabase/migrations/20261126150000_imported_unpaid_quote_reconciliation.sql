-- Extend the existing imported quote/invoice correction. The original paid
-- invoice signature remains unchanged; unpaid quotes never create EFT evidence.
do $guard$
declare definition text:=pg_get_functiondef('public.reconcile_imported_booking_financials_atomic(text,timestamptz,numeric,numeric,text,numeric,numeric,text,uuid,uuid,text,text)'::regprocedure);
begin
  if md5(definition) <> '048d2bfc28b5735ff5ad41f7391626c1' then
    raise exception 'IMPORTED_FINANCIAL_RECONCILIATION_DRIFT'; end if;
  if to_regprocedure('public.reconcile_imported_booking_financials_atomic(text,timestamptz,numeric,numeric,text,numeric,numeric,text,uuid,uuid,text,text,numeric)') is not null then
    raise exception 'IMPORTED_QUOTE_OVERLOAD_ALREADY_EXISTS'; end if;
end $guard$;
create or replace function public.reconcile_imported_booking_financials_atomic(
  p_booking_reference text,p_expected_updated_at timestamptz,
  p_total_amount numeric,p_amount_paid numeric,p_source_document text,
  p_source_ticket_amount numeric,p_source_gratuity_amount numeric,p_reason text,
  p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid,p_request_id text,
  p_user_agent text,p_discount_amount numeric
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  b public.bookings%rowtype;
  m jsonb;
  actor_name text;
  actor_role text;
  scope text[];
  venue text;
  result jsonb;
  changed_at timestamptz := clock_timestamp();
begin
  if p_discount_amount=0 and p_amount_paid=p_total_amount then
    return public.reconcile_imported_booking_financials_atomic(
      p_booking_reference,p_expected_updated_at,p_total_amount,p_amount_paid,
      p_source_document,p_source_ticket_amount,p_source_gratuity_amount,p_reason,
      p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent);
  end if;
  select staff.full_name,role.name,staff.venue_scope into actor_name,actor_role,scope
    from public.staff_profiles staff join public.roles role on role.id=staff.role_id
    join public.role_permissions rp on rp.role_id=role.id
    join public.permissions permission on permission.id=rp.permission_id
    where staff.id=p_actor_staff_profile_id and staff.user_id=p_actor_auth_user_id
      and staff.active and permission.key='bookings:reconcile';
  if actor_name is null then raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if nullif(trim(p_reason),'') is null or nullif(trim(p_source_document),'') is null then
    raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;
  if p_amount_paid is distinct from 0::numeric or p_total_amount is null or p_total_amount<=0
    or exists(select 1 from unnest(array[p_total_amount,p_source_ticket_amount,p_source_gratuity_amount,p_discount_amount]) v
      where v in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
    or p_source_ticket_amount is null or p_source_ticket_amount<=0
    or p_source_gratuity_amount is null or p_source_gratuity_amount<0
    or p_discount_amount is null or p_discount_amount<0 or p_discount_amount>p_source_ticket_amount
    or p_total_amount<>round(p_total_amount,2) or p_source_ticket_amount<>round(p_source_ticket_amount,2)
    or p_source_gratuity_amount<>round(p_source_gratuity_amount,2) or p_discount_amount<>round(p_discount_amount,2)
    or p_source_ticket_amount+p_source_gratuity_amount-p_discount_amount<>p_total_amount then
    raise exception 'FINANCIAL_RECONCILIATION_INVALID'; end if;
  select * into b from public.bookings where booking_reference=upper(trim(p_booking_reference)) for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  select shows.venue into venue from public.shows where id=b.show_id for share;
  if not ('all'=any(coalesce(scope,'{}')) or venue=any(coalesce(scope,'{}'))) then
    raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  if exists(select 1 from public.booking_edit_locks where booking_reference=b.booking_reference
    and released_at is null and last_activity_at>=changed_at-interval '5 minutes'
    and staff_profile_id<>p_actor_staff_profile_id) then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if b.booking_origin<>'data_import' or b.payment_status::text<>'comp_vip'
    or b.amount_paid<>0 or b.total_amount<>0 or b.archived_at is not null
    or b.booking_status::text in ('cancelled','refunded')
    or exists(select 1 from public.payments where booking_id=b.id and amount>0)
    or exists(select 1 from public.legacy_booking_payment_evidence where booking_id=b.id) then
    raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED'; end if;
  m:=substring(b.notes from length('__zingara_booking_meta__:')+1)::jsonb;
  if m ? 'valueAllocation' then raise exception 'BOOKING_RECONCILIATION_NOT_ALLOWED'; end if;
  m:=m-'complimentaryCategory';
  if m->>'agreedPriceSource'='complimentary' then m:=m-'agreedPriceSource'; end if;
  if m#>>'{pricingProvenance,source}'='complimentary' then m:=m-'pricingProvenance'; end if;
  m:=m||jsonb_build_object('subtotalPrice',p_source_ticket_amount,'serviceFeeAmount',p_source_gratuity_amount,
    'discountAmount',p_discount_amount,'totalPrice',p_total_amount,'amountPaid',0,
    'balanceDue',p_total_amount,'paymentStatus','pending-payment',
    'pricePerPerson',round(p_source_ticket_amount/b.guest_count,2));
  update public.bookings set subtotal_amount=p_source_ticket_amount,service_fee=p_source_gratuity_amount,
    discount_amount=p_discount_amount,total_amount=p_total_amount,amount_paid=0,
    balance_outstanding=p_total_amount,payment_status='pending_payment',
    notes='__zingara_booking_meta__:'||m::text,updated_at=changed_at where id=b.id;
  update public.booking_payment_links set status='revoked',revoked_at=changed_at,updated_at=changed_at
    where booking_id=b.id and status='active';
  result:=jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,
    'subtotal_amount',p_source_ticket_amount,'service_fee',p_source_gratuity_amount,
    'discount_amount',p_discount_amount,'total_amount',p_total_amount,'amount_paid',0,
    'balance_outstanding',p_total_amount,'payment_status','pending_payment','updated_at',changed_at,
    'source_document',trim(p_source_document),'deduction_is_payment',false);
  insert into public.audit_events(action,actor_auth_user_id,actor_staff_profile_id,actor_name,actor_role,
    actor_location_scope,entity_id,entity_reference,entity_type,outcome,reason,request_id,
    source_area,user_agent,before_values,after_values,changed_fields)
    values('booking.financial-reconciliation',p_actor_auth_user_id,p_actor_staff_profile_id,actor_name,actor_role,
    scope,b.id::text,b.booking_reference,'booking','success',trim(p_reason),p_request_id,'Bookings',p_user_agent,
    jsonb_build_object('total_amount',b.total_amount,'amount_paid',b.amount_paid,'payment_status',b.payment_status),
    result,array['subtotal_amount','service_fee','discount_amount','total_amount','payment_status','balance_outstanding','notes']);
  return result;
end $$;
revoke all on function public.reconcile_imported_booking_financials_atomic(text,timestamptz,numeric,numeric,text,numeric,numeric,text,uuid,uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.reconcile_imported_booking_financials_atomic(text,timestamptz,numeric,numeric,text,numeric,numeric,text,uuid,uuid,text,text,numeric) to service_role;
