import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getBookingSeatingEligibility } from "./bookingSeatingAvailability.ts";
import { resolvePublicZoneSalesState } from "./zoneSalesAvailability.ts";

const migrationUrl = new URL(
  "../../supabase/migrations/20260915143000_phase_41_2l_show_zone_sales_controls.sql",
  import.meta.url,
);

test("manual closure is distinct from capacity exhaustion", () => {
  assert.deepEqual(
    resolvePublicZoneSalesState({ publicSalesOpen: false, remainingSeats: 18 }),
    { isAvailable: false, reason: "manually-closed" },
  );
  assert.deepEqual(
    resolvePublicZoneSalesState({ publicSalesOpen: true, remainingSeats: 0 }),
    { isAvailable: false, reason: "capacity-full" },
  );
  assert.deepEqual(
    resolvePublicZoneSalesState({ publicSalesOpen: true, remainingSeats: 18 }),
    { isAvailable: true, reason: "available" },
  );
});

test("public seating eligibility respects manual closure and reopening", () => {
  const closed = getBookingSeatingEligibility({
    isPublicSalesOpen: false,
    maxGuests: 20,
    minGuests: 2,
    partySize: 4,
    remainingSeats: 18,
    supportsMultiTableFulfilment: true,
  });
  assert.equal(closed.isAvailable, false);
  assert.equal(closed.availabilityMessage, "Sold Out");

  const reopened = getBookingSeatingEligibility({
    isPublicSalesOpen: true,
    maxGuests: 20,
    minGuests: 2,
    partySize: 18,
    remainingSeats: 18,
    supportsMultiTableFulfilment: true,
  });
  assert.equal(reopened.isAvailable, true);

  const full = getBookingSeatingEligibility({
    isPublicSalesOpen: true,
    maxGuests: 20,
    minGuests: 2,
    partySize: 2,
    remainingSeats: 0,
  });
  assert.equal(full.isAvailable, false);
});

test("trusted Corporate eligibility is not converted into a public-sales lock", () => {
  const trusted = getBookingSeatingEligibility({
    isInternalCorporate: true,
    isPublicSalesOpen: true,
    maxGuests: 20,
    minGuests: 2,
    partySize: 30,
    remainingSeats: 30,
  });
  assert.equal(trusted.isAvailable, true);
  assert.equal(trusted.requiresFloorAssignment, true);
});

test("database state is show-zone scoped, atomic, audited and public-only", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /unique \(show_id, zone_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /STALE_ZONE_SALES_STATE/);
  assert.match(migration, /show\.zone-sales-closed/);
  assert.match(migration, /show\.zone-sales-reopened/);
  assert.match(migration, /new\.booking_source = 'online'/);
  assert.match(migration, /new\.booking_origin, ''\) = 'customer_public'/);
  assert.match(migration, /PUBLIC_ZONE_SALES_CLOSED/);
  assert.doesNotMatch(migration, /update public\.show_tables/i);
  assert.doesNotMatch(migration, /update public\.tickets/i);
});

test("public availability and booking creation share server-authoritative closure state", async () => {
  const [availabilityRoute, bookingRoute, component] = await Promise.all([
    readFile(new URL("../app/api/shows/availability/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ShowZoneSalesControls.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(availabilityRoute, /loadPublicShowAvailability/);
  assert.match(bookingRoute, /isPublicZoneSalesOpen/);
  assert.match(bookingRoute, /PUBLIC_ZONE_SALES_CLOSED/);
  assert.match(component, /Public Remaining/);
  assert.match(component, /Sold Out - Manually Closed/);
  assert.match(component, /Sold Out - Capacity Full/);
  assert.match(component, /Reopen Sales/);
});
