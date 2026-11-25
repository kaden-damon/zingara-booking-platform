import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateAddedGuestFinancials } from "./addedGuestFinancials.ts";

const migration = readFileSync("supabase/migrations/20261125143000_full_payment_guest_ticket_sync.sql", "utf8");

test("BUG38 full-price increase preserves receipts and adds the exact outstanding obligation", () => {
  assert.deepEqual(calculateAddedGuestFinancials({
    basis: { paymentBasis: "full", source: "show-specific", unitAmount: 1940 },
    currentGuestCount: 3, currentOutstanding: 0, newGuestCount: 5,
  }), { addedGuests: 2, additionalAmount: 3880, newOutstanding: 3880 });
});

test("full-only synchronisation defers unpaid tickets, then reuses existing population after settlement", () => {
  assert.match(migration, /full_payment_required and not fully_settled then return new/);
  assert.match(migration, /new\.payment_status::text = 'fully_paid'/);
  assert.match(migration, /new\.amount_paid, 0\) >= coalesce\(new\.total_amount, 0\)/);
  assert.match(migration, /new\.balance_outstanding, 0\) = 0/);
  assert.match(migration, /perform public\.reconcile_per_guest_ticket_population/);
  assert.match(migration, /new\.archived_at is null/);
  assert.match(migration, /new\.booking_status::text in \('new', 'confirmed', 'pending_payment'\)/);
  assert.match(migration, /old\.payment_status is distinct from new\.payment_status/);
});

test("migration cannot reprice, alter tickets directly or weaken payment and capacity guards", () => {
  assert.doesNotMatch(migration, /(?:update|insert into|delete from)\s+public\./i);
  assert.doesNotMatch(migration, /create or replace function public\.(?:enforce_full_payment_ticket_issuance|enforce_performance_payment_policy|reconcile_booking_guest_count_financials_atomic)/);
  assert.match(migration, /FULL_PAYMENT_TICKET_SYNC_FUNCTION_DRIFT/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant execute/);
});
