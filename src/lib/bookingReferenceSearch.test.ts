import assert from "node:assert/strict";
import test from "node:test";

import { isExactBookingReferenceSearch } from "./bookingReferenceSearch.ts";

test("exact booking references match case-insensitively without fuzzy bypass", () => {
  assert.equal(isExactBookingReferenceSearch("ZNG-7KMG8P", "ZNG-7KMG8P"), true);
  assert.equal(isExactBookingReferenceSearch(" zng-7kmg8p ", "ZNG-7KMG8P"), true);
  assert.equal(isExactBookingReferenceSearch("7KMG8P", "ZNG-7KMG8P"), false);
  assert.equal(isExactBookingReferenceSearch("Chanel", "ZNG-7KMG8P"), false);
  assert.equal(isExactBookingReferenceSearch("", "ZNG-7KMG8P"), false);
});

