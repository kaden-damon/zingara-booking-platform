import assert from "node:assert/strict";
import test from "node:test";
import { mergeAdminBookingState } from "./adminBookingStateMerge.ts";
import { lifecycleEventKey, sameLifecycleHistory } from "./bookingLifecycleComparison.ts";
import type { BookingLifecycleEvent, DemoBooking } from "./zingaraDemo";

const stored: BookingLifecycleEvent = {
  id: "metadata-event", createdAt: "2026-11-06T12:31:41.940Z",
  fromStatus: "new", toStatus: "pending-payment", note: "Awaiting payment",
};
const hydrated: BookingLifecycleEvent = {
  createdAt: "2026-11-06T12:31:41.94+00:00", fromStatus: "new",
  id: "database-event", note: "Awaiting payment", toStatus: "pending-payment",
};

for (const paid of [36000, 10000]) {
  test(`status-only confirmation preserves ${paid} paid and rejects no equivalent lifecycle data`, () => {
    const authoritative = {
      reference: "FIXTURE", status: "pending-payment", updatedAt: "same",
      totalPrice: 36000, amountPaid: paid, balanceDue: 36000 - paid,
      paymentStatus: paid === 36000 ? "fully-paid" : "deposit-paid",
      partySize: 20, tableNumber: "314", communicationHistory: [],
      lifecycleHistory: [stored],
    } as unknown as DemoBooking;
    // Also accepts the duplicate projection returned to already-open pre-fix tabs.
    const previous = { ...authoritative, lifecycleHistory: [hydrated, stored] };
    const event: BookingLifecycleEvent = {
      id: "confirmed", createdAt: "2026-11-18T09:21:22.000Z",
      fromStatus: "pending-payment", toStatus: "confirmed",
      note: "Status changed to Confirmed.",
    };
    const requested = { ...previous, status: "confirmed" as const, lifecycleHistory: [event, ...previous.lifecycleHistory] };
    const inputSnapshot = JSON.stringify({ previous, authoritative, requested });
    const result = mergeAdminBookingState({ previous, authoritative, requested });
    assert.deepEqual(result.conflictingFields, []);
    assert.deepEqual(result.financialFields, []);
    assert.equal(result.mergedBooking.status, "confirmed");
    assert.equal(result.mergedBooking.amountPaid, paid);
    assert.equal(result.mergedBooking.balanceDue, 36000 - paid);
    assert.equal(result.mergedBooking.paymentStatus, authoritative.paymentStatus);
    assert.equal(result.mergedBooking.tableNumber, "314");
    assert.deepEqual(result.mergedBooking.communicationHistory, []);
    assert.equal(result.mergedBooking.lifecycleHistory.filter(x => x.toStatus === "confirmed").length, 1);
    assert.equal(result.mergedBooking.lifecycleHistory.length, 2);
    assert.deepEqual(result.mergedBooking.lifecycleHistory[1], stored);
    assert.equal(JSON.stringify({ previous, authoritative, requested }), inputSnapshot);
  });
}

test("lifecycle identity normalises projection only, retaining notes, status and timestamp precision", () => {
  assert.equal(lifecycleEventKey(stored), lifecycleEventKey(hydrated));
  assert.equal(sameLifecycleHistory([stored], [hydrated, stored]), true);
  assert.equal(sameLifecycleHistory([stored], [{ ...hydrated, note: "Changed evidence" }]), false);
  assert.equal(sameLifecycleHistory([stored], [{ ...hydrated, toStatus: "cancelled" }]), false);
  assert.equal(sameLifecycleHistory([stored], [{ ...hydrated, createdAt: "2026-11-06T12:31:41.940001Z" }]), false);
  assert.equal(sameLifecycleHistory([stored], []), false);
});

test("actual concurrent status and history changes still block confirmation", () => {
  const previous = { status: "pending-payment", lifecycleHistory: [hydrated] } as DemoBooking;
  const requested = { ...previous, status: "confirmed" as const, lifecycleHistory: [...previous.lifecycleHistory, { ...stored, id: "new", toStatus: "confirmed" as const }] };
  const authoritative = { ...previous, status: "cancelled" as const, lifecycleHistory: [{ ...stored, note: "Changed concurrently" }] };
  const result = mergeAdminBookingState({ authoritative, previous, requested });
  assert.deepEqual(result.conflictingFields.sort(), ["lifecycleHistory", "status"]);
  assert.equal(result.mergedBooking.status, "cancelled");
  assert.deepEqual(result.mergedBooking.lifecycleHistory, authoritative.lifecycleHistory);
});
