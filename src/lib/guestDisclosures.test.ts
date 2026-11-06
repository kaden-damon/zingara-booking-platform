import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSeatingPreviewRecommendation,
  getGuestPaymentDisclosures,
  getGuestVenueInclusions,
  getSeatingPreviewTicketInclusion,
} from "./guestDisclosures.ts";

test("venue inclusions remain venue specific", () => {
  assert.deepEqual(getGuestVenueInclusions("cape-town"), [
    "Welcome drinks and canapés on arrival.",
    "A decadent 3 course dinner.",
    "2½-hour performance experience.",
  ]);
  assert.deepEqual(getGuestVenueInclusions("Johannesburg"), [
    "Welcome drink on arrival.",
    "A decadent 4 course dinner.",
    "2½-hour performance experience.",
  ]);
});

test("seating preview recommendation keeps spaces around dynamic text", () => {
  assert.equal(
    formatSeatingPreviewRecommendation("18/11/2026 · 18:00", "Golden Circle"),
    "You can also check 18/11/2026 · 18:00 for Golden Circle.",
  );
});

test("seating preview uses the approved venue-specific ticket inclusion", () => {
  assert.equal(
    getSeatingPreviewTicketInclusion("cape-town"),
    "Your ticket includes a welcome drink, a decadent 3-course dinner and a 2½-hour performance experience.",
  );
  assert.equal(
    getSeatingPreviewTicketInclusion("Johannesburg"),
    "Your ticket includes a welcome drink, a decadent 4-course dinner and a 2½-hour performance experience.",
  );
  assert.equal(getSeatingPreviewTicketInclusion(null), "");
});

test("payment notices distinguish outstanding balances from included gratuity", () => {
  const deposit = getGuestPaymentDisclosures({
    balanceOutstanding: 2_200,
    serviceFeeAmount: 687.5,
  });
  const fullyPaid = getGuestPaymentDisclosures({
    balanceOutstanding: 0,
    serviceFeeAmount: 0,
  });

  assert.match(deposit.join(" "), /outstanding ticket balance/);
  assert.match(deposit.join(" "), /included in the booking total/);
  assert.match(deposit.join(" "), /discounted seating and add-on subtotal/);
  assert.doesNotMatch(fullyPaid.join(" "), /outstanding ticket balance/);
  assert.doesNotMatch(fullyPaid.join(" "), /12\.5%/);
  assert.match(fullyPaid.join(" "), /payable at the venue/);
});

test("new online bookings disclose venue-paid gratuity", () => {
  const notices = getGuestPaymentDisclosures({
    gratuityPolicy: "pay-at-venue",
    serviceFeeAmount: 0,
  });

  assert.match(notices.join(" "), /Applicable gratuity/);
  assert.doesNotMatch(notices.join(" "), /included in the booking total/);
});
