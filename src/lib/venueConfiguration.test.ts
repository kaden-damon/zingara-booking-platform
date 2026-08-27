import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateConfiguredDeposit,
  defaultVenueSettings,
  getConfiguredZoneMaxSeats,
  getConfiguredZoneMaxTables,
  getZoneById,
  normalizeVenueSettings,
} from "./zingaraDemo";

test("uses the fixed per-person deposit by default", () => {
  const zone = getZoneById("middle-ring")!;

  assert.equal(
    calculateConfiguredDeposit(defaultVenueSettings, zone, 2640, 2),
    1100,
  );
});

test("uses percentage mode exclusively when configured", () => {
  const zone = getZoneById("middle-ring")!;
  const settings = normalizeVenueSettings({
    ...defaultVenueSettings,
    zonePricing: {
      ...defaultVenueSettings.zonePricing,
      [zone.id]: {
        ...defaultVenueSettings.zonePricing[zone.id],
        depositAmount: 550,
        depositMode: "percentage",
        depositPercentage: 35,
      },
    },
  });

  assert.equal(calculateConfiguredDeposit(settings, zone, 2640, 2), 924);
});

test("normalizes legacy settings without overwriting their stored values", () => {
  const zone = getZoneById("golden-circle")!;
  const settings = normalizeVenueSettings({
    zonePricing: {
      [zone.id]: { depositPercentage: 40, price: 1540 },
    },
  } as Partial<typeof defaultVenueSettings>);

  assert.equal(settings.zonePricing[zone.id]?.price, 1540);
  assert.equal(getConfiguredZoneMaxSeats(settings, zone), 148);
  assert.equal(getConfiguredZoneMaxTables(settings, zone), 24);
});
