import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  staffBookingStatusLabels,
  staffCapacityHelp,
  staffCapacityTerms,
  staffPaymentStatusLabels,
  staffShowStatusLabels,
} from "./staffPresentation.ts";

test("staff labels simplify presentation without collapsing distinct stored states", () => {
  assert.equal(staffBookingStatusLabels["pending-payment"], "Awaiting payment");
  assert.equal(staffPaymentStatusLabels["fully-paid"], "Paid");
  assert.equal(staffPaymentStatusLabels["comp-vip"], "Complimentary");
  assert.equal(staffShowStatusLabels.active, "Open");
  assert.equal(staffShowStatusLabels.blackout, "Booking blackout");
  assert.equal(staffShowStatusLabels.inactive, "Closed");
});

test("public and approved operational seating remain explicit", () => {
  assert.equal(staffCapacityTerms.baseCapacity, "Public seats");
  assert.equal(staffCapacityTerms.temporaryCapacity, "Extra seating");
  assert.match(staffCapacityHelp.temporaryCapacity, /Does not increase website availability/);
});
