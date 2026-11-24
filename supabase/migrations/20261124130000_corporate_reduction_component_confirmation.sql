-- Confirm a bundled Corporate invoice within the existing atomic reduction.
-- No booking rows or historical receipts are changed by this migration.
do $migration$
declare
  definition text;
  original text;
  marker text := '  basis := public.booking_guest_reduction_basis(b.id);';
begin
  select pg_get_functiondef('public.reconcile_booking_guest_reduction_policy_atomic(text,timestamptz,integer,text,jsonb,text,uuid,uuid,text,text)'::regprocedure) into definition;
  original := definition;
  if position(marker in definition)=0 or position('confirmedComponents' in definition)>0 then
    raise exception 'Unexpected guest reduction function; review before applying';
  end if;
  definition := replace(definition,marker,$patch$
  basis := public.booking_guest_reduction_basis(b.id);
  if p_expected_preview ? 'confirmedComponents' then
    -- This can resolve only the missing Corporate split, never another guard.
    if b.booking_source <> 'corporate-direct' or b.service_fee <> 0
       or basis->>'bookingKind' <> 'corporate'
       or basis->>'blockedReason' is distinct from 'The Corporate quote must establish separate ticket and gratuity components before allocation.' then
      raise exception 'GUEST_REDUCTION_COMPONENTS_INVALID';
    end if;
    declare
      c jsonb := p_expected_preview->'confirmedComponents';
      component_key text;
      component_amount numeric;
      component_sum numeric := 0;
    begin
      if jsonb_typeof(c) is distinct from 'object'
         or c->'confirmed' is distinct from 'true'::jsonb
         or jsonb_typeof(c->'sourceDocument') is distinct from 'string'
         or length(trim(c->>'sourceDocument')) not between 1 and 500 then
        raise exception 'GUEST_REDUCTION_COMPONENTS_INVALID';
      end if;
      foreach component_key in array array['ticketAmount','gratuityAmount','barTabAmount','otherAmount'] loop
        if jsonb_typeof(c->component_key) is distinct from 'number' then
          raise exception 'GUEST_REDUCTION_COMPONENTS_INVALID';
        end if;
        component_amount := (c->>component_key)::numeric;
        if component_amount<0 or component_amount<>round(component_amount,2)
           or component_amount>90071992547409.91 then
          raise exception 'GUEST_REDUCTION_COMPONENTS_INVALID';
        end if;
        component_sum := component_sum+component_amount;
      end loop;
      if (c->>'ticketAmount')::numeric<=0 or component_sum<>b.total_amount
         or (c->>'otherAmount')::numeric<coalesce(b.addons_total,0) then
        raise exception 'GUEST_REDUCTION_COMPONENTS_INVALID';
      end if;
      basis := basis || jsonb_build_object('ticketAmount',c->'ticketAmount',
        'gratuityAmount',c->'gratuityAmount','barTabAmount',c->'barTabAmount',
        'otherAmount',c->'otherAmount','blockedReason',null,'confirmedComponents',c);
    end;
  end if;
$patch$);
  marker := '  m:=jsonb_set(coalesce(m,''{}''),''{valueAllocation}'',a,true);';
  if position(marker in definition)=0 then raise exception 'Missing allocation audit point'; end if;
  definition := replace(definition,marker,$patch$
  if basis ? 'confirmedComponents' then
    a:=a||jsonb_build_object('confirmedComponents',basis->'confirmedComponents');
  end if;
  m:=jsonb_set(coalesce(m,'{}'),'{valueAllocation}',a,true);
$patch$);
  if definition=original then raise exception 'Guest reduction update not applied'; end if;
  execute definition;
end $migration$;
