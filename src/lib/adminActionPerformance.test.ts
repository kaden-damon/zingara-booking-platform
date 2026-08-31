import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCorporateConversionGate } from "./corporateConversionGuard.ts";

test("corporate conversion is idempotent once a booking is linked", () => {
  assert.deepEqual(
    getCorporateConversionGate({
      archivedAt: undefined,
      guestCount: 12,
      linkedBookingReference: "ZNG-EXISTING",
      status: "converted",
    }),
    { bookingReference: "ZNG-EXISTING", outcome: "idempotent" },
  );
});

test("corporate conversion fails closed for invalid lifecycle state", () => {
  assert.equal(
    getCorporateConversionGate({
      archivedAt: undefined,
      guestCount: 12,
      linkedBookingReference: undefined,
      status: "quote-sent",
    }).outcome,
    "blocked",
  );
});

test("conversion route has no communication, PayFast, or refund action", async () => {
  const route = await readFile(
    new URL("../app/api/admin/corporate-requests/convert/route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(route, /sendStaffPushNotification|sendOperationalCustomerEmail/);
  assert.doesNotMatch(route, /payfast|refunds\//i);
  assert.match(route, /is\("linked_booking_reference", null\)/);
});

test("single-show route keeps lock enforcement and avoids full-set replacement", async () => {
  const route = await readFile(
    new URL("../app/api/admin/shows/route.ts", import.meta.url),
    "utf8",
  );
  const patchHandler = route.slice(route.indexOf("export async function PATCH"));

  assert.match(patchHandler, /ensureNoConflictingShowLocks/);
  assert.match(patchHandler, /\.eq\("id", beforeRow\.id\)/);
  assert.doesNotMatch(patchHandler, /for \(const show of shows\)/);
});

test("show save acknowledges immediately and never persists the full booking list", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const showsClient = await readFile(
    new URL("./supabase/shows.ts", import.meta.url),
    "utf8",
  );
  const handler = page.slice(
    page.indexOf("async function saveEditedShow"),
    page.indexOf("async function duplicateEditedShow"),
  );

  assert.ok(handler.indexOf('setShowSaveState("pending")') < handler.indexOf("await updateSingleShow"));
  assert.doesNotMatch(handler, /saveBookings\(/);
  assert.match(
    showsClient,
    /storeDemoShows\(nextShows, \{ notify: false \}\)/,
  );
  assert.match(page, /aria-busy=\{showSaveState === "pending"\}/);
  assert.match(page, /"Saved ✓"/);
  assert.match(page, /"Save Failed"/);
});

test("corporate conversion acknowledges immediately and waits for one guarded action", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const handler = page.slice(
    page.indexOf("async function convertCorporateRequestToBooking"),
    page.indexOf("function sendCorporatePaymentLink"),
  );

  assert.ok(
    handler.indexOf('setCorporateConversionActionState("pending")') <
      handler.indexOf("await convertCorporateRequest"),
  );
  assert.ok(
    handler.indexOf('setCorporateConversionActionState("pending")') <
      handler.indexOf("await getShowsWithTables"),
  );
  assert.match(handler, /tableShow: selectedConversionShow\.id/);
  assert.match(handler, /corporateConversionInFlightRef\.current\.has/);
  assert.doesNotMatch(handler, /saveBookings\(|saveCorporateRequests\(/);
  assert.doesNotMatch(handler, /createWorkflowCommunication/);
  assert.match(page, /"Booking Created ✓"/);
  assert.match(page, /corporateConversionStatusRequestId === request\.id/);
  assert.match(page, /aria-busy=\{corporateConversionActionState === "pending"\}/);
});

test("Corporate pending-payment bookings reuse atomic table reservation", async () => {
  const route = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    route,
    /booking\.source === "online" \|\| booking\.source === "corporate-direct"/,
  );
  assert.match(route, /reservePublicBookingAtomically/);
});
