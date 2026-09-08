-- Phase 41.1J: snapshot the authoritative current balance while holding the
-- booking row lock so concurrent staff requests cannot create competing links.
create or replace function public.create_booking_balance_payment_link_atomic(
  p_booking_reference text,
  p_token_hash text,
  p_metadata jsonb,
  p_expires_at timestamptz,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing_id uuid;
  v_link_id uuid;
  v_now timestamptz := clock_timestamp();
  v_outstanding numeric;
begin
  select *
    into v_booking
    from public.bookings
   where booking_reference = nullif(trim(upper(p_booking_reference)), '')
   for update;

  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded')
     or v_booking.payment_status::text in ('cancelled', 'comp_vip', 'fully_paid', 'refunded') then
    raise exception 'PAYMENT_LINK_NOT_ALLOWED';
  end if;

  v_outstanding := greatest(
    round(coalesce(v_booking.total_amount, 0) - coalesce(v_booking.amount_paid, 0), 2),
    0
  );

  if v_outstanding <= 0 then
    raise exception 'NO_OUTSTANDING_BALANCE';
  end if;

  select id
    into v_existing_id
    from public.booking_payment_links
   where booking_id = v_booking.id
     and status = 'active'
     and expires_at > v_now
     and coalesce((metadata ->> 'outstandingReconciliation')::boolean, false)
     and round(coalesce((metadata ->> 'checkoutAmount')::numeric, 0), 2) = v_outstanding
     and round(coalesce((metadata ->> 'amountPaidSnapshot')::numeric, -1), 2)
         = round(coalesce(v_booking.amount_paid, 0), 2)
     and round(coalesce((metadata ->> 'totalAmountSnapshot')::numeric, -1), 2)
         = round(coalesce(v_booking.total_amount, 0), 2)
   order by created_at desc
   limit 1;

  if v_existing_id is not null then
    raise exception 'ACTIVE_BALANCE_LINK_EXISTS';
  end if;

  update public.booking_payment_links
     set revoked_at = v_now,
         status = 'revoked',
         updated_at = v_now
   where booking_id = v_booking.id
     and status = 'active';

  insert into public.booking_payment_links (
    booking_id,
    booking_reference,
    created_by,
    expires_at,
    metadata,
    token_hash
  ) values (
    v_booking.id,
    v_booking.booking_reference,
    p_created_by,
    p_expires_at,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'amountPaidSnapshot', round(coalesce(v_booking.amount_paid, 0), 2),
      'checkoutAmount', v_outstanding,
      'outstandingReconciliation', true,
      'totalAmountSnapshot', round(coalesce(v_booking.total_amount, 0), 2)
    ),
    p_token_hash
  )
  returning id into v_link_id;

  return jsonb_build_object(
    'amount', v_outstanding,
    'booking_id', v_booking.id,
    'link_id', v_link_id
  );
end;
$$;

revoke all on function public.create_booking_balance_payment_link_atomic(
  text, text, jsonb, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.create_booking_balance_payment_link_atomic(
  text, text, jsonb, timestamptz, uuid
) to service_role;
