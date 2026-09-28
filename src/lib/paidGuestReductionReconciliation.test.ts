import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "../../supabase/migrations/20260928200000_phase_41_2y_p0_j_guest_reduction_legacy_allocation.sql";

async function migration() {
  return readFile(new URL(migrationPath, import.meta.url), "utf8");
}

test("capacity validates only positive per-zone entitlement deltas", async () => {
  const sql = await migration();

  assert.match(sql, /v_new_contribution <= v_old_contribution[\s\S]*continue/);
  assert.match(sql, /booking_zone_entitlement_pax\([\s\S]*old\.zone_entitlements/);
  assert.match(sql, /corporate_zone_entitlements_valid/);
  assert.match(sql, /ZONE_CAPACITY_EXCEEDED/);
});

test("imported invoice evidence is immutable, permissioned and never fabricates PayFast", async () => {
  const sql = await migration();

  assert.match(sql, /reconcile_imported_booking_financials_atomic/);
  assert.match(sql, /booking_origin <> 'data_import'/);
  assert.match(sql, /insert into public\.legacy_booking_payment_evidence/);
  assert.match(sql, /source_system[\s\S]*'manual_invoice'/);
  assert.match(sql, /booking\.financial-reconciliation/);
  assert.doesNotMatch(sql, /insert into public\.payments/);
  assert.doesNotMatch(sql, /provider_transaction_id\s*=/);
});

test("paid reductions commit pax and retained allocation together with retry protection", async () => {
  const sql = await migration();

  assert.match(sql, /reconcile_paid_booking_guest_reduction_atomic/);
  assert.match(sql, /request_id = p_request_id/);
  assert.match(sql, /BOOKING_REVISION_CHANGED/);
  assert.match(sql, /v_bar_tab := round\(v_evidence\.bar_tab_paid_amount \+ v_released \+ v_gratuity/);
  assert.match(sql, /\{valueAllocation\}/);
  assert.match(sql, /booking\.paid-guest-reduction/);
  assert.match(sql, /v_table\.capacity < p_guest_count/);
  assert.doesNotMatch(sql, /update public\.payments/);
  assert.doesNotMatch(sql, /delete from public\.legacy_booking_payment_evidence/);
});

test("the API keeps ordinary reconciliation intact and routes retained reductions explicitly", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/reconciliation/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /reconcile_imported_booking_financials_atomic/);
  assert.match(route, /reconcile_paid_booking_guest_reduction_atomic/);
  assert.match(route, /transferReleasedValueToBarTab !== true/);
  assert.match(route, /legacyInvoiceEvidence/);
});
