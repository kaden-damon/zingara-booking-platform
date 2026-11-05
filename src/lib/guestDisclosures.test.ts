import assert from "node:assert/strict";
import test from "node:test";

import {
  getGuestPaymentDisclosures,
  getGuestVenueInclusions,
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
  assert.match(fullyPaid.join(" "), /Additional drinks/);
});
