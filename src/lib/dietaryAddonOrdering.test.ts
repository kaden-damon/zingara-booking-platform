import assert from "node:assert/strict";
import test from "node:test";

import type { BookingAddon } from "./zingaraDemo.ts";
import {
  dietaryAddonCutoffErrorCode,
  enforceDietaryAddonOrdering,
  getDietaryAddonOrderingState,
  validateDietaryAddonChange,
} from "./dietaryAddonOrdering.ts";

const kosher = (quantity: number): BookingAddon => ({
  id: "dietary-kosher",
  kind: "catalogue",
  name: "Kosher",
  price: 500 * quantity,
  pricingType: "priced",
  quantity,
  unitPrice: 500,
});

const performance = { date: "2026-11-10", time: "19:30:00" };
const cutoff = new Date("2026-11-07T17:30:00.000Z");

test("dietary meals are available before and exactly at the 72-hour cutoff", () => {
  assert.equal(getDietaryAddonOrderingState({ ...performance, now: new Date(cutoff.getTime() - 1) }).isOrderable, true);
  assert.equal(getDietaryAddonOrderingState({ ...performance, now: cutoff }).isOrderable, true);
});

test("new or increased restricted meals are rejected inside 72 hours", () => {
  const now = new Date(cutoff.getTime() + 1);
  for (const input of [
    { existingAddons: [], requestedAddons: [kosher(1)] },
    { existingAddons: [kosher(1)], requestedAddons: [kosher(2)] },
  ]) {
    assert.throws(
      () => validateDietaryAddonChange({ ...performance, ...input, now }),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { code?: string }).code === dietaryAddonCutoffErrorCode,
    );
  }
});

test("existing dietary orders can remain, reduce or be removed inside 72 hours", () => {
  const now = new Date(cutoff.getTime() + 1);
  for (const requestedAddons of [[kosher(2)], [kosher(1)], []]) {
    assert.doesNotThrow(() =>
      validateDietaryAddonChange({
        ...performance,
        existingAddons: [kosher(2)],
        now,
        requestedAddons,
      }),
    );
  }
});

test("server enforcement removes only unavailable new meals without blocking the booking", () => {
  const now = new Date(cutoff.getTime() + 1);
  const operationalAddon: BookingAddon = {
    id: "decor-candles",
    kind: "catalogue",
    name: "Candles",
    price: 0,
    pricingType: "operational",
    quantity: 1,
    unitPrice: 0,
  };
  const result = enforceDietaryAddonOrdering({
    ...performance,
    now,
    requestedAddons: [kosher(1), operationalAddon],
  });
  assert.equal(result.restricted, true);
  assert.deepEqual(result.addons, [operationalAddon]);
});

test("server enforcement preserves the existing meal quantity when an edit tries to increase it", () => {
  const result = enforceDietaryAddonOrdering({
    ...performance,
    existingAddons: [kosher(2)],
    now: new Date(cutoff.getTime() + 1),
    requestedAddons: [kosher(3)],
  });
  assert.equal(result.restricted, true);
  assert.deepEqual(result.addons, [kosher(2)]);
});
