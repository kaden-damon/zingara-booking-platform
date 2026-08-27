-- REVIEW-ONLY historical backfill. Do not run until separately approved.
-- Evidence snapshot: 2026-08-27 23:39:15.871788+00, 1,386 bookings.
-- This intentionally does not infer origin from reference format, dates,
-- customer identity, payment state, table assignment, or booking_source.

begin;

create temporary table phase_39_11_provenance_plan on commit drop as
with audited_bookings as (
  select id
    from public.bookings
   where created_at <= '2026-08-27 23:39:15.871788+00'::timestamptz
),
import_evidence as (
  select distinct on (item ->> 'reference')
    item ->> 'reference' as booking_reference,
    run.initiated_by as creator_id
  from public.data_portability_import_runs run
  cross join lateral jsonb_array_elements(run.result_log) item
  where run.dataset = 'bookings'
    and run.final_status = 'success'
    and item ->> 'status' = 'Success'
    and item ->> 'action' = 'Create'
    and coalesce(item ->> 'reference', '') <> ''
  order by item ->> 'reference', run.completed_at asc nulls last
),
public_evidence as (
  select distinct event.booking_id
    from public.booking_lifecycle_events event
   where event.note in (
     'Online booking created',
     'Online booking created with server-authoritative pricing',
     'Awaiting PayFast payment',
     'Zero-value booking completed with server-authoritative pricing'
   )
),
staff_evidence as (
  select distinct on (event.entity_id)
    event.entity_id::uuid as booking_id,
    event.actor_staff_profile_id as creator_id
  from public.audit_events event
  where event.action = 'platform-qa.wallet-booking-create'
    and event.outcome = 'success'
    and event.entity_id is not null
    and event.actor_staff_profile_id is not null
  order by event.entity_id, event.created_at asc
)
select
  booking.id as booking_id,
  case
    when imported.booking_reference is not null then 'data_import'
    when public_event.booking_id is not null then 'customer_public'
    when staff_event.booking_id is not null then 'admin_staff'
    else 'legacy_unknown'
  end as booking_origin,
  coalesce(imported.creator_id, staff_event.creator_id) as created_by_staff_id
from public.bookings booking
join audited_bookings audited on audited.id = booking.id
left join import_evidence imported
  on imported.booking_reference = booking.booking_reference
left join public_evidence public_event on public_event.booking_id = booking.id
left join staff_evidence staff_event on staff_event.booking_id = booking.id;

do $$
declare
  v_total integer;
  v_import integer;
  v_public integer;
  v_staff integer;
  v_unknown integer;
begin
  select count(*) into v_total from phase_39_11_provenance_plan;
  select count(*) into v_import from phase_39_11_provenance_plan where booking_origin = 'data_import';
  select count(*) into v_public from phase_39_11_provenance_plan where booking_origin = 'customer_public';
  select count(*) into v_staff from phase_39_11_provenance_plan where booking_origin = 'admin_staff';
  select count(*) into v_unknown from phase_39_11_provenance_plan where booking_origin = 'legacy_unknown';

  if v_total <> 1386
     or v_import <> 1371
     or v_public <> 9
     or v_staff <> 1
     or v_unknown <> 5 then
    raise exception 'PHASE_39_11_EVIDENCE_COUNTS_CHANGED';
  end if;
end;
$$;

update public.bookings booking
   set booking_origin = plan.booking_origin,
       created_by_staff_id = plan.created_by_staff_id,
       provenance_recorded_at = now()
  from phase_39_11_provenance_plan plan
 where booking.id = plan.booking_id
   and booking.provenance_recorded_at is null;

do $$
begin
  if exists (
    select 1
      from phase_39_11_provenance_plan plan
      join public.bookings booking on booking.id = plan.booking_id
     where booking.booking_origin is distinct from plan.booking_origin
        or booking.created_by_staff_id is distinct from plan.created_by_staff_id
        or booking.provenance_recorded_at is null
  ) then
    raise exception 'PHASE_39_11_BACKFILL_VERIFICATION_FAILED';
  end if;
end;
$$;

-- Approved for the fixed 1,386-booking evidence snapshot in Phase 39.11A.
commit;
