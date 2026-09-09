import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getBookingSeatingEligibility,
  getStandardBookingZoneGuestLimits,
  isStandardBookingZoneGuestCountAllowed,
  supportsMultiTableBookingFulfilment,
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

test("single-unit products retain their configured group-size safeguard", () => {
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

test("Standard Private Booth bookings can exceed one booth while Corporate routing remains intact", () => {
  for (const partySize of [4, 6, 8, 12, 18]) {
    assert.equal(
      isStandardBookingZoneGuestCountAllowed("royal-booths", partySize),
      true,
    );
  }

  for (const partySize of [3, 20, 24]) {
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

test("Private Booth booking eligibility uses zone capacity instead of one-table capacity", () => {
  const limits = getStandardBookingZoneGuestLimits("royal-booths", {
    maxGuests: 20,
    minGuests: 2,
  });
  for (const partySize of [4, 6, 12, 18, 24]) {
    const result = getBookingSeatingEligibility({
      ...limits,
      partySize,
      remainingSeats: partySize,
      supportsMultiTableFulfilment:
        supportsMultiTableBookingFulfilment("royal-booths"),
    });
    assert.equal(result.isAvailable, true);
  }

  const insufficient = getBookingSeatingEligibility({
    ...limits,
    partySize: 18,
    remainingSeats: 17,
    supportsMultiTableFulfilment: true,
  });
  assert.equal(insufficient.isAvailable, false);
  assert.equal(
    insufficient.availabilityMessage,
    "Not Enough Seats Available",
  );
});

test("only operational multi-table zones bypass a single-unit maximum", () => {
  for (const zoneId of [
    "golden-circle",
    "middle-ring",
    "royal-booths",
    "royal-balcony",
  ]) {
    assert.equal(supportsMultiTableBookingFulfilment(zoneId), true);
  }
  assert.equal(supportsMultiTableBookingFulfilment("elevated-stage"), false);
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
