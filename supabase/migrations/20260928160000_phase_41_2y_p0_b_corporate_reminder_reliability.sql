-- Phase 41.2Y-P0-B: claim Corporate payment reminders before expiry.

create index if not exists bookings_corporate_payment_reminder_due_idx
  on public.bookings (corporate_payment_reminder_at, corporate_payment_deadline)
  where corporate_payment_reminder_sent_at is null
    and corporate_payment_expired_at is null;

drop function if exists public.claim_due_corporate_payment_reminders();

create function public.claim_due_corporate_payment_reminders()
returns table (
  booking_id uuid,
  booking_reference text,
  corporate_payment_deadline timestamptz,
  created_by_staff_id uuid,
  staff_name text,
  staff_email text,
  guest_name text,
  company_name text,
  guest_count integer,
  seating_zone text,
  balance_outstanding numeric,
  show_date date,
  show_time time,
  show_venue text
)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select b.id
      from public.bookings b
      join public.shows s on s.id = b.show_id
      join public.staff_profiles creator
        on creator.id = b.created_by_staff_id
       and creator.active = true
       and creator.email is not null
     where b.booking_source = 'corporate-direct'
       and b.booking_origin::text = 'corporate'
       and b.corporate_payment_reminder_at <= clock_timestamp()
       and b.corporate_payment_deadline > clock_timestamp()
       and b.corporate_payment_reminder_sent_at is null
       and b.corporate_payment_expired_at is null
       and b.corporate_payment_protected_at is null
       and (b.corporate_payment_reminder_claimed_at is null
         or b.corporate_payment_reminder_claimed_at < clock_timestamp() - interval '30 minutes')
       and coalesce(b.amount_paid, 0) <= 0
       and b.payment_status::text = 'pending_payment'
       and b.booking_status::text in ('new', 'pending_payment')
       and (s.date::text || ' ' || s.time::text)::timestamp
         at time zone 'Africa/Johannesburg' > clock_timestamp()
     order by b.corporate_payment_deadline
     limit 500
     for update of b skip locked
  ), claimed as (
    update public.bookings b
       set corporate_payment_reminder_claimed_at = clock_timestamp()
      from candidates c
     where b.id = c.id
     returning b.*
  )
  select c.id, c.booking_reference, c.corporate_payment_deadline,
         c.created_by_staff_id, coalesce(sp.full_name, sp.email), sp.email,
         trim(concat_ws(' ', cu.first_name, cu.surname)), c.company_name,
         c.guest_count, c.section::text, c.balance_outstanding,
         s.date, s.time, s.venue
    from claimed c
    join public.staff_profiles sp
      on sp.id = c.created_by_staff_id
     and sp.active = true
     and sp.email is not null
    join public.customers cu on cu.id = c.customer_id
    join public.shows s on s.id = c.show_id
$$;

revoke all on function public.claim_due_corporate_payment_reminders()
  from public, anon, authenticated;
grant execute on function public.claim_due_corporate_payment_reminders()
  to service_role;
