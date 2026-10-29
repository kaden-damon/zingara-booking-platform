import assert from "node:assert/strict";
import test from "node:test";

import {
  getInternalShowBookingDecision,
  isInternalShowApprovalReasonValid,
  normalizeInternalShowApprovalReason,
} from "./internalShowBookingPolicy.ts";

test("open, sold out and ordinary closed shows allow internal booking", () => {
  assert.equal(getInternalShowBookingDecision({ status: "active" }).allowed, true);
  assert.equal(getInternalShowBookingDecision({ status: "sold_out" }).allowed, true);
  assert.equal(getInternalShowBookingDecision({ status: "inactive" }).allowed, true);
  assert.match(
    getInternalShowBookingDecision({ status: "sold-out" }).label,
    /INTERNAL BOOKINGS ALLOWED/,
  );
});

test("blackout, venue closure, archived and unknown statuses fail closed", () => {
  for (const status of ["blackout", "venue_closure", "archived", "cancelled"]) {
    assert.equal(getInternalShowBookingDecision({ status }).allowed, false);
  }
});

test("special events and active buyouts require management approval", () => {
  assert.equal(
    getInternalShowBookingDecision({ status: "special_event" })
      .requiresManagementApproval,
    true,
  );
  assert.equal(
    getInternalShowBookingDecision({ hasActiveBuyout: true, status: "active" })
      .requiresManagementApproval,
    true,
  );
});

test("approval reasons are bounded and non-empty", () => {
  assert.equal(isInternalShowApprovalReasonValid("  Approved by management  "), true);
  assert.equal(isInternalShowApprovalReasonValid("no"), false);
  assert.equal(normalizeInternalShowApprovalReason("x".repeat(600)).length, 500);
});
