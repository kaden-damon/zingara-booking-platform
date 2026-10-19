create table if not exists public.corporate_company_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  booking_reference text not null,
  customer_name text not null,
  original_company_evidence text,
  initial_company_id uuid references public.companies(id) on delete restrict,
  initial_company_name text,
  venue text not null,
  performance_at timestamptz,
  exception_type text not null check (exception_type in ('conflicting_company','insufficient_evidence')),
  reason text not null,
  status text not null default 'needs_review' check (status in ('needs_review','resolved')),
  resolution_company_id uuid references public.companies(id) on delete restrict,
  reviewed_by_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  reviewed_by_name text,
  reviewed_at timestamptz,
  management_notes text,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists corporate_company_reconciliation_status_idx
  on public.corporate_company_reconciliation_cases(status, exception_type, created_at desc);
create index if not exists corporate_company_reconciliation_venue_idx
  on public.corporate_company_reconciliation_cases(venue, status, created_at desc);
create index if not exists corporate_company_reconciliation_search_idx
  on public.corporate_company_reconciliation_cases using gin (
    to_tsvector('simple', coalesce(booking_reference, '') || ' ' || coalesce(customer_name, '') || ' ' || coalesce(original_company_evidence, ''))
  );

alter table public.corporate_company_reconciliation_cases enable row level security;
revoke all on public.corporate_company_reconciliation_cases from public, anon, authenticated;
grant all on public.corporate_company_reconciliation_cases to service_role;

insert into public.corporate_company_reconciliation_cases (
  booking_id, booking_reference, customer_name, original_company_evidence,
  initial_company_id, initial_company_name, venue, performance_at,
  exception_type, reason
)
select
  booking.id,
  booking.booking_reference,
  trim(customer.first_name || ' ' || coalesce(customer.surname, '')),
  nullif(trim(booking.company_name), ''),
  booking.company_id,
  company.legal_name,
  case
    when lower(show.venue) like '%johannesburg%' then 'johannesburg'
    when lower(show.venue) like '%cape town%' or lower(show.venue) = 'cape-town' then 'cape-town'
    else lower(replace(show.venue, ' ', '-'))
  end,
  (show.date + show.time)::timestamptz,
  case
    when nullif(trim(booking.company_name), '') is null or lower(trim(booking.company_name)) = 'mark'
      then 'insufficient_evidence'
    else 'conflicting_company'
  end,
  case
    when nullif(trim(booking.company_name), '') is null
      then 'No original company evidence is available.'
    when lower(trim(booking.company_name)) = 'mark'
      then 'The original company value does not identify a company.'
    else 'The original company evidence did not safely match an existing active company.'
  end
from public.bookings booking
join public.customers customer on customer.id = booking.customer_id
join public.shows show on show.id = booking.show_id
left join public.companies company on company.id = booking.company_id
where booking.booking_source = 'corporate-direct'
  and booking.company_id is null
on conflict (booking_id) do nothing;

create or replace function public.capture_corporate_company_reconciliation_case()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_name text;
  v_venue text;
  v_performance_at timestamptz;
begin
  if new.booking_source <> 'corporate-direct' or new.company_id is not null then
    return new;
  end if;
  select trim(first_name || ' ' || coalesce(surname, '')) into v_customer_name
  from public.customers where id = new.customer_id;
  select
    case
      when lower(venue) like '%johannesburg%' then 'johannesburg'
      when lower(venue) like '%cape town%' or lower(venue) = 'cape-town' then 'cape-town'
      else lower(replace(venue, ' ', '-'))
    end,
    (date + time)::timestamptz
  into v_venue, v_performance_at
  from public.shows where id = new.show_id;

  insert into public.corporate_company_reconciliation_cases (
    booking_id, booking_reference, customer_name, original_company_evidence,
    venue, performance_at, exception_type, reason
  ) values (
    new.id, new.booking_reference, coalesce(v_customer_name, 'Unknown customer'),
    nullif(trim(new.company_name), ''), coalesce(v_venue, 'unknown'), v_performance_at,
    case when nullif(trim(new.company_name), '') is null or lower(trim(new.company_name)) = 'mark'
      then 'insufficient_evidence' else 'conflicting_company' end,
    case when nullif(trim(new.company_name), '') is null then 'No original company evidence is available.'
      when lower(trim(new.company_name)) = 'mark' then 'The original company value does not identify a company.'
      else 'The original company evidence did not safely match an existing active company.' end
  ) on conflict (booking_id) do nothing;
  return new;
end;
$$;

drop trigger if exists bookings_capture_company_reconciliation on public.bookings;
create trigger bookings_capture_company_reconciliation
  after insert or update of company_id, company_name on public.bookings
  for each row execute function public.capture_corporate_company_reconciliation_case();

create or replace function public.resolve_corporate_company_reconciliation_case(
  p_case_id uuid,
  p_company_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_management_notes text,
  p_actor_auth_user_id uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_role text,
  p_actor_location_scope text[],
  p_request_id text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.corporate_company_reconciliation_cases%rowtype;
  v_booking public.bookings%rowtype;
  v_company public.companies%rowtype;
begin
  if lower(trim(coalesce(p_actor_role, ''))) not in ('super admin','venue manager','box office manager') then
    raise exception 'MANAGEMENT_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'REASON_REQUIRED'; end if;

  select * into v_case from public.corporate_company_reconciliation_cases
  where id = p_case_id for update;
  if not found then raise exception 'CASE_NOT_FOUND'; end if;
  if v_case.revision <> p_expected_revision then raise exception 'CASE_CHANGED'; end if;
  if v_case.status = 'resolved' then
    return jsonb_build_object('id', v_case.id, 'status', v_case.status, 'idempotent', true);
  end if;
  if not ('all' = any(coalesce(p_actor_location_scope, '{}'::text[])))
     and not (v_case.venue = any(coalesce(p_actor_location_scope, '{}'::text[]))) then
    raise exception 'VENUE_SCOPE_REQUIRED';
  end if;

  select * into v_booking from public.bookings where id = v_case.booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.company_id is distinct from v_case.initial_company_id then
    raise exception 'BOOKING_COMPANY_CHANGED';
  end if;

  if p_company_id is not null then
    select * into v_company from public.companies
    where id = p_company_id and archived_at is null and merged_into_company_id is null;
    if not found then raise exception 'COMPANY_NOT_AVAILABLE'; end if;

    update public.bookings set company_id = p_company_id, updated_at = now()
    where id = v_booking.id;

    insert into public.customer_company_associations (
      customer_id, company_id, created_by_staff_profile_id, created_at
    )
    select v_booking.customer_id, p_company_id, p_actor_staff_profile_id, now()
    where not exists (
      select 1 from public.customer_company_associations association
      where association.customer_id = v_booking.customer_id
        and association.company_id = p_company_id and association.removed_at is null
    );
  end if;

  update public.corporate_company_reconciliation_cases
  set status = 'resolved', resolution_company_id = p_company_id,
      reviewed_by_staff_profile_id = p_actor_staff_profile_id,
      reviewed_by_name = p_actor_name, reviewed_at = now(),
      management_notes = nullif(left(trim(coalesce(p_management_notes, '')), 2000), ''),
      revision = revision + 1, updated_at = now()
  where id = v_case.id
  returning * into v_case;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    case when p_company_id is null then 'booking.company-review-resolved' else 'booking.company-reconciled' end,
    p_actor_auth_user_id, coalesce(p_actor_location_scope, '{}'), p_actor_name,
    p_actor_role, p_actor_staff_profile_id,
    jsonb_build_object('company_id', p_company_id, 'reconciliation_status', 'resolved'),
    jsonb_build_object('company_id', v_booking.company_id, 'reconciliation_status', 'needs_review', 'original_company_evidence', v_case.original_company_evidence),
    case when p_company_id is null then array['reconciliation_status'] else array['company_id','reconciliation_status'] end,
    v_booking.id::text, v_booking.booking_reference, 'booking', 'success',
    left(trim(p_reason), 1000), p_request_id, 'Corporate Company Reconciliation', p_user_agent
  );

  return jsonb_build_object('id', v_case.id, 'status', v_case.status,
    'companyId', v_case.resolution_company_id, 'revision', v_case.revision, 'idempotent', false);
end;
$$;

revoke all on function public.resolve_corporate_company_reconciliation_case(uuid,uuid,integer,text,text,uuid,uuid,text,text,text[],text,text) from public, anon, authenticated;
grant execute on function public.resolve_corporate_company_reconciliation_case(uuid,uuid,integer,text,text,uuid,uuid,text,text,text[],text,text) to service_role;
