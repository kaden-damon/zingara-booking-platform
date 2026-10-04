import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getBookingSeatingEligibility } from "./bookingSeatingAvailability.ts";
import { resolveZoneCapacityState } from "./capacityModel.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public and authorised internal bookings use distinct authoritative ceilings", () => {
  const state = resolveZoneCapacityState({
    baseCapacity: 125,
    bookings: [{
      partySize: 115,
      status: "confirmed",
      zoneId: "golden-circle",
    }],
    showId: "cpt-27-nov",
    tables: [{
      availabilityScope: "operational",
      capacityConfigured: true,
      id: "table-506",
      isOverride: true,
      physicalTable: false,
      seatCapacity: 23,
      showId: "cpt-27-nov",
      status: "available",
      zoneId: "golden-circle",
    }],
    zoneId: "golden-circle",
  });

  assert.equal(state.baseSellableRemaining, 10);
  assert.equal(state.temporaryCapacity, 23);
  assert.equal(state.effectiveOperationalCapacity, 148);
  assert.equal(state.operationalRemaining, 33);

  assert.equal(getBookingSeatingEligibility({
    isInternalCorporate: false,
    maxGuests: 125,
    minGuests: 1,
    partySize: 23,
    remainingSeats: state.baseSellableRemaining,
    supportsMultiTableFulfilment: true,
  }).isAvailable, false);
  assert.equal(getBookingSeatingEligibility({
    isInternalCorporate: true,
    maxGuests: 125,
    minGuests: 1,
    partySize: 23,
    remainingSeats: state.operationalRemaining,
    supportsMultiTableFulfilment: true,
  }).isAvailable, true);
});

test("operational availability is staff-authenticated and wired into internal checkout", async () => {
  const [route, availability, page, presentation, bookingRoute, guard] = await Promise.all([
    source("../app/api/shows/availability/route.ts"),
    source("./supabase/publicShowAvailability.ts"),
    source("../app/book/page.tsx"),
    source("./staffBookingCreationPresentation.ts"),
    source("../app/api/bookings/route.ts"),
    source("../../supabase/migrations/20260925130000_phase_41_2x_p0_b_financial_only_capacity_guard.sql"),
  ]);

  assert.match(route, /capacityScope === "operational"/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /includes\("bookings:manage"\)/);
  assert.match(availability, /options\.capacityScope === "operational"/);
  assert.match(availability, /operationalRemaining/);
  assert.match(availability, /baseSellableRemaining/);
  assert.match(page, /manualCheckoutRole !== "none"\s*\? "operational"\s*: "base"/);
  assert.match(page, /remainingSeatsByZone\[option\.id\]/);
  assert.match(page, /getStaffAvailabilityPresentation/);
  assert.match(presentation, /Corporate staff availability/);
  assert.match(presentation, /operationalRemaining/);
  assert.match(bookingRoute, /capacityScope: isTrustedStaff \? "operational" : "base"/);
  assert.match(guard, /booking_origin = 'customer_public'[\s\S]*booking_source = 'online'[\s\S]*booking_capacity_zone_limit/);
  assert.match(guard, /else\s+v_limit := public\.booking_capacity_zone_effective_limit/);
});

test("public availability remains base-capped and cannot request operational capacity anonymously", async () => {
  const [route, page, presentation] = await Promise.all([
    source("../app/api/shows/availability/route.ts"),
    source("../app/book/page.tsx"),
    source("./staffBookingCreationPresentation.ts"),
  ]);

  assert.match(route, /capacityScope = searchParams\.get\("capacityScope"\) === "operational"/);
  assert.match(route, /return auth\.error/);
  assert.match(page, /manualCheckoutRole !== "none"/);
  assert.match(page, /: "base"/);
  assert.match(page, /availability\.remainingSeats\} Seats Available/);
  assert.match(presentation, /baseRemaining/);
  assert.match(
    presentation,
    /does not increase website availability/,
  );
});
