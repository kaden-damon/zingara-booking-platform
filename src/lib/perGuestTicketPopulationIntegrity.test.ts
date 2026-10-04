import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261004150000_per_guest_ticket_population_integrity.sql",
  "utf8",
);

test("40 to 28 preserves canonical tickets and voids only 29 to 40", () => {
  assert.match(migration, /generate_series\(1, 28\) ticket_index/);
  assert.match(migration, /generate_series\(29, 40\) ticket_index/);
  assert.match(migration, /ticket_status = 'void'/);
  assert.match(migration, /v_voided <> 12/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.tickets/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.tickets/i);
});

test("cleanup is hard-bound and preserves booking financial and capacity state", () => {
  assert.match(migration, /booking_reference = 'ZNG-9G8L48'/);
  assert.match(migration, /guest_count <> 28/);
  assert.match(migration, /total_amount <> 64800/);
  assert.match(migration, /amount_paid <> 0/);
  assert.match(migration, /balance_outstanding <> 64800/);
  assert.doesNotMatch(migration, /update\s+public\.bookings/i);
  assert.doesNotMatch(migration, /update\s+public\.shows/i);
  assert.doesNotMatch(migration, /update\s+public\.show_tables/i);
});

test("scans and Wallet registrations fail closed before cleanup", () => {
  assert.match(migration, /public\.ticket_validations/);
  assert.match(migration, /public\.apple_wallet_registrations/);
  assert.match(migration, /TICKET_CLEANUP_TICKET_STATE_CHANGED/);
  assert.match(migration, /TICKET_SURVIVOR_REVIEW_REQUIRED/);
});

test("future pax reductions void only matching per-guest ticket families", () => {
  assert.match(migration, /bookings_reconcile_guest_tickets_after_pax_reduction/);
  assert.match(migration, /new\.guest_count < old\.guest_count/);
  assert.match(migration, /family_prefix/);
  assert.match(migration, /guestTickets/);
  assert.match(migration, /booking\.guest-ticket-population-reconciled/);
});

test("Corporate recovery cannot reactivate surplus historical guest tickets", () => {
  assert.match(migration, /tickets_guard_surplus_guest_reactivation/);
  assert.match(migration, /old\.ticket_status::text <> 'cancelled'/);
  assert.match(migration, /if v_family and not v_authorized then[\s\S]*return null/);
});

test("booking-level tickets remain outside the per-guest family guard", () => {
  assert.match(
    migration,
    /regexp_replace\(new\.ticket_code, '\[0-9\]\+\(R\[A-Z0-9\]\+\)\?\$', ''\)/,
  );
  assert.match(migration, /if v_family and not v_authorized/);
  assert.doesNotMatch(migration, /count\(\*\).*guest_count/);
});

test("cleanup is revision protected, idempotent, audited, and service-only", () => {
  assert.match(migration, /BOOKING_REVISION_CHANGED/);
  assert.match(migration, /booking\.surplus-guest-tickets-invalidated/);
  assert.match(migration, /request_id = trim\(p_request_id\)/);
  assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]+to service_role/);
});
