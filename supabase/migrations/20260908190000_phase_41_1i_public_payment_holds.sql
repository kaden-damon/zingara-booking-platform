-- Phase 41.1I: bounded public checkout holds and audited capacity release.

alter table public.bookings
  add column if not exists public_checkout_journey_id text,
  add column if not exists public_checkout_expires_at timestamptz,
  add column if not exists public_checkout_expired_at timestamptz,
  add column if not exists public_checkout_superseded_by uuid references public.bookings(id);

create index if not exists bookings_public_checkout_expiry_idx
  on public.bookings (public_checkout_expires_at)
  where public_checkout_expires_at is not null
    and public_checkout_expired_at is null;

create index if not exists bookings_public_checkout_journey_idx
  on public.bookings (public_checkout_journey_id, show_id)
  where public_checkout_journey_id is not null;

create or replace function public.public_checkout_journey_from_notes(p_notes text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_metadata jsonb;
begin
  if p_notes is null or p_notes not like '__zingara_booking_meta__:%' then
    return null;
  end if;

  begin
    v_metadata := substring(p_notes from length('__zingara_booking_meta__:') + 1)::jsonb;
    return nullif(trim(v_metadata ->> 'journeyId'), '');
  exception when others then
    return null;
  end;
end
$$;

create or replace function public.set_public_checkout_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata_origin text;
begin
  if new.notes like '__zingara_booking_meta__:%' then
    begin
      v_metadata_origin := substring(new.notes from length('__zingara_booking_meta__:') + 1)::jsonb ->> 'bookingOrigin';
    exception when others then
      v_metadata_origin := null;
    end;
  end if;

  if new.booking_source = 'online'
     and coalesce(new.booking_origin, v_metadata_origin) = 'customer_public'
     and new.booking_status = 'pending_payment'
     and new.payment_status = 'pending_payment'
     and coalesce(new.amount_paid, 0) = 0 then
    new.public_checkout_journey_id := coalesce(
      new.public_checkout_journey_id,
      public.public_checkout_journey_from_notes(new.notes)
    );
    new.public_checkout_expires_at := coalesce(
      new.public_checkout_expires_at,
      coalesce(new.created_at, now()) + interval '30 minutes'
    );
  end if;

  return new;
end
$$;

drop trigger if exists bookings_set_public_checkout_hold on public.bookings;
create trigger bookings_set_public_checkout_hold
  before insert on public.bookings
  for each row execute function public.set_public_checkout_hold();

create or replace function public.expire_public_booking_hold(
  p_booking_id uuid,
  p_reason text default 'expired',
  p_superseded_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_now timestamptz := clock_timestamp();
  v_released integer := 0;
begin
  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if v_booking.id is null then
    return jsonb_build_object('expired', false, 'reason', 'missing');
  end if;

  if v_booking.public_checkout_expired_at is not null
     or v_booking.archived_at is not null
     or v_booking.booking_status = 'cancelled' then
    return jsonb_build_object('expired', false, 'idempotent', true);
  end if;

  if v_booking.booking_source <> 'online'
     or v_booking.booking_origin <> 'customer_public'
     or v_booking.booking_status <> 'pending_payment'
     or v_booking.payment_status <> 'pending_payment'
     or coalesce(v_booking.amount_paid, 0) <> 0 then
    return jsonb_build_object('expired', false, 'protected', true);
  end if;

  if exists (
    select 1 from public.payments p
     where p.booking_id = v_booking.id
       and (
         nullif(trim(p.provider_transaction_id), '') is not null
         or p.payment_status in ('deposit_paid', 'fully_paid')
       )
  ) or exists (
    select 1 from public.tickets t where t.booking_id = v_booking.id
  ) or exists (
    select 1 from public.communications c where c.booking_id = v_booking.id
  ) then
    return jsonb_build_object('expired', false, 'protected', true);
  end if;

  if p_reason = 'expired'
     and (v_booking.public_checkout_expires_at is null
       or v_booking.public_checkout_expires_at > v_now) then
    return jsonb_build_object('expired', false, 'active', true);
  end if;

  if p_superseded_by is not null and not exists (
    select 1
      from public.bookings successor
     where successor.id = p_superseded_by
       and successor.id <> v_booking.id
       and successor.booking_source = 'online'
       and successor.booking_origin = 'customer_public'
       and successor.show_id = v_booking.show_id
       and successor.customer_id = v_booking.customer_id
       and successor.guest_count = v_booking.guest_count
       and successor.section is not distinct from v_booking.section
       and successor.public_checkout_journey_id = v_booking.public_checkout_journey_id
       and successor.booking_status in ('confirmed', 'checked_in', 'completed')
       and coalesce(successor.amount_paid, 0) > 0
  ) then
    return jsonb_build_object('expired', false, 'protected', true);
  end if;

  update public.show_tables
     set booking_id = null,
         status = 'available',
         updated_at = v_now
   where booking_id = v_booking.id;
  get diagnostics v_released = row_count;

  update public.bookings
     set archived_at = v_now,
         archive_reason = case
           when p_superseded_by is not null then 'Superseded public checkout hold'
           when p_reason like 'validated-payfast-%' then 'PayFast reported unsuccessful checkout'
           else 'Public payment hold expired'
         end,
         booking_status = 'cancelled',
         public_checkout_expired_at = v_now,
         public_checkout_superseded_by = p_superseded_by,
         table_id = null,
         updated_at = v_now
   where id = v_booking.id;

  insert into public.booking_lifecycle_events
    (booking_id, from_status, to_status, note, reason, created_at)
  values (
    v_booking.id,
    v_booking.booking_status,
    'cancelled',
    case
      when p_superseded_by is not null then 'Public checkout hold superseded by paid booking'
      when p_reason like 'validated-payfast-%' then 'Public checkout hold released after validated PayFast failure'
      else 'Public checkout hold expired'
    end,
    p_reason,
    v_now
  );

  insert into public.audit_events
    (action, actor_name, actor_location_scope, entity_type, entity_reference,
     entity_id, outcome, source_area, reason, before_values, after_values,
     changed_fields)
  values (
    case when p_superseded_by is not null
      then 'public_checkout.hold.superseded'
      else 'public_checkout.hold.expired'
    end,
    'SYSTEM',
    '{}'::text[],
    'booking',
    v_booking.booking_reference,
    v_booking.id::text,
    'success',
    'Public Booking',
    p_reason,
    jsonb_build_object(
      'booking_status', v_booking.booking_status,
      'table_id', v_booking.table_id,
      'expires_at', v_booking.public_checkout_expires_at
    ),
    jsonb_build_object(
      'booking_status', 'cancelled',
      'table_id', null,
      'expired_at', v_now,
      'superseded_by', p_superseded_by
    ),
    array['booking_status','table_id','archived_at','public_checkout_expired_at','public_checkout_superseded_by']
  );

  return jsonb_build_object(
    'expired', true,
    'released_pax', v_booking.guest_count,
    'released_table_claims', v_released
  );
end
$$;

create or replace function public.expire_public_booking_hold_by_reference(
  p_booking_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
begin
  select id into v_booking_id
    from public.bookings
   where booking_reference = p_booking_reference;

  if v_booking_id is null then
    return jsonb_build_object('expired', false, 'reason', 'missing');
  end if;

  return public.expire_public_booking_hold(v_booking_id, p_reason, null);
end
$$;

create or replace function public.expire_due_public_booking_holds(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_result jsonb;
  v_expired integer := 0;
  v_pax integer := 0;
  v_tables integer := 0;
begin
  for v_booking in
    select b.id,
      (
        select successor.id
          from public.bookings successor
         where successor.id <> b.id
           and successor.booking_source = 'online'
           and successor.booking_origin = 'customer_public'
           and successor.show_id = b.show_id
           and successor.customer_id = b.customer_id
           and successor.guest_count = b.guest_count
           and successor.section is not distinct from b.section
           and successor.public_checkout_journey_id = b.public_checkout_journey_id
           and successor.booking_status in ('confirmed', 'checked_in', 'completed')
           and coalesce(successor.amount_paid, 0) > 0
         order by successor.created_at desc
         limit 1
      ) as superseded_by
      from public.bookings b
     where b.booking_source = 'online'
       and b.booking_origin = 'customer_public'
       and b.booking_status = 'pending_payment'
       and b.payment_status = 'pending_payment'
       and coalesce(b.amount_paid, 0) = 0
       and b.archived_at is null
       and b.public_checkout_expired_at is null
       and b.public_checkout_expires_at <= now()
     order by b.public_checkout_expires_at
     limit least(greatest(coalesce(p_limit, 500), 1), 1000)
     for update skip locked
  loop
    v_result := public.expire_public_booking_hold(
      v_booking.id,
      case when v_booking.superseded_by is null
        then 'expired'
        else 'superseded-by-authoritative-payment'
      end,
      v_booking.superseded_by
    );
    if coalesce((v_result ->> 'expired')::boolean, false) then
      v_expired := v_expired + 1;
      v_pax := v_pax + coalesce((v_result ->> 'released_pax')::integer, 0);
      v_tables := v_tables + coalesce((v_result ->> 'released_table_claims')::integer, 0);
    end if;
  end loop;

  return jsonb_build_object(
    'expired', v_expired,
    'released_pax', v_pax,
    'released_table_claims', v_tables
  );
end
$$;

create or replace function public.supersede_paid_public_checkout_siblings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sibling record;
begin
  if new.booking_source <> 'online'
     or new.booking_origin <> 'customer_public'
     or new.public_checkout_journey_id is null
     or new.booking_status not in ('confirmed', 'checked_in', 'completed')
     or coalesce(new.amount_paid, 0) <= 0
     or not (
       old.booking_status is distinct from new.booking_status
       or old.amount_paid is distinct from new.amount_paid
     ) then
    return new;
  end if;

  for v_sibling in
    select id
      from public.bookings
     where id <> new.id
       and booking_source = 'online'
       and booking_origin = 'customer_public'
       and show_id = new.show_id
       and customer_id = new.customer_id
       and guest_count = new.guest_count
       and section is not distinct from new.section
       and public_checkout_journey_id = new.public_checkout_journey_id
       and booking_status = 'pending_payment'
       and payment_status = 'pending_payment'
       and coalesce(amount_paid, 0) = 0
       and archived_at is null
     for update
  loop
    perform public.expire_public_booking_hold(
      v_sibling.id,
      'superseded-by-authoritative-payment',
      new.id
    );
  end loop;

  return new;
end
$$;

drop trigger if exists bookings_supersede_paid_public_checkout_siblings on public.bookings;
create trigger bookings_supersede_paid_public_checkout_siblings
  after update of booking_status, amount_paid on public.bookings
  for each row execute function public.supersede_paid_public_checkout_siblings();

revoke all on function public.public_checkout_journey_from_notes(text) from public, anon, authenticated;
revoke all on function public.expire_public_booking_hold(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.expire_public_booking_hold_by_reference(text, text) from public, anon, authenticated;
revoke all on function public.expire_due_public_booking_holds(integer) from public, anon, authenticated;
grant execute on function public.expire_public_booking_hold(uuid, text, uuid) to service_role;
grant execute on function public.expire_public_booking_hold_by_reference(text, text) to service_role;
grant execute on function public.expire_due_public_booking_holds(integer) to service_role;

-- Backfill only authoritative public checkout provenance. No financial row is changed.
update public.bookings
   set public_checkout_journey_id = public.public_checkout_journey_from_notes(notes),
       public_checkout_expires_at = case
         when booking_status = 'pending_payment'
          and payment_status = 'pending_payment'
          and coalesce(amount_paid, 0) = 0
         then created_at + interval '30 minutes'
         else null
       end
 where booking_source = 'online'
   and booking_origin = 'customer_public'
   and public_checkout_journey_id is null;

-- The function refuses provider-backed, ticketed, or communicated records.
select public.expire_due_public_booking_holds(500);
