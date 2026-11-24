import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGuestReductionBasis } from "./guestReductionServer.ts";
import { previewGuestReduction, type GuestReductionBasis } from "./guestReductionPolicy.ts";

const basis: GuestReductionBasis = {
  bookingKind: "corporate", guestCount: 12, ticketAmount: 19430,
  gratuityAmount: 0, barTabAmount: 0, otherAmount: 10, totalAmount: 19440,
  amountPaid: 19440, performanceDate: "2026-12-02", performanceTime: "17:00:00",
  blockedReason: "The Corporate quote must establish separate ticket and gratuity components before allocation.",
};

test("missing Corporate components explain recovery without inventing values or lifting the guard", async () => {
  let calls = 0;
  const client = { rpc: async (name: string, args: unknown) => {
    calls++;
    assert.equal(name, "booking_guest_reduction_basis");
    assert.deepEqual(args, { p_booking_id: "booking-id" });
    return { data: basis, error: null };
  } } as unknown as SupabaseClient;
  const result = await loadGuestReductionBasis(client, "booking-id");
  assert.equal(calls, 1);
  assert.match(result.blockedReason!, /^Confirm the invoice breakdown/);
  assert.equal(result.componentConfirmationRequired, true);
  assert.deepEqual({ ...result, componentConfirmationRequired: undefined, blockedReason: basis.blockedReason }, { ...basis, componentConfirmationRequired: undefined });
  assert.equal(previewGuestReduction(result, 11, "bar-credit", new Date("2026-11-24T10:00:00Z")), null);
  assert.notEqual(result, basis);
});

test("eligible bases and other restrictions remain unchanged", async () => {
  for (const blockedReason of [null, "Buyout: preserve fixed package", "An existing refund requires Accounts review."]) {
    const data = { ...basis, blockedReason };
    const client = { rpc: async () => ({ data, error: null }) } as unknown as SupabaseClient;
    assert.equal(await loadGuestReductionBasis(client, "booking-id"), data);
  }
});

test("database failures still propagate without retrying", async () => {
  const error = new Error("RPC unavailable");
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error }; } } as unknown as SupabaseClient;
  await assert.rejects(loadGuestReductionBasis(client, "booking-id"), error);
  assert.equal(calls, 1);
});
