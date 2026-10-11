create or replace function public.update_xero_document_draft_atomic(
  p_document_id uuid,
  p_expected_version integer,
  p_document jsonb,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[]
)
returns public.xero_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.xero_documents%rowtype;
  v_before jsonb;
begin
  select * into v_document
  from public.xero_documents
  where id = p_document_id
  for update;

  if v_document.id is null then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;
  if v_document.version <> p_expected_version
    or v_document.status not in ('draft', 'revised')
    or v_document.accepted_at is not null
    or v_document.xero_document_id is not null then
    raise exception 'DOCUMENT_CHANGED';
  end if;
  if p_document->>'kind' <> v_document.kind then
    raise exception 'DOCUMENT_KIND_IMMUTABLE';
  end if;

  v_before := to_jsonb(v_document);
  update public.xero_documents
  set
    account_number = nullif(p_document->>'account_number', ''),
    billing_address = nullif(p_document->>'billing_address', ''),
    customer_email = nullif(p_document->>'customer_email', ''),
    customer_name = p_document->>'customer_name',
    customer_notes = nullif(p_document->>'customer_notes', ''),
    document_date = (p_document->>'document_date')::date,
    guest_count = nullif(p_document->>'guest_count', '')::integer,
    internal_notes = nullif(p_document->>'internal_notes', ''),
    line_amount_type = p_document->>'line_amount_type',
    lines = p_document->'lines',
    payment_terms = nullif(p_document->>'payment_terms', ''),
    performance_date = nullif(p_document->>'performance_date', '')::date,
    performance_time = nullif(p_document->>'performance_time', '')::time,
    seating_summary = nullif(p_document->>'seating_summary', ''),
    source_booking_reference = nullif(p_document->>'source_booking_reference', ''),
    status = 'revised',
    subtotal_cents = (p_document->>'subtotal_cents')::bigint,
    tax_cents = (p_document->>'tax_cents')::bigint,
    total_cents = (p_document->>'total_cents')::bigint,
    updated_at = now(),
    updated_by_staff_profile_id = p_actor_staff_profile_id,
    valid_until = nullif(p_document->>'valid_until', '')::date,
    venue = p_document->>'venue',
    version = version + 1
  where id = v_document.id
  returning * into v_document;

  insert into public.xero_document_versions(document_id, version, snapshot, created_by_staff_profile_id)
  values(v_document.id, v_document.version, to_jsonb(v_document), p_actor_staff_profile_id);

  insert into public.audit_events(
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome, source_area
  ) values (
    'xero_' || v_document.kind || '_draft_revised', p_actor_auth_user_id,
    p_actor_location_scope, p_actor_name, p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('status', v_document.status, 'version', v_document.version, 'totalCents', v_document.total_cents),
    jsonb_build_object('status', v_before->>'status', 'version', (v_before->>'version')::integer, 'totalCents', (v_before->>'total_cents')::bigint),
    array['status', 'version', 'lines', 'totalCents'], v_document.id::text,
    v_document.venue, v_document.local_reference, 'accounting-document', 'success',
    'xero-foundation'
  );

  return v_document;
end;
$$;

revoke all on function public.update_xero_document_draft_atomic(uuid,integer,jsonb,uuid,uuid,text,text,text[]) from public, anon, authenticated;
grant execute on function public.update_xero_document_draft_atomic(uuid,integer,jsonb,uuid,uuid,text,text,text[]) to service_role;

comment on function public.update_xero_document_draft_atomic(uuid,integer,jsonb,uuid,uuid,text,text,text[])
is 'Revises an unlocked local quote or invoice draft, appends an immutable version and records audit evidence.';
