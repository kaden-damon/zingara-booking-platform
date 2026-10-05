import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGuestCountGrammar } from "./guestCountPresentation.ts";

test("one-guest communication copy uses singular grammar", () => {
  assert.equal(
    normalizeGuestCountGrammar("Your reservation is for 1 guests.", 1),
    "Your reservation is for 1 guest.",
  );
});

test("plural guest copy is unchanged for larger bookings", () => {
  assert.equal(
    normalizeGuestCountGrammar("Your reservation is for 2 guests.", 2),
    "Your reservation is for 2 guests.",
  );
});
