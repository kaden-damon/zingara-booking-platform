import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Explicitly authorised booking only. Every recovery/test write is rolled back.
const migration = readFileSync(new URL("../supabase/migrations/20261123180000_authorised_paid_checkout_queue_recovery.sql", import.meta.url), "utf8");
const sql = `begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
create temp table recovery_baseline as
select b.id, to_jsonb(b) - array['booking_status','archived_at','archive_reason','notes','updated_at'] as immutable,
  (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) from public.payments p where p.booking_id=b.id) as payments,
  (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) from public.communications c where c.booking_id=b.id) as communications,
  b.updated_at, to_jsonb(b) as original
from public.bookings b where b.booking_reference in ('ZNG-X94SUT','ZNG-YW2USY');
create temp table recovery_tables_before as select id,to_jsonb(t) as original
from public.show_tables t where show_id='b9fc70ed-ae1a-44e8-af54-fd4f9b038127';
create temp table recovery_others_before as select id,to_jsonb(b) as original
from public.bookings b where show_id='b9fc70ed-ae1a-44e8-af54-fd4f9b038127'
  and booking_reference<>'ZNG-X94SUT';
${migration}
do $test$
declare r jsonb; q jsonb; revision timestamptz;
begin
  select updated_at into revision from recovery_baseline where original->>'booking_reference'='ZNG-X94SUT';
  begin
    perform public.recover_authorised_paid_checkout_queue_atomic(revision-interval '1 second');
    raise exception 'STALE_RECOVERY_ALLOWED';
  exception when others then if sqlerrm<>'BOOKING_REVISION_CHANGED' then raise; end if; end;
  begin
    update public.booking_edit_locks set released_at=null,last_activity_at=clock_timestamp()
    where id='cbe72c84-dba9-4009-94dc-91c29a743d10';
    perform public.recover_authorised_paid_checkout_queue_atomic(revision);
    raise exception 'ACTIVE_LOCK_IGNORED';
  exception when others then if sqlerrm<>'BOOKING_EDIT_LOCK_ACTIVE' then raise; end if; end;
  begin
    update public.bookings set booking_status='confirmed',archived_at=null,archive_reason=null
    where booking_reference='ZNG-X94SUT';
    raise exception 'UNAUTHORISED_CAPACITY_OVERRIDE_ALLOWED';
  exception when check_violation then
    if sqlerrm not like 'ZONE_CAPACITY_EXCEEDED|%' then raise; end if;
  end;
  if has_function_privilege('anon','public.recover_authorised_paid_checkout_queue_atomic(timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.recover_authorised_paid_checkout_queue_atomic(timestamptz)','EXECUTE') then
    raise exception 'RECOVERY_PUBLICLY_EXECUTABLE';
  end if;
  r:=public.recover_authorised_paid_checkout_queue_atomic(revision);
  if r->>'booking_status'<>'confirmed' or (r->>'valid_tickets')::integer<>4
     or (r->>'approved_capacity')::integer<>149 or (r->>'active_entitlement')::integer<>153 then
    raise exception 'RECOVERY_RESULT_INVALID';
  end if;
  q:=public.recover_authorised_paid_checkout_queue_atomic(revision);
  if q-'idempotent'<>r or q->>'idempotent'<>'true' then raise exception 'RETRY_NOT_IDEMPOTENT'; end if;
  begin
    update public.bookings set guest_count=5 where booking_reference='ZNG-X94SUT';
    raise exception 'ADDITIONAL_GUEST_ALLOWED';
  exception when check_violation then
    if sqlerrm not like 'ZONE_CAPACITY_EXCEEDED|%' then raise; end if;
  end;
  if exists (select 1 from public.bookings b join recovery_baseline x on x.id=b.id
    where x.immutable is distinct from to_jsonb(b)-array['booking_status','archived_at','archive_reason','notes','updated_at']
      or x.payments is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) from public.payments p where p.booking_id=b.id)
      or x.communications is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) from public.communications c where c.booking_id=b.id)
      or (b.booking_reference='ZNG-YW2USY' and x.original is distinct from to_jsonb(b))) then
    raise exception 'FINANCIAL_OR_THERESA_OR_COMMUNICATION_CHANGE';
  end if;
  if exists (select 1 from public.show_tables t join recovery_tables_before x on x.id=t.id where to_jsonb(t)<>x.original)
    or exists (select 1 from public.bookings b join recovery_others_before x on x.id=b.id where to_jsonb(b)<>x.original) then
    raise exception 'OTHER_SEATING_OR_BOOKING_CHANGED';
  end if;
  if not exists (select 1 from public.bookings b where b.booking_reference='ZNG-X94SUT'
    and b.booking_status='confirmed' and b.archived_at is null and b.table_id is null
    and substring(b.notes from length('__zingara_booking_meta__:')+1)::jsonb->>'tableId'='requires-floor-assignment'
    and not exists (select 1 from public.show_tables t where t.booking_id=b.id)) then
    raise exception 'ASSIGNMENT_QUEUE_PREDICATE_FAILED';
  end if;
  if (select count(distinct qr_payload) from public.tickets where booking_id='903ca00a-0e97-4a4a-a102-d13a17dcc619')<>4 then
    raise exception 'DUPLICATE_QR';
  end if;
end $test$;
set constraints all immediate;
select true as recovery_rollback_checks_passed, 4 as valid_unique_tickets,
  149 as unchanged_approved_capacity,153 as active_guests, true as normal_capacity_guard_preserved;
rollback;`;
try {
  process.stdout.write(execFileSync("supabase", ["db", "query", "--linked", "--output", "json", sql], {
    encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  }));
} catch (error) {
  process.stderr.write(String(error.stderr || error.message));
  process.exitCode = 1;
}
