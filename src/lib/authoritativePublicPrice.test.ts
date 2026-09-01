import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getAuthoritativePublicPricePerPerson } from "./authoritativePublicPrice.ts";

const configuredPrice = 1360;

test("one guest pays the configured zone price", () => {
  assert.equal(
    getAuthoritativePublicPricePerPerson({ configuredPrice, partySize: 1 }),
    configuredPrice,
  );
});

test("eight guests do not receive an automatic group discount", () => {
  assert.equal(
    getAuthoritativePublicPricePerPerson({ configuredPrice, partySize: 8 }),
    configuredPrice,
  );
});

test("larger groups continue to pay the configured zone price", () => {
  assert.equal(
    getAuthoritativePublicPricePerPerson({ configuredPrice, partySize: 24 }),
    configuredPrice,
  );
});

test("low availability does not increase the configured zone price", () => {
  assert.equal(
    getAuthoritativePublicPricePerPerson({
      configuredPrice,
      partySize: 4,
      remainingSeats: 4,
    }),
    configuredPrice,
  );
});

test("promo discounts remain a separate pricing step", async () => {
  const pricingSource = await readFile(
    new URL("./pricing.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    pricingSource,
    /const discountAmount = Math\.min\(input\.promo\?\.discountAmount \?\? 0, subtotal\)/,
  );
  assert.match(
    pricingSource,
    /const discountedSubtotal = Math\.max\(subtotal - discountAmount, 0\)/,
  );
});

test("public checkout contains no dynamic-rate pricing or copy", async () => {
  const [pricingSource, pageSource] = await Promise.all([
    readFile(new URL("./pricing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/book/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(pricingSource, /getDynamicPriceMultiplier|1\.12|0\.95/);
  assert.doesNotMatch(pageSource, /Dynamic rate|getDynamicPriceMultiplier/);
});
