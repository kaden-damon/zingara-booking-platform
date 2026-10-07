begin;

create table if not exists public.corporate_buyout_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null check (version > 0),
  display_name text not null,
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  base_amount numeric(12,2) not null check (base_amount > 0),
  gratuity_amount numeric(12,2) not null check (gratuity_amount >= 0),
  vat_amount numeric(12,2) not null check (vat_amount >= 0),
  total_amount numeric(12,2) not null check (
    total_amount = base_amount + gratuity_amount + vat_amount
  ),
  included_guest_count integer not null default 400 check (included_guest_count > 0),
  maximum_guest_count integer check (
    maximum_guest_count is null or maximum_guest_count >= included_guest_count
  ),
  additional_guest_rate numeric(12,2) check (
    additional_guest_rate is null or additional_guest_rate > 0
  ),
  quote_validity_hours integer check (quote_validity_hours is null or quote_validity_hours > 0),
  date_hold_hours integer check (date_hold_hours is null or date_hold_hours > 0),
  payment_due_hours integer check (payment_due_hours is null or payment_due_hours > 0),
  inclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(inclusions) = 'array'),
  exclusions jsonb not null default '[]'::jsonb check (jsonb_typeof(exclusions) = 'array'),
  active boolean not null default true,
  created_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corporate_buyout_packages_code_version_key unique (code, version)
);

create unique index if not exists corporate_buyout_packages_one_active_version_idx
  on public.corporate_buyout_packages (code)
  where active;

create table if not exists public.corporate_buyouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  contact_customer_id uuid not null references public.customers(id) on delete restrict,
  package_id uuid not null references public.corporate_buyout_packages(id) on delete restrict,
  package_snapshot jsonb not null check (jsonb_typeof(package_snapshot) = 'object'),
  terms_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(terms_snapshot) = 'object'),
  state text not null default 'awaiting_payment' check (
    state in ('provisional', 'awaiting_payment', 'fully_paid', 'confirmed', 'cancelled', 'released')
  ),
  expected_guest_count integer not null check (expected_guest_count > 0),
  current_guest_count integer not null check (current_guest_count > 0),
  final_guest_count integer check (final_guest_count is null or final_guest_count > 0),
  included_guest_count integer not null check (included_guest_count > 0),
  approved_additional_guest_count integer not null default 0 check (approved_additional_guest_count >= 0),
  additional_guest_rate numeric(12,2) check (additional_guest_rate is null or additional_guest_rate > 0),
  zone_allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(zone_allocations) = 'array'),
  allocated_guest_count integer not null default 0 check (allocated_guest_count >= 0),
  unallocated_guest_count integer not null check (unallocated_guest_count >= 0),
  ticket_entitlement_count integer not null default 0 check (ticket_entitlement_count >= 0),
  commercial_base_amount numeric(12,2) not null check (commercial_base_amount > 0),
  commercial_gratuity_amount numeric(12,2) not null check (commercial_gratuity_amount >= 0),
  commercial_vat_amount numeric(12,2) not null check (commercial_vat_amount >= 0),
  commercial_additional_guest_amount numeric(12,2) not null default 0 check (commercial_additional_guest_amount >= 0),
  commercial_total_amount numeric(12,2) not null check (commercial_total_amount > 0),
  quote_valid_until timestamptz,
  hold_until timestamptz,
  payment_due_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  cancelled_at timestamptz,
  cancelled_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  cancellation_reason text,
  released_at timestamptz,
  released_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  release_reason text,
  created_by_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  updated_by_staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corporate_buyouts_guest_allocation_check check (
    allocated_guest_count + unallocated_guest_count = current_guest_count
  ),
  constraint corporate_buyouts_ticket_entitlement_check check (
    ticket_entitlement_count <= current_guest_count
  ),
  constraint corporate_buyouts_additional_amount_check check (
    commercial_additional_guest_amount =
      round(approved_additional_guest_count * coalesce(additional_guest_rate, 0), 2)
  ),
  constraint corporate_buyouts_commercial_total_check check (
    commercial_total_amount = commercial_base_amount
      + commercial_gratuity_amount
      + commercial_vat_amount
      + commercial_additional_guest_amount
  )
);

create unique index if not exists corporate_buyouts_one_active_show_idx
  on public.corporate_buyouts (show_id)
  where state in ('provisional', 'awaiting_payment', 'fully_paid', 'confirmed');

create unique index if not exists corporate_buyouts_idempotency_key_idx
  on public.corporate_buyouts ((terms_snapshot ->> 'idempotencyKey'))
  where nullif(terms_snapshot ->> 'idempotencyKey', '') is not null;

create index if not exists corporate_buyouts_company_idx
  on public.corporate_buyouts (company_id, created_at desc);

create index if not exists corporate_buyouts_state_idx
  on public.corporate_buyouts (state, show_id);

alter table public.corporate_buyout_packages enable row level security;
alter table public.corporate_buyouts enable row level security;
revoke all on public.corporate_buyout_packages from public, anon, authenticated;
revoke all on public.corporate_buyouts from public, anon, authenticated;
grant select, insert, update on public.corporate_buyout_packages to service_role;
grant select, insert, update on public.corporate_buyouts to service_role;

insert into public.corporate_buyout_packages (
  code, version, display_name, base_amount, gratuity_amount, vat_amount,
  total_amount, included_guest_count, inclusions, exclusions
) values
  (
    'private-salon', 1, 'The Private Salon', 590000.00, 73750.00, 88500.00,
    752250.00, 400,
    '["Exclusivity of event","Welcome Zingara drink on arrival, alcoholic or non-alcoholic","Multi-course dinner and show","12.5% gratuity","Branding","Separate bar allocation/spend","12.5% gratuity on the final drinks bill"]'::jsonb,
    '["Wines and water"]'::jsonb
  ),
  (
    'speakeasy', 1, 'The Speakeasy', 655600.00, 81950.00, 98340.00,
    835890.00, 400,
    '["All applicable Private Salon inclusions","MC for speeches","Approximately 30 minutes for an agreed client programme such as awards or speeches","Earlier tent access from 17:00 where agreed"]'::jsonb,
    '[]'::jsonb
  ),
  (
    'grand-society', 1, 'The Grand Society', 742500.00, 92812.50, 111375.00,
    946687.50, 400,
    '["Exclusivity of event and venue","Welcome Zingara drink","Multi-course dinner and show","Four bottles of wine/water per table of 8","12.5% gratuity","Branding","MC","Approximately 30 minutes for an agreed client programme such as awards or speeches","Earlier tent access where agreed"]'::jsonb,
    '[]'::jsonb
  )
on conflict (code, version) do nothing;

create or replace function public.corporate_buyout_zone_allocations_valid(
  p_allocations jsonb,
  p_current_guest_count integer
)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) item
      where public.normalize_booking_capacity_zone(item ->> 'zoneId') is null
         or public.normalize_booking_capacity_zone(item ->> 'zoneId') <> item ->> 'zoneId'
         or coalesce((item ->> 'pax') ~ '^[1-9][0-9]*$', false) is false
    )
    and (
      select count(*) = count(distinct item ->> 'zoneId')
      from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) item
    )
    and coalesce((
      select sum((item ->> 'pax')::integer)
      from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) item
    ), 0) <= p_current_guest_count
$$;

create or replace function public.assert_show_has_no_active_buyout(
  p_show_id uuid,
  p_booking_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_public boolean;
begin
  v_is_public :=
    coalesce(p_booking_payload ->> 'booking_origin', '') = 'customer_public'
    or (
      nullif(p_booking_payload ->> 'booking_origin', '') is null
      and coalesce(p_booking_payload ->> 'booking_source', 'online') = 'online'
    );
  if not v_is_public then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('corporate-buyout:' || p_show_id::text, 0));

  if exists (
    select 1 from public.corporate_buyouts
    where show_id = p_show_id
      and state in ('provisional', 'awaiting_payment', 'fully_paid', 'confirmed')
  ) then
    raise exception 'SHOW_NOT_AVAILABLE';
  end if;
end;
$$;

create or replace function public.enforce_public_buyout_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_show_has_no_active_buyout(new.show_id, to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists bookings_public_buyout_guard on public.bookings;
create trigger bookings_public_buyout_guard
  before insert on public.bookings
  for each row execute function public.enforce_public_buyout_guard();

create or replace function public.create_corporate_buyout_atomic(
  p_show_id uuid,
  p_company_id uuid,
  p_contact_customer_id uuid,
  p_package_id uuid,
  p_expected_guest_count integer,
  p_final_guest_count integer,
  p_additional_guest_rate numeric,
  p_maximum_guest_count integer,
  p_quote_valid_until timestamptz,
  p_hold_until timestamptz,
  p_payment_due_at timestamptz,
  p_terms_snapshot jsonb,
  p_booking_reference text,
  p_idempotency_key text,
  p_authorized_venues text[],
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
set search_path = public
as $$
declare
  v_active_booking_count integer;
  v_active_guest_count integer;
  v_additional_amount numeric(12,2);
  v_additional_guests integer;
  v_booking public.bookings%rowtype;
  v_buyout public.corporate_buyouts%rowtype;
  v_company public.companies%rowtype;
  v_contact public.customers%rowtype;
  v_current_guest_count integer;
  v_existing public.corporate_buyouts%rowtype;
  v_package public.corporate_buyout_packages%rowtype;
  v_reference text;
  v_show public.shows%rowtype;
  v_total numeric(12,2);
  v_total_operational_capacity integer;
  v_venue_key text;
begin
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'BUYOUT_IDEMPOTENCY_REQUIRED'; end if;
  if p_expected_guest_count is null or p_expected_guest_count <= 0 then raise exception 'BUYOUT_GUEST_COUNT_INVALID'; end if;
  if p_final_guest_count is not null and p_final_guest_count <= 0 then raise exception 'BUYOUT_GUEST_COUNT_INVALID'; end if;

  select buyout.* into v_existing
  from public.corporate_buyouts buyout
  where buyout.terms_snapshot ->> 'idempotencyKey' = trim(p_idempotency_key)
  limit 1;
  if found then
    return jsonb_build_object(
      'idempotent', true,
      'buyoutId', v_existing.id,
      'bookingId', v_existing.booking_id,
      'bookingReference', (select booking_reference from public.bookings where id = v_existing.booking_id)
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('corporate-buyout:' || p_show_id::text, 0));

  select buyout.* into v_existing
  from public.corporate_buyouts buyout
  where buyout.terms_snapshot ->> 'idempotencyKey' = trim(p_idempotency_key)
  limit 1;
  if found then
    return jsonb_build_object(
      'idempotent', true,
      'buyoutId', v_existing.id,
      'bookingId', v_existing.booking_id,
      'bookingReference', (select booking_reference from public.bookings where id = v_existing.booking_id)
    );
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if not found then raise exception 'BUYOUT_SHOW_NOT_FOUND'; end if;
  if v_show.status::text <> 'active' then raise exception 'BUYOUT_SHOW_NOT_OPEN'; end if;

  v_venue_key := case
    when lower(v_show.venue) like '%johannesburg%' or lower(v_show.venue) = 'jhb' then 'johannesburg'
    when lower(v_show.venue) like '%cape town%' or lower(v_show.venue) = 'cpt' then 'cape-town'
    else lower(replace(v_show.venue, ' ', '-'))
  end;
  if not ('all' = any(coalesce(p_authorized_venues, '{}'::text[])))
     and not (v_venue_key = any(coalesce(p_authorized_venues, '{}'::text[]))) then
    raise exception 'BUYOUT_VENUE_NOT_ALLOWED';
  end if;

  if exists (
    select 1 from public.corporate_buyouts
    where show_id = p_show_id
      and state in ('provisional', 'awaiting_payment', 'fully_paid', 'confirmed')
  ) then raise exception 'BUYOUT_SHOW_ALREADY_OWNED'; end if;

  select count(*)::integer, coalesce(sum(guest_count), 0)::integer
    into v_active_booking_count, v_active_guest_count
  from public.bookings
  where show_id = p_show_id
    and archived_at is null
    and booking_status::text in ('new', 'confirmed', 'pending_payment', 'checked_in');
  if v_active_booking_count > 0 then raise exception 'BUYOUT_SHOW_HAS_BOOKINGS'; end if;

  select * into v_package
  from public.corporate_buyout_packages
  where id = p_package_id and active
  for share;
  if not found then raise exception 'BUYOUT_PACKAGE_NOT_AVAILABLE'; end if;
  if p_maximum_guest_count is distinct from v_package.maximum_guest_count
     or p_additional_guest_rate is distinct from v_package.additional_guest_rate then
    raise exception 'BUYOUT_PACKAGE_CHANGED';
  end if;

  select * into v_company
  from public.companies
  where id = p_company_id and archived_at is null and merged_into_company_id is null
  for share;
  if not found then raise exception 'BUYOUT_COMPANY_NOT_AVAILABLE'; end if;

  select * into v_contact
  from public.customers
  where id = p_contact_customer_id
    and company_id = p_company_id
    and merged_into_customer_id is null
  for share;
  if not found then raise exception 'BUYOUT_CONTACT_NOT_LINKED'; end if;

  v_current_guest_count := coalesce(p_final_guest_count, p_expected_guest_count);
  v_additional_guests := greatest(v_current_guest_count - v_package.included_guest_count, 0);
  if v_additional_guests > 0 then
    if p_maximum_guest_count is null or p_additional_guest_rate is null then
      raise exception 'BUYOUT_EXTRA_TERMS_REQUIRED';
    end if;
    if v_current_guest_count > p_maximum_guest_count then raise exception 'BUYOUT_MAXIMUM_EXCEEDED'; end if;
  end if;
  v_additional_amount := round(v_additional_guests * coalesce(p_additional_guest_rate, 0), 2);
  v_total := v_package.total_amount + v_additional_amount;

  select coalesce(sum(public.booking_capacity_zone_effective_limit(p_show_id, zone_id)), 0)::integer
    into v_total_operational_capacity
  from unnest(array['golden-circle','middle-ring','royal-booths','royal-balcony']) zone_id;
  if v_current_guest_count > v_total_operational_capacity then
    raise exception 'BUYOUT_OPERATIONAL_CAPACITY_EXCEEDED';
  end if;

  v_reference := upper(trim(p_booking_reference));
  if v_reference !~ '^ZNG-[A-Z0-9]{6,12}$' or exists (
    select 1 from public.bookings where booking_reference = v_reference
  ) then raise exception 'BUYOUT_BOOKING_REFERENCE_INVALID'; end if;

  insert into public.bookings (
    customer_id, company_id, show_id, table_id, corporate_request_id,
    booking_reference, booking_source, booking_origin, created_by_staff_id,
    provenance_recorded_at, company_name, guest_count, booking_status,
    payment_status, section, zone_entitlements, service_fee, subtotal_amount,
    discount_amount, addons_total, total_amount, amount_paid,
    balance_outstanding, notes
  ) values (
    p_contact_customer_id, p_company_id, p_show_id, null, null,
    v_reference, 'corporate-direct', 'corporate', p_actor_staff_profile_id,
    now(), v_company.legal_name, v_current_guest_count, 'pending_payment',
    'pending_payment', 'Full Show Buyout', null, v_package.gratuity_amount,
    v_package.base_amount + v_package.vat_amount + v_additional_amount,
    0, 0, v_total, 0, v_total,
    '__zingara_booking_meta__:' || jsonb_build_object(
      'bookingOrigin', 'corporate',
      'commercialModel', 'fixed-buyout-package',
      'createdByStaffId', p_actor_staff_profile_id,
      'buyoutPackageCode', v_package.code,
      'buyoutPackageVersion', v_package.version,
      'ticketIssuanceDeferred', true
    )::text
  ) returning * into v_booking;

  insert into public.corporate_buyouts (
    booking_id, show_id, company_id, contact_customer_id, package_id,
    package_snapshot, terms_snapshot, state, expected_guest_count,
    current_guest_count, final_guest_count, included_guest_count,
    approved_additional_guest_count, additional_guest_rate,
    allocated_guest_count, unallocated_guest_count,
    commercial_base_amount, commercial_gratuity_amount,
    commercial_vat_amount, commercial_additional_guest_amount,
    commercial_total_amount, quote_valid_until, hold_until, payment_due_at,
    created_by_staff_profile_id, updated_by_staff_profile_id
  ) values (
    v_booking.id, p_show_id, p_company_id, p_contact_customer_id, v_package.id,
    jsonb_build_object(
      'code', v_package.code, 'version', v_package.version,
      'displayName', v_package.display_name, 'currency', v_package.currency,
      'baseAmount', v_package.base_amount, 'gratuityAmount', v_package.gratuity_amount,
      'vatAmount', v_package.vat_amount, 'totalAmount', v_package.total_amount,
      'includedGuestCount', v_package.included_guest_count,
      'inclusions', v_package.inclusions, 'exclusions', v_package.exclusions
    ),
    coalesce(p_terms_snapshot, '{}'::jsonb) || jsonb_build_object('idempotencyKey', trim(p_idempotency_key)),
    'awaiting_payment', p_expected_guest_count, v_current_guest_count,
    p_final_guest_count, v_package.included_guest_count, v_additional_guests,
    case when v_additional_guests > 0 then p_additional_guest_rate else null end,
    0, v_current_guest_count, v_package.base_amount, v_package.gratuity_amount,
    v_package.vat_amount, v_additional_amount, v_total,
    p_quote_valid_until, p_hold_until, p_payment_due_at,
    p_actor_staff_profile_id, p_actor_staff_profile_id
  ) returning * into v_buyout;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, request_id, source_area, user_agent
  ) values (
    'corporate.buyout.created', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object(
      'booking_id', v_booking.id, 'booking_reference', v_reference,
      'show_id', p_show_id, 'company_id', p_company_id,
      'contact_customer_id', p_contact_customer_id,
      'package', v_buyout.package_snapshot, 'state', v_buyout.state,
      'expected_guest_count', p_expected_guest_count,
      'current_guest_count', v_current_guest_count,
      'final_guest_count', p_final_guest_count,
      'commercial_total_amount', v_total,
      'unallocated_guest_count', v_current_guest_count
    ), '{}',
    array['booking_id','show_id','company_id','package','state','guest_count','commercial_total_amount'],
    v_buyout.id::text, v_venue_key, v_reference, 'corporate_buyout',
    'success', 'Full Show Buyout created. Public booking is closed for this performance.',
    p_request_id, 'Corporate Bookings', p_user_agent
  );

  return jsonb_build_object(
    'idempotent', false, 'buyoutId', v_buyout.id,
    'bookingId', v_booking.id, 'bookingReference', v_reference,
    'state', v_buyout.state, 'totalAmount', v_total
  );
end;
$$;

create or replace function public.update_corporate_buyout_allocation_atomic(
  p_buyout_id uuid,
  p_expected_revision integer,
  p_zone_allocations jsonb,
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
set search_path = public
as $$
declare
  v_allocated integer;
  v_before public.corporate_buyouts%rowtype;
  v_booking public.bookings%rowtype;
  v_primary_zone text;
  v_zone record;
  v_zone_existing integer;
  v_zone_limit integer;
begin
  select * into v_before from public.corporate_buyouts where id = p_buyout_id for update;
  if not found or v_before.state in ('cancelled','released') then raise exception 'BUYOUT_NOT_ACTIVE'; end if;
  if v_before.revision <> p_expected_revision then raise exception 'BUYOUT_CHANGED'; end if;
  if not public.corporate_buyout_zone_allocations_valid(p_zone_allocations, v_before.current_guest_count) then
    raise exception 'BUYOUT_ZONE_ALLOCATION_INVALID';
  end if;

  select coalesce(sum((item ->> 'pax')::integer), 0)::integer
    into v_allocated from jsonb_array_elements(coalesce(p_zone_allocations, '[]'::jsonb)) item;

  for v_zone in
    select item ->> 'zoneId' as zone_id, (item ->> 'pax')::integer as pax
    from jsonb_array_elements(coalesce(p_zone_allocations, '[]'::jsonb)) item
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_before.show_id::text || ':' || v_zone.zone_id, 0));
    v_zone_limit := public.booking_capacity_zone_effective_limit(v_before.show_id, v_zone.zone_id);
    select coalesce(sum(public.booking_zone_entitlement_pax(
      b.zone_entitlements, b.section, b.guest_count, v_zone.zone_id
    )), 0)::integer into v_zone_existing
    from public.bookings b
    where b.show_id = v_before.show_id and b.id <> v_before.booking_id
      and b.archived_at is null
      and b.booking_status::text in ('new','confirmed','pending_payment','checked_in');
    if v_zone_limit is null or v_zone_existing + v_zone.pax > v_zone_limit then
      raise exception 'BUYOUT_ZONE_CAPACITY_EXCEEDED|%|%', v_zone.zone_id, v_zone_limit;
    end if;
  end loop;

  update public.corporate_buyouts set
    zone_allocations = coalesce(p_zone_allocations, '[]'::jsonb),
    allocated_guest_count = v_allocated,
    unallocated_guest_count = current_guest_count - v_allocated,
    revision = revision + 1,
    updated_by_staff_profile_id = p_actor_staff_profile_id,
    updated_at = now()
  where id = p_buyout_id;

  if v_allocated = v_before.current_guest_count then
    select item ->> 'zoneId' into v_primary_zone
    from jsonb_array_elements(p_zone_allocations) item limit 1;
    update public.bookings set
      section = case v_primary_zone
        when 'golden-circle' then 'Golden Circle'
        when 'middle-ring' then 'Middle Ring'
        when 'royal-booths' then 'Private Booths'
        when 'royal-balcony' then 'Royal Balcony'
      end,
      zone_entitlements = p_zone_allocations,
      updated_at = now()
    where id = v_before.booking_id returning * into v_booking;
  else
    update public.bookings set
      section = 'Full Show Buyout', zone_entitlements = null, updated_at = now()
    where id = v_before.booking_id returning * into v_booking;
  end if;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'corporate.buyout.zone-allocation-updated', p_actor_auth_user_id,
    coalesce(p_actor_location_scope,'{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('zone_allocations',p_zone_allocations,'allocated_guest_count',v_allocated,'unallocated_guest_count',v_before.current_guest_count-v_allocated),
    jsonb_build_object('zone_allocations',v_before.zone_allocations,'allocated_guest_count',v_before.allocated_guest_count,'unallocated_guest_count',v_before.unallocated_guest_count),
    array['zone_allocations','allocated_guest_count','unallocated_guest_count'],
    v_before.id::text, v_booking.booking_reference, 'corporate_buyout', 'success',
    'Full Show Buyout seating allocation updated.', p_request_id,
    'Corporate Bookings', p_user_agent
  );

  return jsonb_build_object('buyoutId',v_before.id,'bookingReference',v_booking.booking_reference,'revision',v_before.revision+1,'allocatedGuestCount',v_allocated,'unallocatedGuestCount',v_before.current_guest_count-v_allocated);
end;
$$;

create or replace function public.issue_corporate_buyout_tickets_atomic(
  p_buyout_id uuid,
  p_expected_revision integer,
  p_ticket_entitlement_count integer,
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
set search_path = public
as $$
declare
  v_before public.corporate_buyouts%rowtype;
  v_booking public.bookings%rowtype;
  v_created integer;
begin
  select * into v_before from public.corporate_buyouts where id = p_buyout_id for update;
  if not found or v_before.state in ('cancelled','released') then raise exception 'BUYOUT_NOT_ACTIVE'; end if;
  if v_before.revision <> p_expected_revision then raise exception 'BUYOUT_CHANGED'; end if;
  if p_ticket_entitlement_count < v_before.ticket_entitlement_count
     or p_ticket_entitlement_count > v_before.current_guest_count then
    raise exception 'BUYOUT_TICKET_ENTITLEMENT_INVALID';
  end if;
  select * into v_booking from public.bookings where id = v_before.booking_id for update;

  with expected as (
    select i, v_booking.booking_reference || '-' ||
      case when i < 100 then lpad(i::text,2,'0') else i::text end as code
    from generate_series(1,p_ticket_entitlement_count) i
  ), inserted as (
    insert into public.tickets (booking_id,ticket_code,ticket_url,qr_payload,ticket_status,issued_at)
    select v_booking.id, expected.code, '/ticket/' || expected.code,
      expected.code, 'valid', now()
    from expected
    where not exists (select 1 from public.tickets t where t.ticket_code = expected.code)
    returning id
  ) select count(*)::integer into v_created from inserted;

  update public.corporate_buyouts set
    ticket_entitlement_count = p_ticket_entitlement_count,
    revision = revision + 1,
    updated_by_staff_profile_id = p_actor_staff_profile_id,
    updated_at = now()
  where id = p_buyout_id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'corporate.buyout.ticket-entitlement-issued', p_actor_auth_user_id,
    coalesce(p_actor_location_scope,'{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('ticket_entitlement_count',p_ticket_entitlement_count,'created_count',v_created),
    jsonb_build_object('ticket_entitlement_count',v_before.ticket_entitlement_count),
    array['ticket_entitlement_count'], v_before.id::text,
    v_booking.booking_reference, 'corporate_buyout', 'success',
    'Full Show Buyout ticket entitlement issued.', p_request_id,
    'Corporate Bookings', p_user_agent
  );

  return jsonb_build_object('buyoutId',v_before.id,'bookingReference',v_booking.booking_reference,'createdCount',v_created,'ticketEntitlementCount',p_ticket_entitlement_count,'revision',v_before.revision+1);
end;
$$;

create or replace function public.release_corporate_buyout_atomic(
  p_buyout_id uuid,
  p_expected_revision integer,
  p_reason text,
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
set search_path = public
as $$
declare
  v_before public.corporate_buyouts%rowtype;
  v_booking public.bookings%rowtype;
  v_cancel_result jsonb;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'BUYOUT_RELEASE_REASON_REQUIRED'; end if;

  select * into v_before
  from public.corporate_buyouts
  where id = p_buyout_id
  for update;
  if not found or v_before.state in ('cancelled','released') then raise exception 'BUYOUT_NOT_ACTIVE'; end if;
  if v_before.revision <> p_expected_revision then raise exception 'BUYOUT_CHANGED'; end if;

  select * into v_booking
  from public.bookings
  where id = v_before.booking_id
  for update;
  if coalesce(v_booking.amount_paid, 0) > 0 then raise exception 'BUYOUT_RELEASE_PAYMENT_REVIEW_REQUIRED'; end if;
  if exists (
    select 1 from public.tickets
    where booking_id = v_booking.id and ticket_status::text = 'checked_in'
  ) then raise exception 'BUYOUT_RELEASE_CHECKIN_REVIEW_REQUIRED'; end if;

  v_cancel_result := public.cancel_booking_atomic(
    v_booking.booking_reference,
    v_booking.notes,
    trim(p_reason),
    clock_timestamp(),
    p_actor_staff_profile_id,
    p_actor_auth_user_id,
    p_actor_name,
    p_actor_role,
    p_actor_location_scope,
    p_request_id,
    p_user_agent
  );

  update public.corporate_buyouts set
    state = 'released',
    released_at = clock_timestamp(),
    released_by_staff_profile_id = p_actor_staff_profile_id,
    release_reason = trim(p_reason),
    revision = revision + 1,
    updated_by_staff_profile_id = p_actor_staff_profile_id,
    updated_at = clock_timestamp()
  where id = v_before.id;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_reference, entity_type, outcome, reason, request_id,
    source_area, user_agent
  ) values (
    'corporate.buyout.released', p_actor_auth_user_id,
    coalesce(p_actor_location_scope, '{}'::text[]), p_actor_name, p_actor_role,
    p_actor_staff_profile_id,
    jsonb_build_object('state','released','booking_status','cancelled'),
    jsonb_build_object('state',v_before.state,'booking_status',v_booking.booking_status),
    array['state','released_at','booking_status'], v_before.id::text,
    v_booking.booking_reference, 'corporate_buyout', 'success', trim(p_reason),
    p_request_id, 'Corporate Bookings', p_user_agent
  );

  return jsonb_build_object(
    'buyoutId',v_before.id,
    'bookingReference',v_booking.booking_reference,
    'state','released',
    'revision',v_before.revision+1,
    'bookingCancellation',v_cancel_result
  );
end;
$$;

create or replace function public.sync_corporate_buyout_payment_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_paid >= new.total_amount
     and new.total_amount > 0
     and new.balance_outstanding = 0
     and new.payment_status::text = 'fully_paid' then
    update public.corporate_buyouts set
      state = 'confirmed', revision = revision + 1, updated_at = now()
    where booking_id = new.id
      and state in ('provisional','awaiting_payment','fully_paid');
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_sync_corporate_buyout_payment_state on public.bookings;
create trigger bookings_sync_corporate_buyout_payment_state
  after update of amount_paid, balance_outstanding, payment_status on public.bookings
  for each row execute function public.sync_corporate_buyout_payment_state();

revoke all on function public.corporate_buyout_zone_allocations_valid(jsonb,integer) from public, anon, authenticated;
revoke all on function public.assert_show_has_no_active_buyout(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.enforce_public_buyout_guard() from public, anon, authenticated;
revoke all on function public.create_corporate_buyout_atomic(uuid,uuid,uuid,uuid,integer,integer,numeric,integer,timestamptz,timestamptz,timestamptz,jsonb,text,text,text[],uuid,uuid,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function public.update_corporate_buyout_allocation_atomic(uuid,integer,jsonb,uuid,uuid,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function public.issue_corporate_buyout_tickets_atomic(uuid,integer,integer,uuid,uuid,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function public.release_corporate_buyout_atomic(uuid,integer,text,uuid,uuid,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function public.sync_corporate_buyout_payment_state() from public, anon, authenticated;
grant execute on function public.create_corporate_buyout_atomic(uuid,uuid,uuid,uuid,integer,integer,numeric,integer,timestamptz,timestamptz,timestamptz,jsonb,text,text,text[],uuid,uuid,text,text,text[],text,text) to service_role;
grant execute on function public.update_corporate_buyout_allocation_atomic(uuid,integer,jsonb,uuid,uuid,text,text,text[],text,text) to service_role;
grant execute on function public.issue_corporate_buyout_tickets_atomic(uuid,integer,integer,uuid,uuid,text,text,text[],text,text) to service_role;
grant execute on function public.release_corporate_buyout_atomic(uuid,integer,text,uuid,uuid,text,text,text[],text,text) to service_role;

comment on table public.corporate_buyout_packages is
  'Versioned fixed-price Full Show Buyout packages. Existing bookings retain immutable package snapshots.';
comment on table public.corporate_buyouts is
  'One-to-one Corporate Full Show Buyout ownership and operational planning state.';

commit;
