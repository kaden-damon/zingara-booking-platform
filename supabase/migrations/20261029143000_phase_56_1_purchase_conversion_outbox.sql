create table if not exists public.advertising_attribution (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  journey_id text not null check (journey_id ~ '^journey_[A-Za-z0-9_-]{12,80}$'),
  analytics_consent boolean not null default false,
  marketing_consent boolean not null default false,
  consent_version integer not null check (consent_version > 0),
  consent_recorded_at timestamptz not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  fbc text,
  fbp text,
  gclid text,
  gbraid text,
  wbraid text,
  ga_client_id text,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  updated_at timestamptz not null default now()
);

create index if not exists advertising_attribution_journey_idx
  on public.advertising_attribution(journey_id);
create index if not exists advertising_attribution_expiry_idx
  on public.advertising_attribution(expires_at);

create table if not exists public.advertising_conversion_outbox (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  journey_id text,
  destination text not null check (destination in ('meta','ga4','google_ads')),
  event_name text not null default 'Purchase' check (event_name = 'Purchase'),
  event_id text not null,
  payment_type public.payment_type not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  occurred_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','processing','retry','succeeded','skipped','blocked')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts between 1 and 12),
  next_attempt_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  provider_response jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, destination),
  unique (destination, event_id)
);

create index if not exists advertising_conversion_outbox_queue_idx
  on public.advertising_conversion_outbox(destination,status,next_attempt_at,created_at);
create index if not exists advertising_conversion_outbox_booking_idx
  on public.advertising_conversion_outbox(booking_id,created_at);

alter table public.advertising_attribution enable row level security;
alter table public.advertising_conversion_outbox enable row level security;

revoke all on public.advertising_attribution,
  public.advertising_conversion_outbox
from public, anon, authenticated;

grant select, insert, update on public.advertising_attribution to service_role;
grant select, insert, update on public.advertising_conversion_outbox to service_role;

create or replace function public.enqueue_advertising_purchase_conversions(
  p_payment_id uuid,
  p_activations jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attribution public.advertising_attribution%rowtype;
  v_booking public.bookings%rowtype;
  v_inserted integer := 0;
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where id = p_payment_id;

  if v_payment.id is null
    or v_payment.method <> 'payfast'
    or v_payment.provider_transaction_id is null
    or v_payment.payment_status not in ('deposit_paid','fully_paid')
    or v_payment.payment_type not in ('deposit','balance','full_payment')
    or coalesce(v_payment.amount,0) <= 0
    or v_payment.processed_at is null then
    return 0;
  end if;

  select * into v_booking
  from public.bookings
  where id = v_payment.booking_id;

  if v_booking.id is null
    or v_booking.booking_source <> 'online'
    or v_booking.booking_origin <> 'customer_public'
    or v_booking.public_checkout_journey_id is null then
    return 0;
  end if;

  select * into v_attribution
  from public.advertising_attribution
  where journey_id = v_booking.public_checkout_journey_id
    and booking_id = v_booking.id
    and expires_at > now();

  if v_attribution.journey_id is null then
    return 0;
  end if;

  if v_attribution.analytics_consent
    and p_activations ? 'ga4'
    and v_payment.processed_at >= (p_activations ->> 'ga4')::timestamptz then
    insert into public.advertising_conversion_outbox(
      payment_id,booking_id,journey_id,destination,event_id,payment_type,
      amount,occurred_at
    ) values (
      v_payment.id,v_booking.id,v_attribution.journey_id,'ga4',
      'pay_' || replace(v_payment.id::text,'-',''),v_payment.payment_type,
      round(v_payment.amount,2),v_payment.processed_at
    ) on conflict (payment_id,destination) do nothing;
    get diagnostics v_inserted = row_count;
  end if;

  if v_attribution.marketing_consent
    and p_activations ? 'meta'
    and v_payment.processed_at >= (p_activations ->> 'meta')::timestamptz then
    insert into public.advertising_conversion_outbox(
      payment_id,booking_id,journey_id,destination,event_id,payment_type,
      amount,occurred_at
    ) values (
      v_payment.id,v_booking.id,v_attribution.journey_id,'meta',
      'pay_' || replace(v_payment.id::text,'-',''),v_payment.payment_type,
      round(v_payment.amount,2),v_payment.processed_at
    ) on conflict (payment_id,destination) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end if;

  if v_attribution.marketing_consent
    and p_activations ? 'google_ads'
    and v_payment.processed_at >= (p_activations ->> 'google_ads')::timestamptz
    and coalesce(v_attribution.gclid,v_attribution.gbraid,v_attribution.wbraid) is not null then
    insert into public.advertising_conversion_outbox(
      payment_id,booking_id,journey_id,destination,event_id,payment_type,
      amount,occurred_at
    ) values (
      v_payment.id,v_booking.id,v_attribution.journey_id,'google_ads',
      'pay_' || replace(v_payment.id::text,'-',''),v_payment.payment_type,
      round(v_payment.amount,2),v_payment.processed_at
    ) on conflict (payment_id,destination) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end if;

  return v_inserted;
end;
$$;

create or replace function public.enqueue_recent_advertising_purchase_conversions(
  p_activations jsonb,
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_payment_id uuid;
begin
  for v_payment_id in
    select p.id
    from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.advertising_attribution a
      on a.journey_id = b.public_checkout_journey_id and a.booking_id = b.id
    where p.method = 'payfast'
      and p.provider_transaction_id is not null
      and p.payment_status in ('deposit_paid','fully_paid')
      and p.payment_type in ('deposit','balance','full_payment')
      and p.amount > 0
      and b.booking_source = 'online'
      and b.booking_origin = 'customer_public'
      and a.expires_at > now()
      and (
        (a.analytics_consent and p_activations ? 'ga4'
          and p.processed_at >= (p_activations ->> 'ga4')::timestamptz
          and not exists (select 1 from public.advertising_conversion_outbox o where o.payment_id=p.id and o.destination='ga4'))
        or (a.marketing_consent and p_activations ? 'meta'
          and p.processed_at >= (p_activations ->> 'meta')::timestamptz
          and not exists (select 1 from public.advertising_conversion_outbox o where o.payment_id=p.id and o.destination='meta'))
        or (a.marketing_consent and p_activations ? 'google_ads'
          and coalesce(a.gclid,a.gbraid,a.wbraid) is not null
          and p.processed_at >= (p_activations ->> 'google_ads')::timestamptz
          and not exists (select 1 from public.advertising_conversion_outbox o where o.payment_id=p.id and o.destination='google_ads'))
      )
    order by p.processed_at,p.id
    limit least(greatest(p_limit,1),100)
  loop
    perform public.enqueue_advertising_purchase_conversions(v_payment_id,p_activations);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.claim_advertising_conversion_outbox(
  p_worker_id text,
  p_destinations text[],
  p_limit integer default 10,
  p_lease_seconds integer default 90
)
returns setof public.advertising_conversion_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.advertising_conversion_outbox o
  set status='skipped',
      last_error='Consent attribution expired before delivery.',
      next_attempt_at=null,
      lease_owner=null,
      lease_expires_at=null,
      updated_at=now()
  where o.status in ('pending','retry')
    and exists (
      select 1 from public.advertising_attribution a
      where a.booking_id=o.booking_id and a.expires_at <= now()
    );

  return query
  with candidates as (
    select o.id
    from public.advertising_conversion_outbox o
    join public.advertising_attribution a on a.booking_id=o.booking_id
    where o.destination = any(p_destinations)
      and o.status in ('pending','retry')
      and a.expires_at > now()
      and coalesce(o.next_attempt_at,now()) <= now()
      and (o.lease_expires_at is null or o.lease_expires_at < now())
      and o.attempt_count < o.max_attempts
    order by o.created_at,o.id
    for update skip locked
    limit least(greatest(p_limit,1),25)
  )
  update public.advertising_conversion_outbox o
  set status='processing',
      lease_owner=p_worker_id,
      lease_expires_at=now()+make_interval(secs=>least(greatest(p_lease_seconds,30),300)),
      attempt_count=o.attempt_count+1,
      updated_at=now()
  from candidates c
  where o.id=c.id
  returning o.*;
end;
$$;

create or replace function public.complete_advertising_conversion_outbox(
  p_outbox_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_provider_response jsonb default null,
  p_error text default null,
  p_retryable boolean default true
)
returns public.advertising_conversion_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.advertising_conversion_outbox%rowtype;
begin
  select * into v_item
  from public.advertising_conversion_outbox
  where id=p_outbox_id and status='processing' and lease_owner=p_worker_id
  for update;

  if v_item.id is null then
    raise exception 'Conversion outbox lease is no longer valid';
  end if;

  update public.advertising_conversion_outbox
  set status=case
        when p_succeeded then 'succeeded'
        when p_retryable and attempt_count < max_attempts then 'retry'
        else 'blocked'
      end,
      delivered_at=case when p_succeeded then now() else delivered_at end,
      provider_response=case when p_succeeded then coalesce(p_provider_response,'{}'::jsonb) else provider_response end,
      last_error=case when p_succeeded then null else left(coalesce(p_error,'Provider delivery failed'),1000) end,
      next_attempt_at=case
        when p_succeeded or not p_retryable or attempt_count >= max_attempts then null
        else now()+least(interval '6 hours',make_interval(secs=>60*power(2,least(attempt_count,8))::integer))
      end,
      lease_owner=null,
      lease_expires_at=null,
      updated_at=now()
  where id=v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.enqueue_advertising_purchase_conversions(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.enqueue_recent_advertising_purchase_conversions(jsonb,integer) from public, anon, authenticated;
revoke all on function public.claim_advertising_conversion_outbox(text,text[],integer,integer) from public, anon, authenticated;
revoke all on function public.complete_advertising_conversion_outbox(uuid,text,boolean,jsonb,text,boolean) from public, anon, authenticated;
grant execute on function public.enqueue_advertising_purchase_conversions(uuid,jsonb) to service_role;
grant execute on function public.enqueue_recent_advertising_purchase_conversions(jsonb,integer) to service_role;
grant execute on function public.claim_advertising_conversion_outbox(text,text[],integer,integer) to service_role;
grant execute on function public.complete_advertising_conversion_outbox(uuid,text,boolean,jsonb,text,boolean) to service_role;

comment on table public.advertising_attribution is
  'Consent-scoped, minimised campaign attribution retained for future verified public payments.';
comment on table public.advertising_conversion_outbox is
  'Durable destination-level Purchase delivery for verified PayFast payments after explicit provider activation.';
comment on function public.enqueue_advertising_purchase_conversions(uuid,jsonb) is
  'Idempotently creates destination work for one authoritative verified PayFast payment after explicit provider activation.';
