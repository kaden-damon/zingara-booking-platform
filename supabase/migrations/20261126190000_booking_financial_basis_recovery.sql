-- Recover approved conversion evidence before asking staff for historical amounts.
do $migration$
declare d text; needle text;
begin
  d:=pg_get_functiondef('public.booking_guest_reduction_basis(uuid)'::regprocedure);
  needle:='retained jsonb := ''{}'';';
  if position(needle in d)=0 then raise exception 'FINANCIAL_BASIS_DRIFT'; end if;
  d:=replace(d,needle,needle||$add$
  recovered jsonb;
  recovery_source text;
  preserve_financials boolean := false;
  recovered_ticket numeric;
  recovered_gratuity numeric;
  recovered_other numeric;$add$);
  needle:='if ticket <= 0 or least(gratuity,bar,other) < 0';
  if position(needle in d)=0 then raise exception 'FINANCIAL_BASIS_DRIFT'; end if;
  d:=replace(d,needle,$add$
  if not (m ? 'valueAllocation' or m ? 'operationalFinancialAgreement')
     and blocked in ('The Corporate quote must establish separate ticket and gratuity components before allocation.',
       'Original invoice component evidence is required.') then
    select c.financial_reconciliation into recovered from public.corporate_requests c
      where c.id=b.corporate_request_id and c.linked_booking_id=b.id
        and c.guest_count=b.guest_count;
    begin
      if recovered->>'version'='1' and recovered->>'source'='authorised-historical-review'
         and nullif(recovered->>'reconciledAt','') is not null
         and jsonb_typeof(recovered->'ticketObligation')='number'
         and jsonb_typeof(recovered->'gratuityAmount')='number'
         and jsonb_typeof(recovered->'additionalAmount')='number'
         and jsonb_typeof(recovered->'totalObligation')='number' then
        recovered_ticket:=(recovered->>'ticketObligation')::numeric;
        recovered_gratuity:=(recovered->>'gratuityAmount')::numeric;
        recovered_other:=(recovered->>'additionalAmount')::numeric;
        if recovered_ticket>0 and least(recovered_gratuity,recovered_other)>=0
           and round(recovered_ticket,2)=recovered_ticket
           and round(recovered_gratuity,2)=recovered_gratuity
           and round(recovered_other,2)=recovered_other
           and recovered_ticket+recovered_gratuity+recovered_other=b.total_amount
           and (recovered->>'totalObligation')::numeric=b.total_amount then
          ticket:=recovered_ticket; gratuity:=recovered_gratuity;
          other:=recovered_other; bar:=0; blocked:=null;
          recovery_source:='authorised-corporate-reconciliation';
        end if;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      recovery_source:=null;
    end;
  end if;
  if ticket <= 0 or least(gratuity,bar,other) < 0$add$);
  needle:='return jsonb_build_object(''bookingKind''';
  if position(needle in d)=0 then raise exception 'FINANCIAL_BASIS_DRIFT'; end if;
  d:=replace(d,needle,$add$
  -- Missing itemisation is not permission to invent a credit or rewrite money.
  preserve_financials:=op and blocked in (
    'The Corporate quote must establish separate ticket and gratuity components before allocation.',
    'Original invoice component evidence is required.')
    and not(m ? 'valueAllocation' or m ? 'operationalFinancialAgreement')
    and b.total_amount>0 and b.amount_paid>=0 and b.amount_paid<=b.total_amount
    and b.balance_outstanding=b.total_amount-b.amount_paid
    and b.payment_status::text in ('pending_payment','deposit_paid','fully_paid')
    and (b.payment_status::text<>'fully_paid' or b.amount_paid=b.total_amount)
    and b.archived_at is null and b.booking_status::text in ('new','confirmed','pending_payment')
    and coalesce(jsonb_array_length(b.zone_entitlements),0)<=1
    and not exists(select 1 from public.payment_refunds where booking_id=b.id
      and refund_status::text in ('accepted','processing','reconciliation_required'));
  return jsonb_build_object('preserveFinancials',coalesce(preserve_financials,false),
    'componentRecoverySource',recovery_source,'bookingKind'$add$);
  execute d;
end $migration$;

-- Existing attendance/ticket/queue workflow, restricted to unknown itemisation.
-- The caller cannot use this overload to evade a known cancellation allocation.
create or replace function public.reconcile_booking_guest_count_financials_atomic(
  p_booking_reference text,p_expected_updated_at timestamptz,p_guest_count integer,
  p_reason text,p_actor_staff_profile_id uuid,p_actor_auth_user_id uuid,
  p_request_id text,p_user_agent text,p_preserve_unitemised_financials boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.bookings%rowtype; after_booking public.bookings%rowtype; basis jsonb; result jsonb;
begin
  if p_preserve_unitemised_financials is distinct from true
     or not public.has_booking_operational_authority(p_actor_staff_profile_id,p_actor_auth_user_id) then
    raise exception 'RECONCILIATION_PERMISSION_REQUIRED'; end if;
  select * into b from public.bookings
    where booking_reference=nullif(trim(upper(p_booking_reference)),'') for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  if exists(select 1 from public.booking_edit_locks where booking_reference=b.booking_reference
    and released_at is null and last_activity_at>clock_timestamp()-interval '5 minutes'
    and staff_profile_id is distinct from p_actor_staff_profile_id) then raise exception 'BOOKING_EDIT_LOCKED'; end if;
  if p_guest_count is null or p_guest_count<1 or p_guest_count>=b.guest_count then raise exception 'GUEST_COUNT_INVALID'; end if;
  basis:=public.booking_guest_reduction_basis(b.id,p_actor_staff_profile_id,p_actor_auth_user_id);
  if (basis->>'preserveFinancials')::boolean is distinct from true then raise exception 'GUEST_REDUCTION_POLICY_REVIEW_REQUIRED'; end if;
  result:=case when b.booking_origin='corporate' and b.booking_source='corporate-direct' then
    public.reconcile_corporate_booking_guest_count_atomic(p_booking_reference,p_expected_updated_at,p_guest_count,
      p_reason,p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent)
    else public.reconcile_booking_guest_count_financials_atomic(p_booking_reference,p_expected_updated_at,p_guest_count,
      p_reason,p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent) end;
  select * into after_booking from public.bookings where id=b.id;
  if row(after_booking.total_amount,after_booking.subtotal_amount,after_booking.service_fee,
       after_booking.amount_paid,after_booking.balance_outstanding,after_booking.discount_amount,after_booking.addons_total)
     is distinct from row(b.total_amount,b.subtotal_amount,b.service_fee,b.amount_paid,b.balance_outstanding,b.discount_amount,b.addons_total) then
    raise exception 'OPERATIONAL_EVIDENCE_CANNOT_BE_CHANGED'; end if;
  return result||jsonb_build_object('financials_preserved',true);
end $$;
revoke all on function public.reconcile_booking_guest_count_financials_atomic(text,timestamptz,integer,text,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_booking_guest_count_financials_atomic(text,timestamptz,integer,text,uuid,uuid,text,text,boolean) to service_role;
