import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getReconciledPaymentStatus,
  validateFinancialReconciliation,
  validateGuestCountReconciliation,
} from "./bookingReconciliation.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("financial reconciliation derives outstanding payment states", () => {
  assert.equal(getReconciledPaymentStatus(8880, 3300), "deposit_paid");
  assert.equal(getReconciledPaymentStatus(8880, 0), "pending_payment");
  assert.equal(getReconciledPaymentStatus(8880, 8880), "fully_paid");
});

test("financial reconciliation rejects invalid money and requires a reason", () => {
  assert.match(
    validateFinancialReconciliation({ amountPaid: 100, reason: "", totalAmount: 50 }) ?? "",
    /cannot exceed/,
  );
  assert.match(
    validateFinancialReconciliation({ amountPaid: -1, reason: "Correction", totalAmount: 50 }) ?? "",
    /negative/,
  );
  assert.match(
    validateFinancialReconciliation({ amountPaid: 0, reason: "", totalAmount: 50 }) ?? "",
    /required/,
  );
});

test("guest-count reconciliation requires positive whole pax and reason", () => {
  assert.match(
    validateGuestCountReconciliation({ guestCount: 2.5, reason: "Correction" }) ?? "",
    /whole number/,
  );
  assert.match(
    validateGuestCountReconciliation({ guestCount: 6, reason: "" }) ?? "",
    /required/,
  );
});

test("Box Office Manager and Super Admin receive the explicit permission only", async () => {
  const [access, migration] = await Promise.all([
    source("./zingaraAccess.ts"),
    source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql"),
  ]);

  assert.match(access, /"box-office-manager"[\s\S]*"bookings:reconcile"/);
  assert.match(access, /"super-admin"[\s\S]*"bookings:reconcile"/);
  assert.doesNotMatch(
    access.slice(access.indexOf('"box-office-staff": ['), access.indexOf("concierge:")),
    /bookings:reconcile/,
  );
  assert.match(migration, /role\.name in \('Super Admin', 'Box Office Manager'\)/);
});

test("server route enforces reconciliation permission and active staff auth", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /includes\("bookings:reconcile"\)/);
  assert.match(route, /status: 403/);
});

test("financial mutation is atomic, stale-safe, and audited", async () => {
  const migration = await source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql");

  assert.match(migration, /for update/);
  assert.match(migration, /BOOKING_REVISION_CHANGED/);
  assert.match(migration, /booking\.financial-reconciliation/);
  assert.match(migration, /before_values[\s\S]*after_values/);
});

test("financial reconciliation preserves provider payments and legacy evidence", async () => {
  const migration = await source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql");

  assert.doesNotMatch(migration, /update public\.payments/i);
  assert.doesNotMatch(migration, /delete from public\.payments/i);
  assert.doesNotMatch(migration, /(update|delete from) public\.legacy_booking_payment_evidence/i);
  assert.match(migration, /AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE/);
});

test("payment link remains bounded to corrected authoritative outstanding", async () => {
  const [helper, route] = await Promise.all([
    source("./payment-links/customerPaymentLinks.ts"),
    source("../app/api/admin/bookings/payment-link/route.ts"),
  ]);

  assert.match(helper, /calculateOutstandingAmount\([\s\S]*row\.total_amount,[\s\S]*row\.amount_paid/);
  assert.match(route, /permissions\.includes\("bookings:reconcile"\)/);
});

test("guest-count edit relies on normal capacity enforcement", async () => {
  const migration = await source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql");

  assert.match(migration, /update public\.bookings[\s\S]*guest_count = p_guest_count/);
  assert.doesNotMatch(migration, /historical_dineplan_(import|update)/);
  assert.doesNotMatch(migration, /set_config\(/);
});

test("fitting tables are preserved and undersized claims are released atomically", async () => {
  const migration = await source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql");

  assert.match(migration, /v_table\.capacity < p_guest_count/);
  assert.match(migration, /update public\.show_tables[\s\S]*booking_id = null/);
  assert.match(migration, /floor_assignment_required/);
  assert.match(migration, /BOOKING_TABLE_STATE_INVALID/);
});

test("guest-count edits preserve all financial fields and ticket identity", async () => {
  const migration = await source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql");
  const guestFunction = migration.slice(
    migration.indexOf("create or replace function public.reconcile_booking_guest_count_atomic"),
  );

  assert.doesNotMatch(guestFunction, /set[\s\S]{0,300}(total_amount|amount_paid|balance_outstanding|payment_status)\s*=/i);
  assert.doesNotMatch(guestFunction, /(update|delete from) public\.tickets/i);
  assert.match(guestFunction, /jsonb_set\(v_metadata, '\{partySize\}'/);
});

test("guest-count edits are audited with table and Floor queue state", async () => {
  const migration = await source("../../supabase/migrations/20260902130000_phase_39_46_booking_reconciliation.sql");

  assert.match(migration, /booking\.guest-count-reconciliation/);
  assert.match(migration, /'table_code'/);
  assert.match(migration, /'floor_assignment_required'/);
});
