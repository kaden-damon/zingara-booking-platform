begin;

alter table public.show_pricing_configurations
  add column if not exists payment_policy text not null default 'standard';

alter table public.show_pricing_configurations
  drop constraint if exists show_pricing_configurations_payment_policy_check;
alter table public.show_pricing_configurations
  add constraint show_pricing_configurations_payment_policy_check
  check (payment_policy in ('standard', 'full-payment-only'));

alter table public.bookings
  add column if not exists payment_policy_snapshot text;

alter table public.bookings
  drop constraint if exists bookings_payment_policy_snapshot_check;
alter table public.bookings
  add constraint bookings_payment_policy_snapshot_check
  check (
    payment_policy_snapshot is null
    or payment_policy_snapshot = 'full-payment-only'
  );

create or replace function public.set_show_custom_pricing_and_payment_policy_atomic(
  p_show_id uuid,
  p_enabled boolean,
  p_zone_prices jsonb,
  p_payment_policy text,
  p_expected_updated_at timestamptz default null,
  p_actor jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_staff public.staff_profiles%rowtype;
  v_before public.show_pricing_configurations%rowtype;
  v_after public.show_pricing_configurations%rowtype;
  v_prices jsonb := coalesce(p_zone_prices, '{}'::jsonb);
  v_show public.shows%rowtype;
begin
  select * into v_show from public.shows where id = p_show_id;
  if not found then raise exception 'SHOW_NOT_FOUND'; end if;

  select staff.* into v_actor_staff
  from public.staff_profiles staff
  where staff.id = nullif(p_actor ->> 'staffProfileId', '')::uuid
    and staff.active = true
    and exists (
      select 1
      from public.role_permissions role_permission
      join public.permissions permission on permission.id = role_permission.permission_id
      where role_permission.role_id = staff.role_id
        and permission.key = 'settings:manage'
    );
  if not found then raise exception 'SHOW_PRICING_PERMISSION_REQUIRED'; end if;

  if p_payment_policy not in ('standard', 'full-payment-only') then
    raise exception 'INVALID_PAYMENT_POLICY';
  end if;
  if jsonb_typeof(v_prices) <> 'object' then
    raise exception 'INVALID_SHOW_PRICING';
  end if;
  if exists (
    select 1
    from jsonb_each(v_prices) as entry(zone_id, price)
    where entry.zone_id not in (
      'golden-circle', 'middle-ring', 'royal-balcony', 'royal-booths'
    )
    or jsonb_typeof(entry.price) <> 'number'
    or (entry.price #>> '{}')::numeric <= 0
    or (entry.price #>> '{}')::numeric > 1000000
  ) then
    raise exception 'INVALID_SHOW_PRICING';
  end if;
  if p_enabled and v_prices = '{}'::jsonb then
    raise exception 'CUSTOM_PRICING_REQUIRES_A_PRICE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('show-pricing:' || p_show_id::text, 0));
  select * into v_before
  from public.show_pricing_configurations
  where show_id = p_show_id
  for update;

  if found and v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'STALE_SHOW_PRICING_STATE';
  elsif not found and p_expected_updated_at is not null then
    raise exception 'STALE_SHOW_PRICING_STATE';
  end if;

  if found
    and v_before.enabled = p_enabled
    and v_before.zone_prices = v_prices
    and v_before.payment_policy = p_payment_policy
  then
    return jsonb_build_object(
      'enabled', v_before.enabled,
      'paymentPolicy', v_before.payment_policy,
      'updatedAt', v_before.updated_at,
      'zonePrices', v_before.zone_prices
    );
  end if;

  insert into public.show_pricing_configurations (
    show_id, enabled, zone_prices, payment_policy,
    changed_by_staff_id, changed_by_name, updated_at
  ) values (
    p_show_id, p_enabled, v_prices, p_payment_policy,
    v_actor_staff.id, v_actor_staff.full_name, now()
  )
  on conflict (show_id) do update set
    enabled = excluded.enabled,
    zone_prices = excluded.zone_prices,
    payment_policy = excluded.payment_policy,
    changed_by_staff_id = excluded.changed_by_staff_id,
    changed_by_name = excluded.changed_by_name,
    updated_at = excluded.updated_at
  returning * into v_after;

  insert into public.audit_events (
    action, actor_auth_user_id, actor_location_scope, actor_name, actor_role,
    actor_staff_profile_id, after_values, before_values, changed_fields,
    entity_id, entity_location, entity_reference, entity_type, outcome,
    reason, source_area
  ) values (
    'show.commercial-policy-updated',
    nullif(p_actor ->> 'authUserId', '')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_actor -> 'locationScope', '[]'::jsonb))), '{}'::text[]),
    v_actor_staff.full_name,
    coalesce(nullif(p_actor ->> 'role', ''), 'Staff'),
    v_actor_staff.id,
    jsonb_build_object('custom_pricing_enabled', v_after.enabled, 'zone_prices', v_after.zone_prices, 'payment_policy', v_after.payment_policy),
    jsonb_build_object('custom_pricing_enabled', coalesce(v_before.enabled, false), 'zone_prices', coalesce(v_before.zone_prices, '{}'::jsonb), 'payment_policy', coalesce(v_before.payment_policy, 'standard')),
    array['custom_pricing_enabled', 'zone_prices', 'payment_policy'],
    p_show_id,
    v_show.venue,
    p_show_id::text,
    'show',
    'success',
    'Performance-specific pricing and payment policy updated; existing booking agreements remain unchanged.',
    'Shows'
  );

  return jsonb_build_object(
    'enabled', v_after.enabled,
    'paymentPolicy', v_after.payment_policy,
    'updatedAt', v_after.updated_at,
    'zonePrices', v_after.zone_prices
  );
end;
$$;

revoke all on function public.set_show_custom_pricing_and_payment_policy_atomic(
  uuid, boolean, jsonb, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.set_show_custom_pricing_and_payment_policy_atomic(
  uuid, boolean, jsonb, text, timestamptz, jsonb
) to service_role;

create or replace function public.enforce_performance_payment_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_policy text;
  v_requires_validation boolean := false;
begin
  select configuration.payment_policy
    into v_policy
    from public.show_pricing_configurations configuration
   where configuration.show_id = new.show_id;

  if coalesce(v_policy, 'standard') <> 'full-payment-only' then
    return new;
  end if;

  if new.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata := substring(new.notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    exception when others then
      v_metadata := null;
    end;
  end if;

  if tg_op = 'INSERT' or new.show_id is distinct from old.show_id then
    v_requires_validation := true;
  elsif old.payment_policy_snapshot = 'full-payment-only' then
    v_requires_validation := true;
  elsif new.guest_count > old.guest_count then
    if coalesce(v_metadata #>> '{pricingProvenance,paymentModel}', v_metadata ->> 'paymentOption', '') <> 'full'
       and coalesce(v_metadata ->> 'commercialModel', '') <> 'fixed-buyout-package' then
      raise exception 'FULL_PAYMENT_POLICY_AMENDMENT_REQUIRED';
    end if;
    v_requires_validation := true;
  end if;

  if not v_requires_validation then
    return new;
  end if;

  if coalesce(new.total_amount, 0) <= 0
     or new.payment_status::text = 'comp_vip'
     or (
       coalesce(v_metadata ->> 'paymentOption', 'full') = 'deposit'
       and not (
         tg_op = 'UPDATE'
         and new.show_id is distinct from old.show_id
         and new.payment_status::text = 'fully_paid'
         and coalesce(new.amount_paid, 0) >= coalesce(new.total_amount, 0)
         and coalesce(new.balance_outstanding, 0) = 0
       )
     ) then
    raise exception 'FULL_PAYMENT_ONLY';
  end if;

  if (tg_op = 'INSERT' or new.show_id is distinct from old.show_id)
     and coalesce(new.amount_paid, 0) > 0
     and coalesce(new.amount_paid, 0) < coalesce(new.total_amount, 0) then
    raise exception 'FULL_PAYMENT_ONLY';
  end if;

  if new.payment_status::text = 'fully_paid'
     and (
       coalesce(new.amount_paid, 0) < coalesce(new.total_amount, 0)
       or coalesce(new.balance_outstanding, 0) <> 0
     ) then
    raise exception 'FULL_PAYMENT_VERIFICATION_REQUIRED';
  end if;

  if old.payment_policy_snapshot = 'full-payment-only'
     and tg_op = 'UPDATE'
     and new.guest_count = old.guest_count
     and new.payment_status::text = 'deposit_paid' then
    raise exception 'FULL_PAYMENT_ONLY';
  end if;

  new.payment_policy_snapshot := 'full-payment-only';
  return new;
end;
$$;

drop trigger if exists bookings_performance_payment_policy_guard on public.bookings;
create trigger bookings_performance_payment_policy_guard
  before insert or update of
    show_id, guest_count, total_amount, amount_paid, balance_outstanding,
    payment_status, notes
  on public.bookings
  for each row execute function public.enforce_performance_payment_policy();

create or replace function public.enforce_full_payment_ticket_issuance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_was_usable boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_was_usable := old.ticket_status::text in ('issued', 'valid', 'checked_in');
  end if;

  if new.ticket_status::text not in ('issued', 'valid', 'checked_in') or v_was_usable then
    return new;
  end if;

  select * into v_booking from public.bookings where id = new.booking_id;
  if v_booking.payment_policy_snapshot = 'full-payment-only'
     and (
       v_booking.payment_status::text <> 'fully_paid'
       or coalesce(v_booking.amount_paid, 0) < coalesce(v_booking.total_amount, 0)
       or coalesce(v_booking.balance_outstanding, 0) <> 0
     ) then
    raise exception 'FULL_PAYMENT_REQUIRED_BEFORE_TICKET_ISSUANCE';
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_full_payment_policy_guard on public.tickets;
create trigger tickets_full_payment_policy_guard
  before insert or update of ticket_status on public.tickets
  for each row execute function public.enforce_full_payment_ticket_issuance();

insert into public.show_pricing_configurations (
  show_id, enabled, zone_prices, payment_policy, changed_by_name, updated_at
)
select
  show.id,
  coalesce(configuration.enabled, false),
  coalesce(configuration.zone_prices, '{}'::jsonb),
  'full-payment-only',
  'P0 NYE full payment release',
  now()
from public.shows show
left join public.show_pricing_configurations configuration
  on configuration.show_id = show.id
where show.date = date '2026-12-31'
  and show.venue in ('cape-town', 'johannesburg')
on conflict (show_id) do update set
  payment_policy = excluded.payment_policy,
  changed_by_name = excluded.changed_by_name,
  updated_at = excluded.updated_at;

insert into public.audit_events (
  action, actor_location_scope, actor_name, actor_role, after_values,
  before_values, changed_fields, entity_id, entity_location,
  entity_reference, entity_type, outcome, reason, source_area
)
select
  'show.payment-policy-activated',
  '{}'::text[],
  'P0 Production release',
  'System',
  jsonb_build_object('payment_policy', 'full-payment-only'),
  jsonb_build_object('payment_policy', 'standard'),
  array['payment_policy'],
  show.id,
  show.venue,
  show.id::text,
  'show',
  'success',
  'Full Payment Only activated for the 31 December 2026 performance. Existing booking agreements remain grandfathered.',
  'Shows'
from public.shows show
where show.date = date '2026-12-31'
  and show.venue in ('cape-town', 'johannesburg');

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.shows show
  join public.show_pricing_configurations configuration
    on configuration.show_id = show.id
  where show.date = date '2026-12-31'
    and show.venue in ('cape-town', 'johannesburg')
    and configuration.payment_policy = 'full-payment-only';

  if v_count <> 2 then
    raise exception 'NYE_PAYMENT_POLICY_SHOW_COUNT_INVALID|%', v_count;
  end if;
end;
$$;

comment on column public.show_pricing_configurations.payment_policy is
  'Performance-specific payment terms for future booking agreements.';
comment on column public.bookings.payment_policy_snapshot is
  'Immutable commercial policy snapshot for bookings created or transferred under Full Payment Only.';

commit;
