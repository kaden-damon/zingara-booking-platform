import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getComplimentarySubmissionEligibility } from "./complimentarySubmission.ts";

const validInput = {
  customerDetailsComplete: true,
  hasAcceptedTerms: true,
  hasAvailableCapacity: true,
  hasSelectedShow: true,
  hasSelectedZone: true,
  isBookingSubmitting: false,
  isShowLockReady: true,
  isTrustedStaff: true,
};

test("valid complimentary booking enables submission without payment state", () => {
  assert.deepEqual(getComplimentarySubmissionEligibility(validInput), {
    allowed: true,
    reason: "",
  });
});

test("missing required customer details disables complimentary submission", () => {
  const result = getComplimentarySubmissionEligibility({
    ...validInput,
    customerDetailsComplete: false,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /customer details/i);
});

test("unaccepted terms disable complimentary submission", () => {
  const result = getComplimentarySubmissionEligibility({
    ...validInput,
    hasAcceptedTerms: false,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /Royal Decrees/i);
});

test("show, zone, capacity, lock, and staff authority remain required", () => {
  for (const field of [
    "hasSelectedShow",
    "hasSelectedZone",
    "hasAvailableCapacity",
    "isShowLockReady",
    "isTrustedStaff",
  ] as const) {
    assert.equal(
      getComplimentarySubmissionEligibility({
        ...validInput,
        [field]: false,
      }).allowed,
      false,
      field,
    );
  }
});

test("duplicate complimentary submission remains guarded", () => {
  const result = getComplimentarySubmissionEligibility({
    ...validInput,
    isBookingSubmitting: true,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /already being created/i);
});

test("page uses complimentary eligibility without payment-option or payment-link gates", async () => {
  const page = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );
  const eligibilityStart = page.indexOf(
    "getComplimentarySubmissionEligibility({",
  );
  const eligibilityEnd = page.indexOf("    });", eligibilityStart);
  const eligibilityCall = page.slice(eligibilityStart, eligibilityEnd + 7);

  assert.ok(eligibilityStart > 0 && eligibilityEnd > eligibilityStart);
  assert.doesNotMatch(eligibilityCall, /paymentOption/);
  assert.doesNotMatch(eligibilityCall, /isManualPaymentLinkCreating/);
  assert.match(page, /complimentarySubmissionEligibility\.allowed/);
  assert.match(page, /complimentarySubmissionEligibility\.reason/);
});

test("standard and Friends & Family retain their existing checkout guard", async () => {
  const page = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /isComplimentary[\s\S]*?complimentarySubmissionEligibility\.allowed[\s\S]*?!selectedShow[\s\S]*?isManualPaymentLinkCreating/,
  );
});

test("public complimentary requests remain forbidden before persistence", async () => {
  const route = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /isComplimentaryBooking\(booking\) && !isTrustedStaff/);
  assert.match(route, /status: 403/);
});
