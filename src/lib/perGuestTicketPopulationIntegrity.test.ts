import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261004150000_per_guest_ticket_population_integrity.sql",
  "utf8",
);
const cleanupMigration = readFileSync(
  "supabase/migrations/20261004170000_historical_surplus_guest_ticket_cleanup.sql",
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

test("historical cleanup is hard-bound to the five proven surplus bookings", () => {
  for (const reference of [
    "ZNG-98R23K",
    "ZNG-KEE532",
    "DP-76BGPC",
    "ZNG-YNHL4M",
    "ZNG-6BBP4D",
  ]) {
    assert.match(cleanupMigration, new RegExp(reference));
  }
  assert.match(cleanupMigration, /TICKET_CLEANUP_BOOKING_NOT_AUTHORIZED/);
  assert.match(cleanupMigration, /BOOKING_REVISION_CHANGED/);
});

test("cleanup keeps canonical first N identities and voids only proven surplus", () => {
  assert.match(cleanupMigration, /generate_series\(1, v_expected_guest_count\)/);
  assert.match(
    cleanupMigration,
    /v_expected_guest_count \+ 1,[\s\S]*v_expected_historical_count/,
  );
  assert.match(cleanupMigration, /ticket_status = 'void'/);
  assert.doesNotMatch(cleanupMigration, /delete\s+from\s+public\.tickets/i);
  assert.doesNotMatch(cleanupMigration, /insert\s+into\s+public\.tickets/i);
});

test("legacy booking-level ticket is explicitly preserved", () => {
  assert.match(cleanupMigration, /v_expected_booking_level_code := 'DP-76BGPC-01'/);
  assert.match(cleanupMigration, /booking_level_ticket_preserved/);
  assert.match(
    cleanupMigration,
    /ticket\.ticket_code = v_expected_booking_level_code[\s\S]*ticket\.ticket_status::text = 'valid'/,
  );
});

test("cleanup fails closed for scans, Wallet registrations, or state drift", () => {
  assert.match(cleanupMigration, /public\.ticket_validations/);
  assert.match(cleanupMigration, /public\.apple_wallet_registrations/);
  assert.match(cleanupMigration, /TICKET_CLEANUP_TICKET_STATE_CHANGED/);
  assert.match(cleanupMigration, /TICKET_CLEANUP_COUNT_MISMATCH/);
});

test("cleanup changes no booking, payment, show, table, or capacity records", () => {
  assert.doesNotMatch(cleanupMigration, /update\s+public\.bookings/i);
  assert.doesNotMatch(cleanupMigration, /update\s+public\.payments/i);
  assert.doesNotMatch(cleanupMigration, /update\s+public\.shows/i);
  assert.doesNotMatch(cleanupMigration, /update\s+public\.show_tables/i);
  assert.match(cleanupMigration, /booking\.surplus-guest-tickets-invalidated/);
  assert.match(cleanupMigration, /request_id = trim\(p_request_id\)/);
});
