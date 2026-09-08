-- Phase 41.1L-B: authoritative imported Corporate financial reconciliation.

alter table public.corporate_requests
  add column if not exists financial_reconciliation jsonb;

comment on column public.corporate_requests.financial_reconciliation is
  'Server-authoritative historical financial evidence reviewed before an imported Corporate enquiry is converted.';

create or replace function public.reconcile_imported_corporate_financials(
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_ticket_obligation numeric,
  p_gratuity_amount numeric,
  p_additional_amount numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_notes text,
  p_actor_staff_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_request_trace_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.corporate_requests%rowtype;
  v_total numeric(14,2);
  v_outstanding numeric(14,2);
  v_now timestamptz := clock_timestamp();
  v_evidence jsonb;
begin
  select * into v_request
    from public.corporate_requests
   where id = p_request_id
   for update;

  if v_request.id is null then
    raise exception 'CORPORATE_REQUEST_NOT_FOUND';
  end if;
  if v_request.source <> 'Data Import' then
    raise exception 'CORPORATE_RECONCILIATION_IMPORT_ONLY';
  end if;
  if v_request.archived_at is not null
     or v_request.status::text not in ('confirmed', 'quote_sent')
     or v_request.linked_booking_id is not null
     or v_request.linked_booking_reference is not null then
    raise exception 'CORPORATE_REQUEST_NOT_RECONCILABLE';
  end if;
  if v_request.updated_at <> p_expected_updated_at then
    raise exception 'CORPORATE_RECONCILIATION_STALE';
  end if;
  if p_ticket_obligation < 0
     or p_gratuity_amount < 0
     or p_additional_amount < 0
     or p_amount_paid < 0 then
    raise exception 'CORPORATE_RECONCILIATION_AMOUNT_INVALID';
  end if;
  if p_payment_method not in ('CC', 'COMP', 'EFT', 'UNKNOWN') then
    raise exception 'CORPORATE_RECONCILIATION_METHOD_INVALID';
  end if;
  if nullif(btrim(p_notes), '') is null then
    raise exception 'CORPORATE_RECONCILIATION_NOTES_REQUIRED';
  end if;

  v_total := round(
    p_ticket_obligation + p_gratuity_amount + p_additional_amount,
    2
  );
  if p_amount_paid > v_total then
    raise exception 'CORPORATE_RECONCILIATION_PAID_EXCEEDS_TOTAL';
  end if;
  if p_payment_method = 'COMP'
     and (v_total <> 0 or p_amount_paid <> 0) then
    raise exception 'CORPORATE_RECONCILIATION_COMP_INVALID';
  end if;
  if p_payment_method <> 'COMP' and v_total <= 0 then
    raise exception 'CORPORATE_RECONCILIATION_TOTAL_REQUIRED';
  end if;

  v_outstanding := round(v_total - p_amount_paid, 2);
  v_evidence := jsonb_build_object(
    'additionalAmount', round(p_additional_amount, 2),
    'amountPaid', round(p_amount_paid, 2),
    'gratuityAmount', round(p_gratuity_amount, 2),
    'notes', btrim(p_notes),
    'outstandingAmount', v_outstanding,
    'paymentMethod', p_payment_method,
    'reconciledAt', v_now,
    'source', 'authorised-historical-review',
    'ticketObligation', round(p_ticket_obligation, 2),
    'totalObligation', v_total,
    'version', 1
  );

  update public.corporate_requests
     set financial_reconciliation = v_evidence,
         updated_at = v_now
   where id = v_request.id;

  insert into public.audit_events (
    action, actor_staff_profile_id, actor_auth_user_id, actor_name, actor_role,
    actor_location_scope, entity_type, entity_reference, entity_id, outcome,
    source_area, reason, before_values, after_values, changed_fields, request_id
  ) values (
    'corporate.imported-financials-reconciled',
    p_actor_staff_profile_id,
    p_actor_auth_user_id,
    p_actor_name,
    p_actor_role,
    coalesce(p_actor_location_scope, '{}'::text[]),
    'corporate_request',
    v_request.id::text,
    v_request.id::text,
    'success',
    'Corporate',
    btrim(p_notes),
    jsonb_build_object('financialReconciliation', v_request.financial_reconciliation),
    jsonb_build_object('financialReconciliation', v_evidence),
    array['financial_reconciliation'],
    p_request_trace_id
  );

  return jsonb_build_object(
    'financialReconciliation', v_evidence,
    'updatedAt', v_now
  );
end;
$$;

revoke all on function public.reconcile_imported_corporate_financials(
  uuid, timestamptz, numeric, numeric, numeric, numeric, text, text,
  uuid, uuid, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.reconcile_imported_corporate_financials(
  uuid, timestamptz, numeric, numeric, numeric, numeric, text, text,
  uuid, uuid, text, text, text[], text
) to service_role;

-- Keep the database conversion boundary fail-closed for paid imports and active
-- duplicate source fingerprints, even if a caller bypasses the Admin route.
create or replace function public.link_corporate_request_from_booking_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_request_id uuid;
  v_request public.corporate_requests%rowtype;
  v_request_metadata jsonb;
  v_import_metadata jsonb;
  v_fingerprint text;
  v_duplicate_count integer;
begin
  if new.notes not like '__zingara_booking_meta__:%' then
    return new;
  end if;

  begin
    v_metadata := substring(
      new.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
    v_request_id := nullif(v_metadata ->> 'corporateRequestId', '')::uuid;
  exception when others then
    raise exception 'CORPORATE_REQUEST_METADATA_INVALID';
  end;

  if v_request_id is null then return new; end if;
  if new.booking_source <> 'corporate-direct'
     or new.booking_origin::text <> 'corporate'
     or new.created_by_staff_id is null then
    raise exception 'CORPORATE_CONVERSION_CONTEXT_INVALID';
  end if;

  select * into v_request
    from public.corporate_requests
   where id = v_request_id
   for update;

  if v_request.id is null then raise exception 'CORPORATE_REQUEST_NOT_FOUND'; end if;
  if v_request.archived_at is not null
     or v_request.status::text not in ('confirmed', 'quote_sent') then
    raise exception 'CORPORATE_REQUEST_NOT_READY';
  end if;
  if v_request.linked_booking_id is not null
     or v_request.linked_booking_reference is not null then
    raise exception 'CORPORATE_REQUEST_ALREADY_CONVERTED';
  end if;

  if v_request.source = 'Data Import' then
    begin
      v_request_metadata := substring(
        v_request.notes from length('__zingara_corporate_request_meta__:') + 1
      )::jsonb;
      v_import_metadata := substring(
        v_request_metadata ->> 'notes'
        from length('__zingara_corporate_enquiry_import__:') + 1
      )::jsonb;
      v_fingerprint := nullif(v_import_metadata ->> 'fingerprint', '');
    exception when others then
      raise exception 'CORPORATE_IMPORT_METADATA_INVALID';
    end;

    if (v_import_metadata ->> 'paymentState') ~* '\mPaid\M'
       and v_request.financial_reconciliation is null then
      raise exception 'CORPORATE_FINANCIAL_RECONCILIATION_REQUIRED';
    end if;

    if v_fingerprint is not null then
      select count(*) into v_duplicate_count
        from public.corporate_requests sibling
       where sibling.source = 'Data Import'
         and sibling.archived_at is null
         and sibling.id <> v_request.id
         and sibling.notes like '%' || v_fingerprint || '%';
      if v_duplicate_count > 0 then
        raise exception 'CORPORATE_IMPORT_DUPLICATE_ACTIVE';
      end if;
    end if;
  end if;

  if v_request.financial_reconciliation is not null
     and (
       new.total_amount <> (v_request.financial_reconciliation ->> 'totalObligation')::numeric
       or new.amount_paid <> (v_request.financial_reconciliation ->> 'amountPaid')::numeric
       or new.balance_outstanding <> (v_request.financial_reconciliation ->> 'outstandingAmount')::numeric
       or coalesce(v_metadata ->> 'historicalPaymentMethod', '') <>
         case v_request.financial_reconciliation ->> 'paymentMethod'
           when 'EFT' then 'eft'
           when 'CC' then 'card'
           when 'UNKNOWN' then 'unknown'
           else ''
         end
     ) then
    raise exception 'CORPORATE_RECONCILIATION_BOOKING_MISMATCH';
  end if;

  new.corporate_request_id := v_request_id;
  return new;
end;
$$;

revoke all on function public.link_corporate_request_from_booking_metadata()
  from public, anon, authenticated;

-- Sherlene/Masthead: two exact imported representations of source row 19.
do $$
declare
  v_survivor public.corporate_requests%rowtype;
  v_duplicate public.corporate_requests%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_survivor from public.corporate_requests
   where id = '2d14df5e-569a-4178-be25-81750763fae4'::uuid for update;
  select * into v_duplicate from public.corporate_requests
   where id = '023ae02b-91fe-4ca4-967f-4f25b8c77e01'::uuid for update;

  if v_survivor.id is null or v_duplicate.id is null
     or v_survivor.source <> 'Data Import'
     or v_duplicate.source <> 'Data Import'
     or v_survivor.status::text <> 'confirmed'
     or v_duplicate.status::text <> 'quote_sent'
     or v_survivor.linked_booking_id is not null
     or v_duplicate.linked_booking_id is not null
     or v_survivor.archived_at is not null
     or v_duplicate.archived_at is not null
     or v_survivor.email <> v_duplicate.email
     or v_survivor.preferred_event_date <> v_duplicate.preferred_event_date
     or v_survivor.guest_count <> v_duplicate.guest_count
     or v_survivor.notes not like '%0f0d51a0bdd5c53dd3f2c7f43afb6ef5c10fd3fc58ad7ec28fdd5f6570cec708%'
     or v_duplicate.notes not like '%0f0d51a0bdd5c53dd3f2c7f43afb6ef5c10fd3fc58ad7ec28fdd5f6570cec708%' then
    raise exception 'SHERLENE_DUPLICATE_PREFLIGHT_MISMATCH';
  end if;

  update public.corporate_requests
     set archived_at = v_now,
         updated_at = v_now
   where id = v_duplicate.id;

  insert into public.audit_events (
    action, actor_name, actor_role, actor_location_scope, entity_type,
    entity_reference, entity_id, outcome, source_area, reason, before_values,
    after_values, changed_fields
  ) values (
    'corporate.imported-duplicate-superseded',
    'SYSTEM',
    'System',
    array['cape-town'],
    'corporate_request',
    v_duplicate.id::text,
    v_duplicate.id::text,
    'success',
    'Phase 41.1L-B',
    'Exact duplicate source fingerprint superseded by the more advanced confirmed enquiry.',
    jsonb_build_object('archivedAt', null, 'survivorId', v_survivor.id),
    jsonb_build_object('archivedAt', v_now, 'survivorId', v_survivor.id),
    array['archived_at']
  );
end;
$$;
