-- Reuse ticket population reconciliation without issuing unpaid NYE entitlements.
do $$
begin
  if md5(pg_get_functiondef('public.reconcile_guest_tickets_after_pax_increase()'::regprocedure))
      <> '2564a5cdecbf0a1220fe20d2dd324d8b' then
    raise exception 'FULL_PAYMENT_TICKET_SYNC_FUNCTION_DRIFT';
  end if;
end $$;

create or replace function public.reconcile_guest_tickets_after_pax_increase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_payment_required boolean := coalesce(new.payment_policy_snapshot = 'full-payment-only', false);
  fully_settled boolean := new.payment_status::text = 'fully_paid'
    and coalesce(new.amount_paid, 0) >= coalesce(new.total_amount, 0)
    and coalesce(new.balance_outstanding, 0) = 0;
begin
  if full_payment_required and not fully_settled then return new; end if;

  if new.guest_count <= old.guest_count then
    if not (full_payment_required and fully_settled
        and old.payment_status is distinct from new.payment_status
        and new.archived_at is null
        and new.booking_status::text in ('new', 'confirmed', 'pending_payment')) then
      return new;
    end if;
  end if;

  perform public.reconcile_per_guest_ticket_population(
    new.id,
    'SYSTEM',
    case when new.guest_count > old.guest_count
      then 'Per-guest ticket population reconciled after guest-count increase.'
      else 'Deferred guest tickets reconciled after full payment.' end,
    'ticket-population-increase:' || new.id::text || ':' || new.updated_at::text
  );
  return new;
end;
$$;

revoke all on function public.reconcile_guest_tickets_after_pax_increase()
  from public, anon, authenticated;

drop trigger if exists bookings_reconcile_guest_tickets_after_pax_increase
  on public.bookings;
create trigger bookings_reconcile_guest_tickets_after_pax_increase
  after update of guest_count, payment_status, amount_paid, total_amount, balance_outstanding
  on public.bookings
  for each row
  when (new.guest_count > old.guest_count or (
    new.payment_policy_snapshot = 'full-payment-only'
    and new.payment_status::text = 'fully_paid'
    and old.payment_status is distinct from new.payment_status
  ))
  execute function public.reconcile_guest_tickets_after_pax_increase();
