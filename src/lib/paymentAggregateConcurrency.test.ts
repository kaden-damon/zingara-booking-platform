import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeAdminBookingState } from "./adminBookingStateMerge.ts";
import type { DemoBooking } from "./zingaraDemo.ts";

function booking(overrides: Partial<DemoBooking> = {}): DemoBooking {
  return {
    amountPaid: 21_420,
    balanceDue: 1_360,
    bookingDate: "2026-10-29T18:00:00.000Z",
    communicationHistory: [],
    createdAt: "2026-09-08T15:19:09.000Z",
    customer: { email: "guest@example.test", name: "Guest", phone: "" },
    lifecycleHistory: [],
    operationalNotes: "",
    partySize: 15,
    paymentStatus: "deposit-paid",
    pricePerPerson: 1_360,
    reference: "ZNG-Z4TS5A",
    source: "admin",
    status: "confirmed",
    tableId: "requires-floor-assignment",
    tableNumber: "Requires floor assignment",
    totalPrice: 22_780,
    updatedAt: "2026-09-10T08:29:41.000Z",
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    ...overrides,
  };
}

test("stale ordinary edit preserves a newer successful payment aggregate", () => {
  const previous = booking();
  const authoritative = booking({
    amountPaid: 22_780,
    balanceDue: 0,
    lastBookingAppliedAmount: 1_360,
    lastProviderGrossAmount: 1_370,
    lastTransactionFeeAmount: 10,
    paymentStatus: "fully-paid",
    transactionReference: "provider-transaction",
    updatedAt: "2026-09-10T08:31:57.000Z",
  });
  const requested = booking({ operationalNotes: "Dietary note" });
  const result = mergeAdminBookingState({ authoritative, previous, requested });

  assert.deepEqual(result.conflictingFields, []);
  assert.equal(result.mergedBooking.operationalNotes, "Dietary note");
  assert.equal(result.mergedBooking.amountPaid, 22_780);
  assert.equal(result.mergedBooking.balanceDue, 0);
  assert.equal(result.mergedBooking.paymentStatus, "fully-paid");
  assert.equal(result.mergedBooking.transactionReference, "provider-transaction");
});

test("generic financial changes are identified as payment-owned", () => {
  const previous = booking();
  const requested = booking({
    amountPaid: 22_780,
    balanceDue: 0,
    paymentStatus: "fully-paid",
  });
  const result = mergeAdminBookingState({
    authoritative: previous,
    previous,
    requested,
  });

  assert.deepEqual(result.financialFields.sort(), [
    "amountPaid",
    "balanceDue",
    "paymentStatus",
  ]);
});

test("a stale conflicting business edit is rejected", () => {
  const previous = booking({ status: "confirmed" });
  const authoritative = booking({
    status: "checked-in",
    updatedAt: "2026-09-10T09:00:00.000Z",
  });
  const requested = booking({ status: "completed" });
  const result = mergeAdminBookingState({ authoritative, previous, requested });

  assert.deepEqual(result.conflictingFields, ["status"]);
  assert.equal(result.mergedBooking.status, "checked-in");
});

test("ITN core consumes a snapshot-matched payment link atomically", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260916130000_phase_41_2o_payment_aggregate_concurrency.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.confirm_payfast_payment_core/);
  assert.match(migration, /metadata ->> 'amountPaidSnapshot'/);
  assert.match(migration, /metadata ->> 'totalAmountSnapshot'/);
  assert.match(migration, /metadata ->> 'checkoutAmount'/);
  assert.match(migration, /status = 'used'/);
  assert.match(migration, /used_at = coalesce\(used_at, v_now\)/);
  assert.match(migration, /already_confirmed/);
  assert.doesNotMatch(migration, /signature|merchant|source_ip/i);
});

test("Admin update contract carries the previous revision and protects payment fields", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/admin/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./supabase/bookings.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /mergeAdminBookingState/);
  assert.match(route, /code: "BOOKING_CHANGED"/);
  assert.match(route, /code: "PAYMENT_WORKFLOW_REQUIRED"/);
  assert.match(route, /\.eq\("updated_at", currentUpdatedAt\)/);
  assert.doesNotMatch(
    route.slice(
      route.indexOf("async function persistBookingStateUpdate"),
      route.indexOf("async function persistBookingMetadataUpdate"),
    ),
    /amount_paid: booking\.amountPaid|balance_outstanding: booking\.balanceDue|payment_status: toSupabasePaymentStatus\(booking\.paymentStatus\)/,
  );
  assert.match(client, /expectedUpdatedAt: previousBooking\?\.updatedAt/);
  assert.match(client, /previousBooking/);
});
