import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getBookingSeatingEligibility,
  getStandardBookingZoneGuestLimits,
  isStandardBookingZoneGuestCountAllowed,
} from "./bookingSeatingAvailability.ts";

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

test("Standard Private Booths accept exactly 4 through 8 guests", () => {
  for (const partySize of [4, 6, 7, 8]) {
    assert.equal(
      isStandardBookingZoneGuestCountAllowed("royal-booths", partySize),
      true,
    );
  }

  for (const partySize of [3, 9]) {
    assert.equal(
      isStandardBookingZoneGuestCountAllowed("royal-booths", partySize),
      false,
    );
  }

  assert.deepEqual(
    getStandardBookingZoneGuestLimits("royal-booths", {
      maxGuests: 20,
      minGuests: 2,
    }),
    { maxGuests: 8, minGuests: 4 },
  );
});

test("Private Booth eligibility still enforces live capacity", () => {
  const limits = getStandardBookingZoneGuestLimits("royal-booths", {
    maxGuests: 20,
    minGuests: 2,
  });
  const result = getBookingSeatingEligibility({
    ...limits,
    partySize: 8,
    remainingSeats: 7,
  });

  assert.equal(result.isAvailable, false);
  assert.equal(result.availabilityMessage, "Not Enough Seats Available");
});

test("Corporate zone entitlement is unaffected by the Standard Booth rule", () => {
  const result = getBookingSeatingEligibility({
    isInternalCorporate: true,
    maxGuests: 8,
    minGuests: 4,
    partySize: 60,
    remainingSeats: 100,
  });

  assert.equal(result.isAvailable, true);
  assert.equal(result.requiresFloorAssignment, true);
});
