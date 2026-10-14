import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const migrationPath =
  "../../supabase/migrations/20261014170000_p0_corporate_guest_count_and_price_editing.sql";

test("Corporate guest amendments preserve the agreed total and update one-zone entitlement atomically", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /reconcile_corporate_booking_guest_count_atomic/);
  assert.match(migration, /booking_origin <> 'corporate'/);
  assert.match(migration, /booking_source <> 'corporate-direct'/);
  assert.match(migration, /jsonb_array_length\(v_booking\.zone_entitlements\) > 1/);
  assert.match(migration, /CORPORATE_ZONE_ALLOCATION_REQUIRED/);
  assert.match(migration, /zone_entitlements = v_new_entitlements/);
  assert.match(migration, /'additional_amount', 0/);
  assert.match(migration, /'total_amount', v_booking\.total_amount/);
});

test("Corporate reconciliation keeps capacity, table fit, permissions, revision and audit guards", async () => {
  const migration = await source(migrationPath);
  assert.match(migration, /permission\.key = 'bookings:reconcile'/);
  assert.match(migration, /BOOKING_REVISION_CHANGED/);
  assert.match(migration, /booking_capacity_zone_effective_limit/);
  assert.match(migration, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(migration, /booking_table_claims_fit_guest_count/);
  assert.match(migration, /booking\.corporate-guest-count-reconciliation/);
});

test("the API chooses the Corporate fixed-total RPC and maps allocation errors", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");
  assert.match(route, /isCorporateFixedTotal/);
  assert.match(route, /reconcile_corporate_booking_guest_count_atomic/);
  assert.match(route, /CORPORATE_ZONE_ENTITLEMENTS_INVALID/);
  assert.match(route, /CORPORATE_ZONE_ALLOCATION_REQUIRED/);
});

test("Booking Details exposes agreed-price wording and fixed-total guest preview", async () => {
  const [modal, page] = await Promise.all([
    source("../app/admin/BookingReconciliationModal.tsx"),
    source("../app/admin/page.tsx"),
  ]);
  assert.match(modal, /Edit Agreed Price/);
  assert.match(modal, /Agreed Corporate Total/);
  assert.match(modal, /Fixed total · no automatic repricing/);
  assert.match(page, /Edit Agreed Price/);
});
