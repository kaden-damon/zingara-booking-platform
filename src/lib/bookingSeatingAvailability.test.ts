import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getBookingSeatingEligibility } from "./bookingSeatingAvailability";

const middleRing = {
  maxGuests: 20,
  minGuests: 2,
  partySize: 65,
};

test("internal Corporate booking uses fixed zone entitlement, not public group ceiling", () => {
  const result = getBookingSeatingEligibility({
    ...middleRing,
    isInternalCorporate: true,
    remainingSeats: 72,
  });

  assert.equal(result.isAvailable, true);
  assert.equal(result.requiresFloorAssignment, true);
  assert.equal(
    result.availabilityMessage,
    "Available - Floor Assignment Required",
  );
});

test("internal Corporate booking remains blocked by zone capacity", () => {
  const result = getBookingSeatingEligibility({
    ...middleRing,
    isInternalCorporate: true,
    remainingSeats: 64,
  });

  assert.equal(result.isAvailable, false);
  assert.equal(result.availabilityMessage, "Not Enough Seats Available");
});

test("public and Standard bookings retain the public party-size safeguard", () => {
  const result = getBookingSeatingEligibility({
    ...middleRing,
    remainingSeats: 72,
  });

  assert.equal(result.isAvailable, false);
  assert.equal(result.availabilityMessage, "Not Available For This Group Size");
});

test("explicit Corporate table assignment does not enter Floor Assignment", () => {
  const result = getBookingSeatingEligibility({
    ...middleRing,
    hasExplicitTableAssignment: true,
    isInternalCorporate: true,
    remainingSeats: 72,
  });

  assert.equal(result.isAvailable, true);
  assert.equal(result.requiresFloorAssignment, false);
});

test("Corporate booking creation keeps authoritative server capacity enforcement", async () => {
  const route = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /validateBookingCapacityIncrease/);
  assert.match(route, /reservePublicBookingAtomically/);
  assert.match(route, /reserve_public_booking_entitlement/);
});
