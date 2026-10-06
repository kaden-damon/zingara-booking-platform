import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getShowSpecificZonePrice,
  normalizeShowCustomPricing,
  resolveShowZonePrice,
} from "./showSpecificPricing.ts";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("enabled show pricing overrides only configured zones", () => {
  const show = {
    customPricing: {
      enabled: true,
      zonePrices: {
        "golden-circle": 1940,
        "middle-ring": 1760,
      },
    },
  };

  assert.equal(
    resolveShowZonePrice({ defaultPrice: 1540, show, zoneId: "golden-circle" }),
    1940,
  );
  assert.equal(
    resolveShowZonePrice({ defaultPrice: 1440, show, zoneId: "royal-booths" }),
    1440,
  );
});

test("disabled show pricing falls back to the venue price", () => {
  const show = {
    customPricing: {
      enabled: false,
      zonePrices: { "golden-circle": 1940 },
    },
  };

  assert.equal(getShowSpecificZonePrice(show, "golden-circle"), null);
  assert.equal(
    resolveShowZonePrice({ defaultPrice: 1540, show, zoneId: "golden-circle" }),
    1540,
  );
});

test("custom prices are normalized to currency precision and invalid values are ignored", () => {
  assert.deepEqual(
    normalizeShowCustomPricing({
      enabled: true,
      zonePrices: {
        "golden-circle": 1940.125,
        "middle-ring": -1,
      },
    }),
    {
      enabled: true,
      updatedAt: undefined,
      zonePrices: { "golden-circle": 1940.13 },
    },
  );
});

test("booking creation resolves show pricing server-side and preserves explicit staff precedence", async () => {
  const route = await source("../app/api/bookings/route.ts");

  assert.match(route, /loadShowCustomPricing\(supabase, show\.id\)/);
  assert.match(route, /resolvedPriceSource = "show-specific"/);
  assert.match(route, /staffPricingRate \?\? customPricedTemporaryTable\?\.customPricePerPerson/);
  assert.match(route, /BOOKING_PRICE_CHANGED/);
});

test("the database stores one atomic, audited configuration per show", async () => {
  const migration = await source(
    "../../supabase/migrations/20261006143000_phase_46_4_show_specific_pricing.sql",
  );

  assert.match(migration, /show_id uuid primary key references public\.shows/);
  assert.match(migration, /set_show_custom_pricing_atomic/);
  assert.match(migration, /permission\.key = 'settings:manage'/);
  assert.match(migration, /STALE_SHOW_PRICING_STATE/);
  assert.match(migration, /show\.custom-pricing-(enabled|updated|disabled)/);
  assert.match(migration, /existing booking financial snapshots remain unchanged/i);
});

test("public and staff display use the same show price resolver", async () => {
  const [page, publicShows, adminShows] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/shows/route.ts"),
    source("../app/api/admin/shows/route.ts"),
  ]);

  assert.match(page, /resolveShowZonePrice/);
  assert.match(page, /getDisplayedZonePrice\(selectedZone\)/);
  assert.match(publicShows, /loadShowCustomPricingMap/);
  assert.match(adminShows, /loadShowCustomPricingMap/);
});

test("NYE fixture prices are isolated by show and zone", () => {
  const capeTownNye = {
    customPricing: {
      enabled: true,
      zonePrices: {
        "golden-circle": 1940,
        "middle-ring": 1760,
        "royal-balcony": 1650,
        "royal-booths": 1840,
      },
    },
  };
  const ordinaryShow = { customPricing: undefined };

  assert.equal(resolveShowZonePrice({ defaultPrice: 1250, show: capeTownNye, zoneId: "royal-balcony" }), 1650);
  assert.equal(resolveShowZonePrice({ defaultPrice: 1360, show: capeTownNye, zoneId: "middle-ring" }), 1760);
  assert.equal(resolveShowZonePrice({ defaultPrice: 1440, show: capeTownNye, zoneId: "royal-booths" }), 1840);
  assert.equal(resolveShowZonePrice({ defaultPrice: 1540, show: capeTownNye, zoneId: "golden-circle" }), 1940);
  assert.equal(resolveShowZonePrice({ defaultPrice: 1540, show: ordinaryShow, zoneId: "golden-circle" }), 1540);
});
