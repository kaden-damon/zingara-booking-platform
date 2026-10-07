begin;

create or replace function public.sync_corporate_buyout_payment_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyout_id uuid;
  v_previous_state text;
begin
  if new.amount_paid >= new.total_amount
     and new.total_amount > 0
     and new.balance_outstanding = 0
     and new.payment_status::text = 'fully_paid' then
    select id, state
      into v_buyout_id, v_previous_state
    from public.corporate_buyouts
    where booking_id = new.id
      and state in ('provisional','awaiting_payment','fully_paid')
    for update;

    if v_buyout_id is not null then
      update public.corporate_buyouts set
        state = 'confirmed', revision = revision + 1, updated_at = now()
      where id = v_buyout_id;

      insert into public.audit_events (
        action, after_values, before_values, changed_fields,
        entity_id, entity_reference, entity_type, outcome, reason,
        source_area
      ) values (
        'corporate.buyout.payment_confirmed',
        jsonb_build_object(
          'state', 'confirmed',
          'amount_paid', new.amount_paid,
          'balance_outstanding', new.balance_outstanding,
          'payment_status', new.payment_status
        ),
        jsonb_build_object(
          'state', v_previous_state,
          'amount_paid', old.amount_paid,
          'balance_outstanding', old.balance_outstanding,
          'payment_status', old.payment_status
        ),
        array['state','amount_paid','balance_outstanding','payment_status'],
        v_buyout_id::text, new.booking_reference, 'corporate_buyout', 'success',
        'Full Show Buyout payment was confirmed by the booking payment record.',
        'Corporate Bookings'
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_corporate_buyout_payment_state() from public, anon, authenticated;

commit;
