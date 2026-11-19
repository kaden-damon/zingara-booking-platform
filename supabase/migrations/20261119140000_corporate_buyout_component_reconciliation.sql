-- Component agreements extend native reconciliation, not package catalogue pricing.
create or replace function public.reconcile_corporate_buyout_components_atomic(
  p_booking_reference text, p_expected_updated_at timestamptz,
  p_total_amount numeric, p_amount_paid numeric, p_reason text,
  p_actor_staff_profile_id uuid, p_actor_auth_user_id uuid,
  p_request_id text, p_user_agent text, p_components jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  c public.corporate_buyouts%rowtype;
  m jsonb;
  a jsonb;
  v_addons jsonb := '[]'::jsonb;
  v_base numeric;
  v_discount numeric;
  v_vat numeric;
  v_gratuity numeric;
  v_addons_total numeric := 0;
  v_subtotal numeric;
  v_now timestamptz;
  v_result jsonb;
begin
  select * into b from public.bookings
    where booking_reference = upper(trim(p_booking_reference)) for update;
  if b.id is null then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.updated_at is distinct from p_expected_updated_at then raise exception 'BOOKING_REVISION_CHANGED'; end if;
  select * into c from public.corporate_buyouts where booking_id = b.id for update;
  if c.id is null or c.state not in ('provisional','awaiting_payment','fully_paid','confirmed')
    or b.booking_origin <> 'corporate' or b.booking_source <> 'corporate-direct'
    or c.commercial_additional_guest_amount <> 0 then
    raise exception 'BUYOUT_COMPONENT_RECONCILIATION_NOT_ALLOWED';
  end if;
  if exists (select 1 from public.booking_edit_locks where booking_id = b.id
    and released_at is null and last_activity_at > now() - interval '5 minutes'
    and staff_profile_id <> p_actor_staff_profile_id) then raise exception 'BOOKING_LOCKED'; end if;
  -- This path never changes payment evidence or previously issued documents.
  if p_amount_paid is distinct from b.amount_paid
    or exists (select 1 from public.payments where booking_id = b.id)
    or exists (select 1 from public.legacy_booking_payment_evidence where booking_id = b.id)
    or exists (select 1 from public.xero_documents where source_booking_id = b.id
      or source_booking_reference = b.booking_reference)
    or coalesce(b.addons_total,0) <> 0 then
    raise exception 'BUYOUT_COMPONENT_EXISTING_FINANCIAL_EVIDENCE';
  end if;
  m := substring(b.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
  if m->>'commercialModel' is distinct from 'fixed-buyout-package'
    or coalesce(jsonb_array_length(coalesce(m->'addons','[]'::jsonb)),0) <> 0
    or nullif(trim(p_components->>'sourceDocument'),'') is null
    or coalesce(p_components->>'sourceSha256','') !~ '^[a-f0-9]{64}$'
    or nullif(trim(p_components->>'packageName'),'') is null
    or jsonb_typeof(p_components->'addons') is distinct from 'array'
    or jsonb_array_length(p_components->'addons') > 40 then
    raise exception 'BUYOUT_COMPONENTS_INVALID';
  end if;
  v_base := (p_components->>'originalBase')::numeric;
  v_discount := (p_components->>'discount')::numeric;
  v_vat := (p_components->>'vat')::numeric;
  v_gratuity := (p_components->>'gratuity')::numeric;
  if v_base is null or v_discount is null or v_vat is null or v_gratuity is null
    or v_base <= v_discount or v_discount < 0 or v_vat < 0 or v_gratuity < 0
    or v_base <> round(v_base,2) or v_discount <> round(v_discount,2)
    or v_vat <> round(v_vat,2) or v_gratuity <> round(v_gratuity,2)
    or v_vat <> round((v_base-v_discount)*0.15,2)
    or v_gratuity <> round(v_base*0.125,2) then raise exception 'BUYOUT_COMPONENTS_INVALID'; end if;
  for a in select value from jsonb_array_elements(p_components->'addons') loop
    if coalesce(a->>'id','') !~ '^custom-[a-z0-9-]+$'
      or nullif(trim(a->>'name'),'') is null or jsonb_typeof(a->'description') is distinct from 'string'
      or (a->>'amount') is null or (a->>'amount')::numeric < 0
      or (a->>'amount')::numeric <> round((a->>'amount')::numeric,2)
      or exists (select 1 from jsonb_array_elements(v_addons) x where x->>'id'=a->>'id') then
      raise exception 'BUYOUT_COMPONENTS_INVALID';
    end if;
    v_addons_total := v_addons_total + (a->>'amount')::numeric;
    v_addons := v_addons || jsonb_build_array(jsonb_build_object(
      'id',a->>'id','name',a->>'name','description',a->>'description',
      'kind','custom','pricingType','priced','quantity',1,
      'unitPrice',(a->>'amount')::numeric,'price',(a->>'amount')::numeric));
  end loop;
  if (p_components#>>'{requirements,strictlyHalaal}') is null
    or (p_components#>>'{requirements,kosher}') is null
    or (p_components#>>'{requirements,strictlyHalaal}')::numeric < 0
    or (p_components#>>'{requirements,kosher}')::numeric < 0
    or (p_components#>>'{requirements,strictlyHalaal}')::numeric <> trunc((p_components#>>'{requirements,strictlyHalaal}')::numeric)
    or (p_components#>>'{requirements,kosher}')::numeric <> trunc((p_components#>>'{requirements,kosher}')::numeric)
    or (p_components#>>'{requirements,strictlyHalaal}')::numeric + (p_components#>>'{requirements,kosher}')::numeric > b.guest_count
    or jsonb_typeof(p_components#>'{requirements,sourceQuantity}') is distinct from 'string'
    or p_total_amount is null or p_total_amount <> round(p_total_amount,2)
    or v_base-v_discount+v_vat+v_gratuity+v_addons_total <> p_total_amount then
    raise exception 'BUYOUT_COMPONENTS_INVALID';
  end if;
  -- Reuse permissions, immutable paid floors, lifecycle/revision guards and link invalidation.
  v_result := public.reconcile_booking_financials_and_links_atomic(
    p_booking_reference,p_expected_updated_at,p_total_amount,p_amount_paid,p_reason,
    p_actor_staff_profile_id,p_actor_auth_user_id,p_request_id,p_user_agent);
  v_now := clock_timestamp();
  v_subtotal := v_base+v_vat+v_addons_total;
  m := m || jsonb_build_object('buyoutComponentAgreement',p_components,
    'addons',v_addons,'subtotalPrice',v_subtotal,'discountAmount',v_discount,
    'serviceFeeAmount',v_gratuity,'totalPrice',p_total_amount,'amountPaid',b.amount_paid,
    'balanceDue',p_total_amount-b.amount_paid,'paymentStatus',
      case when b.amount_paid=0 then 'pending-payment' when b.amount_paid>=p_total_amount then 'fully-paid' else 'deposit-paid' end);
  update public.bookings set subtotal_amount=v_subtotal,discount_amount=v_discount,
    service_fee=v_gratuity,addons_total=v_addons_total,
    notes='__zingara_booking_meta__:'||m::text,updated_at=v_now where id=b.id;
  update public.corporate_buyouts set commercial_base_amount=v_base-v_discount,
    commercial_vat_amount=v_vat,commercial_gratuity_amount=v_gratuity,
    commercial_total_amount=v_base-v_discount+v_vat+v_gratuity,
    revision=revision+1,updated_at=v_now,updated_by_staff_profile_id=p_actor_staff_profile_id
    where id=c.id;
  -- The original package/terms snapshots and all operational/order fields remain untouched.
  insert into public.audit_events(action,actor_auth_user_id,actor_staff_profile_id,
    actor_name,actor_role,actor_location_scope,before_values,after_values,changed_fields,
    entity_id,entity_reference,entity_type,outcome,reason,request_id,source_area,user_agent)
  select 'corporate.buyout.component-reconciliation',s.user_id,s.id,s.full_name,r.name,
    coalesce(s.venue_scope,'{}'::text[]),jsonb_build_object('booking',to_jsonb(b),'buyout',to_jsonb(c)),
    jsonb_build_object('agreement',p_components,'subtotal_amount',v_subtotal,
      'discount_amount',v_discount,'addons_total',v_addons_total,'service_fee',v_gratuity,
      'total_amount',p_total_amount,'amount_paid',b.amount_paid,'balance_outstanding',p_total_amount-b.amount_paid,
      'supplier_orders_created',false),
    array['subtotal_amount','discount_amount','addons_total','service_fee','notes','commercial_components'],
    b.id::text,b.booking_reference,'booking','success',p_reason,p_request_id,'Bookings',p_user_agent
    from public.staff_profiles s join public.roles r on r.id=s.role_id where s.id=p_actor_staff_profile_id;
  return v_result || jsonb_build_object('updated_at',v_now,'components_reconciled',true);
end;
$$;
revoke all on function public.reconcile_corporate_buyout_components_atomic(
  text,timestamptz,numeric,numeric,text,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_corporate_buyout_components_atomic(
  text,timestamptz,numeric,numeric,text,uuid,uuid,text,text,jsonb) to service_role;
