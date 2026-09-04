import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateAddedGuestFinancials } from "./addedGuestFinancials.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const migrationPath =
  "../../supabase/migrations/20260904200000_phase_39_71_guest_count_decreases.sql";

test("an ambiguous imported booking may decrease without pricing metadata", async () => {
  const migration = await source(migrationPath);

  assert.match(
    migration,
    /if p_guest_count > v_booking\.guest_count and v_show\.status::text <> 'active'/,
  );
  assert.match(migration, /if v_added_guests > 0 then[\s\S]*ADDED_GUEST_FINANCIAL_BASIS_REQUIRED/);
  assert.deepEqual(
    calculateAddedGuestFinancials({
      basis: { paymentBasis: "unknown", source: "unknown", unitAmount: null },
      currentGuestCount: 8,
      currentOutstanding: 6160,
      newGuestCount: 6,
    }),
    { addedGuests: 0, additionalAmount: null, newOutstanding: null },
  );
});

test("ambiguous legacy increases still fail closed", async () => {
  const migration = await source(migrationPath);
  const pricingGuard = migration.slice(
    migration.indexOf("if v_added_guests > 0 then"),
    migration.indexOf("if v_booking.table_id is not null then"),
  );

  assert.match(pricingGuard, /ADDED_GUEST_FINANCIAL_BASIS_REQUIRED/);
  assert.match(pricingGuard, /v_payment_basis not in \('deposit', 'full'\)/);
  assert.match(pricingGuard, /v_unit_amount is null or v_unit_amount <= 0/);
});

test("decreases preserve financials and create no money side effects", async () => {
  const migration = await source(migrationPath);
  const bookingUpdate = migration.slice(
    migration.indexOf("update public.bookings\n     set guest_count"),
    migration.indexOf("insert into public.audit_events"),
  );

  assert.match(bookingUpdate, /guest_count = p_guest_count/);
  assert.match(bookingUpdate, /subtotal_amount = v_new_subtotal/);
  assert.match(bookingUpdate, /total_amount = v_new_total/);
  assert.match(bookingUpdate, /balance_outstanding = v_new_balance/);
  assert.doesNotMatch(bookingUpdate, /amount_paid\s*=/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(payments|refunds)/i);
  assert.doesNotMatch(migration, /payfast/i);
});

test("unassigned bookings remain in the Floor queue and fitting tables remain assigned", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /else\n    v_floor_queue := true;/);
  assert.match(migration, /if v_table\.capacity < p_guest_count then/);
  assert.match(
    migration,
    /table_id = case when v_floor_queue then null else v_booking\.table_id end/,
  );
});

test("one atomic audit records pax and unchanged financial values", async () => {
  const migration = await source(migrationPath);

  assert.equal(
    migration.match(/insert into public\.audit_events/g)?.length,
    1,
  );
  assert.match(migration, /'guest_count', v_booking\.guest_count/);
  assert.match(migration, /'guest_count', p_guest_count/);
  assert.match(migration, /'total_amount', v_booking\.total_amount/);
  assert.match(migration, /'amount_paid', v_booking\.amount_paid/);
  assert.match(migration, /'balance_outstanding', v_booking\.balance_outstanding/);
});

test("the API returns safe specific reconciliation failures", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");

  assert.match(route, /message\.includes\("SHOW_NOT_ACTIVE"\)/);
  assert.match(route, /Guests can only be added while the performance is active/);
  assert.match(route, /message\.includes\("BOOKING_REVISION_CHANGED"\)/);
  assert.match(route, /message\.includes\("ADDED_GUEST_FINANCIAL_BASIS_REQUIRED"\)/);
});

test("the modal and parent guard duplicate submission and show the complete state cycle", async () => {
  const [modal, page] = await Promise.all([
    source("../app/admin/BookingReconciliationModal.tsx"),
    source("../app/admin/page.tsx"),
  ]);

  assert.match(modal, /CONFIRM GUEST COUNT/);
  assert.match(modal, /UPDATING\.\.\./);
  assert.match(modal, /UPDATED ✓/);
  assert.match(modal, /disabled=\{props\.isSaving/);
  assert.match(page, /guestCountReconciliationInFlightRef\.current/);
  assert.match(page, /finally \{[\s\S]*guestCountReconciliationInFlightRef\.current = false/);
});
