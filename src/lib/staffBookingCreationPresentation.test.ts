import assert from "node:assert/strict";
import test from "node:test";

import {
  getStaffAvailabilityPresentation,
  staffBookingExtraSeatingHelp,
  staffBookingJourneyLabels,
} from "./staffBookingCreationPresentation.ts";

test("staff booking journeys use short consistent labels", () => {
  assert.deepEqual(staffBookingJourneyLabels.standard, [
    "Show",
    "Guests",
    "Seating",
    "Guest",
    "Review",
    "Created",
  ]);
  assert.deepEqual(staffBookingJourneyLabels.corporate, [
    "Show",
    "Guests",
    "Seating",
    "Company",
    "Review",
    "Created",
  ]);
});

test("staff availability explains operational seats without changing public capacity", () => {
  assert.deepEqual(
    getStaffAvailabilityPresentation({
      baseRemaining: 10,
      isCorporate: true,
      operationalRemaining: 33,
    }),
    {
      extraSeats: 23,
      extraSeatsLabel: "Includes 23 extra seats",
      label: "Corporate staff availability",
      seatsLabel: "33 seats available",
    },
  );
  assert.match(staffBookingExtraSeatingHelp, /does not increase website availability/);
});

test("staff availability never invents negative extra seating", () => {
  assert.equal(
    getStaffAvailabilityPresentation({
      baseRemaining: 12,
      isCorporate: false,
      operationalRemaining: 8,
    }).extraSeats,
    0,
  );
});
