create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null,
  active boolean not null default true,
  valid_from timestamptz null,
  valid_until timestamptz null,
  usage_limit integer null check (usage_limit is null or usage_limit > 0),
  location text null check (location is null or location in ('cape-town', 'johannesburg')),
  show_id uuid null references public.shows(id) on delete set null,
  created_by uuid null references public.staff_profiles(id) on delete set null,
  updated_by uuid null references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (discount_type = 'percentage' and discount_value > 0 and discount_value <= 100)
    or
    (discount_type = 'fixed' and discount_value > 0)
  )
);

create unique index if not exists promo_codes_code_upper_idx
  on public.promo_codes (upper(code));

create index if not exists promo_codes_active_idx
  on public.promo_codes (active, valid_from, valid_until);

create index if not exists promo_codes_scope_idx
  on public.promo_codes (location, show_id);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_reference text not null,
  customer_id uuid null references public.customers(id) on delete set null,
  show_id uuid null references public.shows(id) on delete set null,
  discount_amount numeric(10, 2) not null default 0,
  subtotal_amount numeric(10, 2) not null default 0,
  location text null,
  redeemed_at timestamptz not null default now(),
  unique (booking_id),
  unique (promo_code_id, booking_id)
);

create index if not exists promo_redemptions_promo_code_id_idx
  on public.promo_redemptions (promo_code_id, redeemed_at desc);

create index if not exists promo_redemptions_booking_reference_idx
  on public.promo_redemptions (booking_reference);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

revoke all on public.promo_codes from anon, authenticated;
revoke all on public.promo_redemptions from anon, authenticated;
grant select, insert, update on public.promo_codes to service_role;
grant select, insert on public.promo_redemptions to service_role;

create or replace function public.set_promo_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.code = upper(trim(new.code));
  return new;
end;
$$;

drop trigger if exists promo_codes_set_updated_at on public.promo_codes;
create trigger promo_codes_set_updated_at
  before insert or update on public.promo_codes
  for each row
  execute function public.set_promo_codes_updated_at();

insert into public.promo_codes (
  code,
  name,
  discount_type,
  discount_value,
  active
)
values
  ('COUNTESS10', '10% Royal Countess guest saving', 'percentage', 10, true),
  ('ROYAL500', 'R500 private table credit', 'fixed', 500, true),
  ('STAGE15', '15% elevated stage celebration rate', 'percentage', 15, true)
on conflict do nothing;

update public.promo_codes
   set name = case upper(code)
       when 'COUNTESS10' then '10% Royal Countess guest saving'
       when 'ROYAL500' then 'R500 private table credit'
       when 'STAGE15' then '15% elevated stage celebration rate'
       else name
     end,
     discount_type = case upper(code)
       when 'COUNTESS10' then 'percentage'
       when 'ROYAL500' then 'fixed'
       when 'STAGE15' then 'percentage'
       else discount_type
     end,
     discount_value = case upper(code)
       when 'COUNTESS10' then 10
       when 'ROYAL500' then 500
       when 'STAGE15' then 15
       else discount_value
     end,
     active = true
 where upper(code) in ('COUNTESS10', 'ROYAL500', 'STAGE15');

create or replace function public.reserve_public_booking_table(
  p_show_id uuid,
  p_booking_payload jsonb,
  p_payment_payload jsonb,
  p_table_claims jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_claim jsonb;
  v_claimed_table_ids uuid[] := '{}';
  v_claim_count integer := 0;
  v_conflicting_table public.show_tables%rowtype;
  v_existing_booking public.bookings%rowtype;
  v_payment_id uuid;
  v_primary_table public.show_tables%rowtype;
  v_promo public.promo_codes%rowtype;
  v_promo_code_id uuid;
  v_promo_redemption_count integer := 0;
  v_table public.show_tables%rowtype;
  v_table_code text;
begin
  if p_show_id is null then
    raise exception 'show_id is required';
  end if;

  if coalesce(jsonb_array_length(p_table_claims), 0) = 0 then
    raise exception 'at least one table claim is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_payload ->> 'booking_reference'));

  select *
    into v_existing_booking
    from public.bookings
   where booking_reference = p_booking_payload ->> 'booking_reference'
   limit 1;

  if v_existing_booking.id is not null then
    select id
      into v_payment_id
      from public.payments
     where booking_id = v_existing_booking.id
     limit 1;

    return jsonb_build_object(
      'status', 'already_exists',
      'booking_id', v_existing_booking.id,
      'payment_id', v_payment_id,
      'table_id', v_existing_booking.table_id
    );
  end if;

  v_promo_code_id := nullif(p_booking_payload ->> 'promo_code_id', '')::uuid;

  if v_promo_code_id is not null then
    select *
      into v_promo
      from public.promo_codes
     where id = v_promo_code_id
     for update;

    if v_promo.id is null or not v_promo.active then
      raise exception 'promo code is no longer active';
    end if;

    if v_promo.valid_from is not null and v_promo.valid_from > now() then
      raise exception 'promo code is not active yet';
    end if;

    if v_promo.valid_until is not null and v_promo.valid_until < now() then
      raise exception 'promo code has expired';
    end if;

    if v_promo.location is not null and v_promo.location <> nullif(p_booking_payload ->> 'promo_location', '') then
      raise exception 'promo code is not available for this location';
    end if;

    if v_promo.show_id is not null and v_promo.show_id <> p_show_id then
      raise exception 'promo code is not available for this show';
    end if;

    select count(*)::integer
      into v_promo_redemption_count
      from public.promo_redemptions
     where promo_code_id = v_promo_code_id;

    if v_promo.usage_limit is not null and v_promo_redemption_count >= v_promo.usage_limit then
      raise exception 'promo code usage limit has been reached';
    end if;
  end if;

  for v_claim in
    select value
      from jsonb_array_elements(p_table_claims)
  loop
    v_table_code := nullif(trim(v_claim ->> 'table_code'), '');

    if v_table_code is null then
      raise exception 'table_code is required for every claim';
    end if;

    insert into public.show_tables (
      show_id,
      table_code,
      section,
      capacity,
      status,
      is_override,
      override_notes
    )
    values (
      p_show_id,
      v_table_code,
      coalesce(nullif(trim(v_claim ->> 'section'), ''), p_booking_payload ->> 'section', 'Unassigned'),
      greatest(coalesce((v_claim ->> 'capacity')::integer, (p_booking_payload ->> 'guest_count')::integer, 1), 1),
      'available',
      true,
      'Created by public booking reservation claim'
    )
    on conflict (show_id, table_code) do nothing;
  end loop;

  for v_table in
    select st.*
      from public.show_tables st
      join jsonb_array_elements(p_table_claims) claim
        on st.table_code = claim.value ->> 'table_code'
     where st.show_id = p_show_id
     order by st.table_code
     for update of st
  loop
    v_claim_count := v_claim_count + 1;

    if v_table.booking_id is not null or v_table.status <> 'available' then
      v_conflicting_table := v_table;
    end if;

    if v_primary_table.id is null then
      v_primary_table := v_table;
    end if;

    v_claimed_table_ids := array_append(v_claimed_table_ids, v_table.id);
  end loop;

  if v_claim_count <> jsonb_array_length(p_table_claims) then
    raise exception 'one or more table claims could not be resolved';
  end if;

  if v_conflicting_table.id is not null then
    return jsonb_build_object(
      'status', 'conflict',
      'table_id', v_conflicting_table.id,
      'table_code', v_conflicting_table.table_code
    );
  end if;

  insert into public.bookings (
    addons_total,
    amount_paid,
    balance_outstanding,
    booking_reference,
    booking_source,
    booking_status,
    company_name,
    customer_id,
    dietary_requirements,
    discount_amount,
    guest_count,
    notes,
    payment_status,
    section,
    service_fee,
    show_id,
    subtotal_amount,
    table_id,
    total_amount
  )
  values (
    coalesce((p_booking_payload ->> 'addons_total')::numeric, 0),
    coalesce((p_booking_payload ->> 'amount_paid')::numeric, 0),
    coalesce((p_booking_payload ->> 'balance_outstanding')::numeric, 0),
    p_booking_payload ->> 'booking_reference',
    coalesce(p_booking_payload ->> 'booking_source', 'online'),
    coalesce(p_booking_payload ->> 'booking_status', 'pending_payment')::public.booking_status,
    nullif(p_booking_payload ->> 'company_name', ''),
    (p_booking_payload ->> 'customer_id')::uuid,
    nullif(p_booking_payload ->> 'dietary_requirements', ''),
    coalesce((p_booking_payload ->> 'discount_amount')::numeric, 0),
    greatest((p_booking_payload ->> 'guest_count')::integer, 1),
    p_booking_payload ->> 'notes',
    coalesce(p_booking_payload ->> 'payment_status', 'pending_payment')::public.payment_status,
    nullif(p_booking_payload ->> 'section', ''),
    coalesce((p_booking_payload ->> 'service_fee')::numeric, 0),
    p_show_id,
    coalesce((p_booking_payload ->> 'subtotal_amount')::numeric, 0),
    v_primary_table.id,
    coalesce((p_booking_payload ->> 'total_amount')::numeric, 0)
  )
  returning id into v_booking_id;

  if v_promo_code_id is not null then
    insert into public.promo_redemptions (
      promo_code_id,
      booking_id,
      booking_reference,
      customer_id,
      show_id,
      discount_amount,
      subtotal_amount,
      location
    )
    values (
      v_promo_code_id,
      v_booking_id,
      p_booking_payload ->> 'booking_reference',
      (p_booking_payload ->> 'customer_id')::uuid,
      p_show_id,
      coalesce((p_booking_payload ->> 'discount_amount')::numeric, 0),
      coalesce((p_booking_payload ->> 'subtotal_amount')::numeric, 0),
      nullif(p_booking_payload ->> 'promo_location', '')
    );
  end if;

  update public.show_tables
     set booking_id = v_booking_id,
         status = 'booked',
         updated_at = now()
   where id = any(v_claimed_table_ids)
     and booking_id is null
     and status = 'available';

  if not found then
    raise exception 'table claim failed after booking insert';
  end if;

  insert into public.payments (
    amount,
    booking_id,
    method,
    notes,
    payment_status,
    payment_type,
    processed_at,
    reference
  )
  values (
    coalesce((p_payment_payload ->> 'amount')::numeric, 0),
    v_booking_id,
    nullif(p_payment_payload ->> 'method', ''),
    nullif(p_payment_payload ->> 'notes', ''),
    coalesce(p_payment_payload ->> 'payment_status', 'pending_payment')::public.payment_status,
    coalesce(p_payment_payload ->> 'payment_type', 'deposit')::public.payment_type,
    coalesce((p_payment_payload ->> 'processed_at')::timestamptz, now()),
    nullif(p_payment_payload ->> 'reference', '')
  )
  returning id into v_payment_id;

  return jsonb_build_object(
    'status', 'success',
    'booking_id', v_booking_id,
    'payment_id', v_payment_id,
    'table_id', v_primary_table.id,
    'claimed_table_ids', to_jsonb(v_claimed_table_ids)
  );
end;
$$;

grant execute on function public.reserve_public_booking_table(uuid, jsonb, jsonb, jsonb) to service_role;
