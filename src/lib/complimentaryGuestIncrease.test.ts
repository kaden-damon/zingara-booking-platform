import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateAddedGuestFinancials,
  resolveAddedGuestPricingBasis,
} from "./addedGuestFinancials.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const complimentaryMetadata = {
  pricingProvenance: {
    agreedPricePerPerson: 0,
    depositPerPerson: 0,
    paymentModel: "full" as const,
    source: "complimentary" as const,
  },
};

test("a proven Complimentary booking keeps an added guest at R0", () => {
  const basis = resolveAddedGuestPricingBasis({
    amountPaid: 0,
    balanceOutstanding: 0,
    bookingOrigin: "admin_staff",
    metadata: complimentaryMetadata,
    paymentStatus: "comp_vip",
    subtotalAmount: 0,
    totalAmount: 0,
  });

  assert.deepEqual(basis, {
    paymentBasis: "full",
    source: "complimentary",
    unitAmount: 0,
  });
  assert.deepEqual(
    calculateAddedGuestFinancials({
      basis,
      currentGuestCount: 8,
      currentOutstanding: 0,
      newGuestCount: 9,
    }),
    { addedGuests: 1, additionalAmount: 0, newOutstanding: 0 },
  );
});

test("zero value alone never grants Complimentary amendment treatment", () => {
  for (const input of [
    { paymentStatus: "pending_payment", metadata: complimentaryMetadata },
    { paymentStatus: "comp_vip", metadata: null },
    { paymentStatus: "comp_vip", metadata: complimentaryMetadata, totalAmount: 1 },
  ]) {
    assert.equal(
      resolveAddedGuestPricingBasis({
        amountPaid: 0,
        balanceOutstanding: 0,
        bookingOrigin: "admin_staff",
        metadata: input.metadata,
        paymentStatus: input.paymentStatus,
        subtotalAmount: 0,
        totalAmount: input.totalAmount ?? 0,
      }).paymentBasis,
      "unknown",
    );
  }
});

test("the database patch preserves Complimentary and all existing safeguards", async () => {
  const migration = await source(
    "../../supabase/migrations/20261007170000_phase_46_10_complimentary_guest_increases.sql",
  );
  assert.match(migration, /payment_status::text = ''comp_vip''/);
  assert.match(migration, /v_pricing_source = ''complimentary''/);
  assert.match(migration, /v_booking\.total_amount = 0/);
  assert.match(migration, /ADDED_GUEST_FINANCIAL_BASIS_REQUIRED/);
  assert.match(migration, /public\.booking_table_claims_fit_guest_count/);
  assert.doesNotMatch(migration, /update public\.(payments|tickets|shows|customers)/i);
});

test("the UI labels Complimentary clearly and never offers a R0 payment link", async () => {
  const modal = await source("../app/admin/BookingReconciliationModal.tsx");
  assert.match(modal, /Complimentary · R0\.00 pp/);
  assert.match(modal, /The booking remains complimentary/);
  assert.match(modal, /additional_amount > 0/);
  assert.doesNotMatch(modal, /Requires financial reconciliation/);
});
