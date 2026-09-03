-- Phase 39.58A: allow reviewed Quote Sent enquiries into the existing atomic conversion.

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
begin
  if new.notes not like '__zingara_booking_meta__:%' then
    return new;
  end if;

  begin
    v_metadata := substring(
      new.notes from length('__zingara_booking_meta__:') + 1
    )::jsonb;
    v_request_id := nullif(v_metadata ->> 'corporateRequestId', '')::uuid;
  exception
    when others then
      raise exception 'CORPORATE_REQUEST_METADATA_INVALID';
  end;

  if v_request_id is null then
    return new;
  end if;

  if new.booking_source <> 'corporate-direct'
     or new.booking_origin::text <> 'corporate'
     or new.created_by_staff_id is null then
    raise exception 'CORPORATE_CONVERSION_CONTEXT_INVALID';
  end if;

  select * into v_request
    from public.corporate_requests
   where id = v_request_id
   for update;

  if v_request.id is null then
    raise exception 'CORPORATE_REQUEST_NOT_FOUND';
  end if;

  if v_request.archived_at is not null
     or v_request.status::text not in ('confirmed', 'quote_sent') then
    raise exception 'CORPORATE_REQUEST_NOT_READY';
  end if;

  if v_request.linked_booking_id is not null
     or v_request.linked_booking_reference is not null then
    raise exception 'CORPORATE_REQUEST_ALREADY_CONVERTED';
  end if;

  new.corporate_request_id := v_request_id;
  return new;
end;
$$;

create or replace function public.complete_corporate_request_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.staff_profiles%rowtype;
begin
  if new.corporate_request_id is null then
    return new;
  end if;

  update public.corporate_requests
     set status = 'converted',
         linked_booking_id = new.id,
         linked_booking_reference = new.booking_reference,
         updated_at = clock_timestamp()
   where id = new.corporate_request_id
     and status::text in ('confirmed', 'quote_sent')
     and archived_at is null
     and linked_booking_id is null
     and linked_booking_reference is null;

  if not found then
    raise exception 'CORPORATE_REQUEST_LINK_FAILED';
  end if;

  if new.created_by_staff_id is not null then
    select * into v_actor
      from public.staff_profiles
     where id = new.created_by_staff_id;
  end if;

  insert into public.audit_events (
    action,
    actor_staff_profile_id,
    actor_auth_user_id,
    actor_name,
    actor_location_scope,
    entity_type,
    entity_reference,
    entity_id,
    outcome,
    source_area,
    reason,
    after_values,
    changed_fields
  ) values (
    'corporate.enquiry-converted',
    new.created_by_staff_id,
    v_actor.user_id,
    coalesce(v_actor.full_name, v_actor.email, 'SYSTEM'),
    coalesce(v_actor.venue_scope, '{}'::text[]),
    'corporate_request',
    new.booking_reference,
    new.corporate_request_id::text,
    'success',
    'Corporate',
    'Corporate enquiry atomically converted and linked to its booking.',
    jsonb_build_object(
      'booking_id', new.id,
      'booking_reference', new.booking_reference,
      'corporate_request_id', new.corporate_request_id,
      'status', 'converted'
    ),
    array['status', 'linked_booking_id', 'linked_booking_reference']
  );

  return new;
end;
$$;

revoke all on function public.link_corporate_request_from_booking_metadata()
  from public, anon, authenticated;
revoke all on function public.complete_corporate_request_conversion()
  from public, anon, authenticated;

comment on function public.link_corporate_request_from_booking_metadata() is
  'Validates and locks a reviewed Confirmed or Quote Sent Corporate enquiry inside the booking insert transaction.';
comment on function public.complete_corporate_request_conversion() is
  'Marks a reviewed Corporate enquiry Converted only after its linked Corporate booking exists in the same transaction.';
