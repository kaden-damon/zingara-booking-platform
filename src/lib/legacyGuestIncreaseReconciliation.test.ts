import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateAuthorizedLegacyIncrease } from "./addedGuestFinancials.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const migrationPath =
  "../../supabase/migrations/20260904210000_phase_39_71a_legacy_guest_increases.sql";

test("full ticket reconciliation previews the added obligation", () => {
  assert.deepEqual(
    calculateAuthorizedLegacyIncrease({
      amountPaid: 2200,
      currentGuestCount: 4,
      currentTotal: 5920,
      newGuestCount: 6,
      paymentBasis: "full",
      unitAmount: 1480,
    }),
    {
      addedGuests: 2,
      additionalAmount: 2960,
      newOutstanding: 6680,
      newTotal: 8880,
    },
  );
});

test("deposit reconciliation uses only the authorised per-added-guest deposit", () => {
  assert.deepEqual(
    calculateAuthorizedLegacyIncrease({
      amountPaid: 2200,
      currentGuestCount: 4,
      currentTotal: 5920,
      newGuestCount: 6,
      paymentBasis: "deposit",
      unitAmount: 550,
    }),
    {
      addedGuests: 2,
      additionalAmount: 1100,
      newOutstanding: 4820,
      newTotal: 7020,
    },
  );
});

test("manual legacy reconciliation requires an explicit basis and positive rate", () => {
  assert.equal(
    calculateAuthorizedLegacyIncrease({
      amountPaid: 2200,
      currentGuestCount: 4,
      currentTotal: 5920,
      newGuestCount: 6,
      paymentBasis: "",
      unitAmount: 0,
    }).additionalAmount,
    null,
  );
});

test("automatic authoritative increases and Phase 39.71 decreases remain separate", async () => {
  const [automaticMigration, manualMigration] = await Promise.all([
    source("../../supabase/migrations/20260904200000_phase_39_71_guest_count_decreases.sql"),
    source(migrationPath),
  ]);

  assert.match(automaticMigration, /reconcile_booking_guest_count_financials_atomic/);
  assert.match(automaticMigration, /ADDED_GUEST_FINANCIAL_BASIS_REQUIRED/);
  assert.match(manualMigration, /reconcile_legacy_booking_guest_count_financials_atomic/);
  assert.match(manualMigration, /p_guest_count <= v_booking\.guest_count[\s\S]*LEGACY_INCREASE_REQUIRED/);
});

test("server proves the booking is imported and automatic pricing is unavailable", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /booking_origin::text not in \('data_import', 'legacy_unknown'\)/);
  assert.match(migration, /LEGACY_MANUAL_BASIS_NOT_ALLOWED/);
  assert.match(migration, /pricingProvenance,agreedPricePerPerson/);
  assert.match(migration, /pricingProvenance,depositPerPerson/);
});

test("the atomic update preserves paid money, provider rows, tickets, and identity", async () => {
  const migration = await source(migrationPath);
  const bookingUpdate = migration.slice(
    migration.indexOf("update public.bookings\n     set guest_count"),
    migration.indexOf("insert into public.audit_events"),
  );

  assert.match(bookingUpdate, /guest_count = p_guest_count/);
  assert.match(bookingUpdate, /total_amount = v_new_total/);
  assert.match(bookingUpdate, /balance_outstanding = v_new_balance/);
  assert.doesNotMatch(bookingUpdate, /amount_paid\s*=/);
  assert.doesNotMatch(migration, /(insert into|update|delete from) public\.(payments|tickets|communications)/i);
  assert.doesNotMatch(migration, /payfast/i);
});

test("table fit is preserved and undersized assignments move atomically to Floor Queue", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /v_table\.capacity < p_guest_count/);
  assert.match(migration, /set booking_id = null/);
  assert.match(migration, /table_id = case when v_floor_queue then null else v_booking\.table_id end/);
  assert.match(migration, /normalize_booking_capacity_zone/);
});

test("staff-authorised adjustment provenance and one audit event are persisted", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /legacyGuestIncreaseAdjustments/);
  assert.match(migration, /staff-authorized-legacy-reconciliation/);
  assert.match(migration, /booking\.legacy-guest-increase-reconciliation/);
  assert.equal(migration.match(/insert into public\.audit_events/g)?.length, 1);
  assert.match(migration, /before_values/);
  assert.match(migration, /after_values/);
});

test("the route uses the manual RPC only when staff supplies a complete basis", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");

  assert.match(route, /hasManualFinancialBasis/);
  assert.match(route, /reconcile_legacy_booking_guest_count_financials_atomic/);
  assert.match(route, /Select Full Ticket Rate or Deposit Basis/);
  assert.match(route, /Enter a valid positive rate for each added guest/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /bookings:reconcile/);
});

test("the modal exposes deliberate basis selection, preview, and no automatic link send", async () => {
  const modal = await source("../app/admin/BookingReconciliationModal.tsx");

  assert.match(modal, /Financial Reconciliation Required/);
  assert.match(modal, /Full Ticket Rate/);
  assert.match(modal, /Deposit Basis/);
  assert.match(modal, /Confirmation Preview/);
  assert.match(modal, /Current paid/);
  assert.match(modal, /New outstanding/);
  assert.match(modal, /CONFIRM GUEST COUNT/);
  assert.match(modal, /UPDATING\.\.\./);
  assert.match(modal, /UPDATED ✓/);
  assert.doesNotMatch(modal, /useEffect\([\s\S]{0,300}createPaymentLink/);
});
