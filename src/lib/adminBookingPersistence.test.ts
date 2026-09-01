import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { planAdminBookingMutations } from "./adminBookingPersistence.ts";
import type { DemoBooking } from "./zingaraDemo.ts";

function booking(reference: string): DemoBooking {
  return {
    bookingDate: "2026-09-13T18:00:00.000Z",
    communicationHistory: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    customer: { email: "guest@example.test", name: "Guest", phone: "" },
    partySize: 2,
    reference,
    status: "confirmed",
    tableId: "table-1",
    tableNumber: "101",
    totalPrice: 2640,
    pricePerPerson: 1320,
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
  };
}

test("one changed booking produces one targeted mutation", () => {
  const first = booking("DP-ONE");
  const second = booking("DP-TWO");
  const next = [first, { ...second, operationalNotes: "Updated" }];

  const mutations = planAdminBookingMutations([first, second], next);

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0]?.after.reference, "DP-TWO");
  assert.equal(mutations[0]?.customerChanged, false);
  assert.equal(mutations[0]?.paymentChanged, false);
  assert.equal(mutations[0]?.ticketChanged, false);
});

test("an unchanged cloned dataset produces no writes", () => {
  const current = [booking("DP-ONE"), booking("DP-TWO")];
  const cloned = current.map((value) => structuredClone(value));

  assert.deepEqual(planAdminBookingMutations(current, cloned), []);
});

test("linked side effects are planned only when their domain changes", () => {
  const current = booking("DP-ONE");
  const changed = {
    ...current,
    customer: { ...current.customer, phone: "0820000000" },
    paymentStatus: "deposit-paid" as const,
  };

  const [mutation] = planAdminBookingMutations([current], [changed]);

  assert.equal(mutation?.customerChanged, true);
  assert.equal(mutation?.paymentChanged, true);
  assert.equal(mutation?.ticketChanged, true);
  assert.equal(mutation?.communicationChanged, false);
});

test("Admin PATCH cannot recurse into the public booking route", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const patchHandler = route.slice(route.indexOf("export async function PATCH"));

  assert.match(patchHandler, /body\.action === "update-state"/);
  assert.doesNotMatch(patchHandler, /runBookingTransaction\(request, body\)/);
  assert.doesNotMatch(patchHandler, /new URL\("\/api\/bookings"/);
});

test("client persistence sends one request per supplied changed booking", async () => {
  const client = await readFile(
    new URL("./supabase/bookings.ts", import.meta.url),
    "utf8",
  );
  const saveHandler = client.slice(client.indexOf("export async function saveBookings"));

  assert.match(saveHandler, /action: "update-state"/);
  assert.doesNotMatch(saveHandler, /body: \{ booking \},\s+method: "PATCH"/);
});

test("direct booking table writes exclude RPC-only promo fields", async () => {
  const route = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const upsert = route.slice(
    route.indexOf("async function upsertBooking"),
    route.indexOf("function normalizeReservationClaims"),
  );

  assert.match(upsert, /delete tablePayload\.promo_code_id/);
  assert.match(upsert, /delete tablePayload\.promo_location/);
});
