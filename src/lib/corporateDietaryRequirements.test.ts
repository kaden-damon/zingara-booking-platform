import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getCorporateDietarySummary,
  getCorporateDietaryAddons,
  normalizeCorporateDietaryQuantities,
  validateCorporateDietaryRequirements,
} from "./corporateDietaryRequirements.ts";
import {
  getBookingAddonCatalogue,
  getPublicDietaryAddonCatalogue,
} from "./bookingAddons.ts";

test("Corporate dietary quantities validate every selected meal against guest count", () => {
  assert.deepEqual(validateCorporateDietaryRequirements(["Vegan", "Kosher"]), [
    "Vegan",
    "Kosher",
  ]);
  assert.throws(
    () => validateCorporateDietaryRequirements(["Unsupported meal"]),
    /invalid/,
  );
  assert.deepEqual(
    normalizeCorporateDietaryQuantities({
      dietaryRequirements: ["Vegetarian", "Strict Halaal", "Kosher"],
      guestCount: 40,
      quantities: { Kosher: 3, "Strict Halaal": 4, Vegetarian: 8 },
      requireSelectedQuantities: true,
    }),
    { Kosher: 3, "Strict Halaal": 4, Vegetarian: 8 },
  );
  assert.throws(
    () =>
      normalizeCorporateDietaryQuantities({
        dietaryRequirements: ["Kosher"],
        guestCount: 20,
        quantities: {},
        requireSelectedQuantities: true,
      }),
    /whole-number quantity for Kosher/,
  );
  assert.throws(
    () =>
      normalizeCorporateDietaryQuantities({
        dietaryRequirements: ["Vegetarian"],
        guestCount: 20,
        quantities: { Vegetarian: 21 },
        requireSelectedQuantities: true,
      }),
    /from 1 to 20/,
  );
});

test("authorised internal workflows expose dietary quantities at both venues without changing public Cape Town sales", () => {
  for (const venue of ["cape-town", "johannesburg"] as const) {
    const ids = getBookingAddonCatalogue(venue).map((addon) => addon.id);
    assert.ok(ids.includes("dietary-vegetarian"));
    assert.ok(ids.includes("dietary-strictly-halaal"));
    assert.ok(ids.includes("dietary-kosher"));
  }
  assert.deepEqual(getPublicDietaryAddonCatalogue("cape-town"), []);
  assert.equal(getPublicDietaryAddonCatalogue("johannesburg").length, 2);
});

test("Corporate conversion builds canonical restricted meals and a complete summary", () => {
  const request = {
    dietaryQuantities: {
      Kosher: 2,
      "Strict Halaal": 3,
      Vegan: 4,
      Vegetarian: 6,
    },
    dietaryRequirements: ["Vegetarian", "Vegan", "Strict Halaal", "Kosher"],
  };
  assert.equal(
    getCorporateDietarySummary(request),
    "Vegetarian: 6, Vegan: 4, Strictly Halaal: 3, Kosher: 2",
  );
  assert.deepEqual(getCorporateDietaryAddons(request), [
    {
      description: undefined,
      id: "dietary-vegetarian",
      kind: "catalogue",
      name: "Vegetarian",
      price: 0,
      pricingType: "operational",
      quantity: 6,
      unitPrice: 0,
    },
    {
      description: undefined,
      id: "dietary-vegan",
      kind: "catalogue",
      name: "Vegan",
      price: 0,
      pricingType: "operational",
      quantity: 4,
      unitPrice: 0,
    },
    {
      description: undefined,
      id: "dietary-strictly-halaal",
      kind: "catalogue",
      name: "Strictly Halaal",
      price: 750,
      pricingType: "priced",
      quantity: 3,
      unitPrice: 250,
    },
    {
      description: undefined,
      id: "dietary-kosher",
      kind: "catalogue",
      name: "Kosher",
      price: 1_000,
      pricingType: "priced",
      quantity: 2,
      unitPrice: 500,
    },
  ]);
});

test("legacy Corporate dietary choices remain explicit instead of inventing quantities", () => {
  const request = {
    dietaryRequirements: ["Vegetarian", "Strict Halaal"],
  };
  assert.equal(
    getCorporateDietarySummary(request),
    "Vegetarian: quantity not recorded, Strictly Halaal: quantity not recorded",
  );
  assert.deepEqual(getCorporateDietaryAddons(request), []);
});

test("Corporate submission and conversion enforce quantities on the server", async () => {
  const [submission, conversion, booking] = await Promise.all([
    readFile(new URL("../app/api/corporate-requests/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/admin/corporate-requests/convert/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(submission, /normalizeCorporateDietaryQuantities/);
  assert.match(submission, /requireSelectedQuantities: true/);
  assert.match(conversion, /authoritativeDietaryRequest/);
  assert.match(conversion, /getCorporateDietaryAddons/);
  assert.match(conversion, /operationalNotesWithoutDietary/);
  assert.match(booking, /!booking\.corporateRequestId/);
});
