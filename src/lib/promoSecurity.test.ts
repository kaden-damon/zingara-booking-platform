import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bookingPage = readFileSync(
  new URL("../app/book/page.tsx", import.meta.url),
  "utf8",
);
const publicValidationRoute = readFileSync(
  new URL("../app/api/promo-codes/validate/route.ts", import.meta.url),
  "utf8",
);
const adminPromoRoute = readFileSync(
  new URL("../app/api/admin/promo-codes/route.ts", import.meta.url),
  "utf8",
);
const pricingSource = readFileSync(new URL("./pricing.ts", import.meta.url), "utf8");

test("public booking bundle does not contain or fall back to a promo library", () => {
  assert.doesNotMatch(bookingPage, /legacyPromoCodes|getPromoCode\(/);
  assert.doesNotMatch(bookingPage, /COUNTESS10|ROYAL500|STAGE15/);
  assert.doesNotMatch(pricingSource, /COUNTESS10|ROYAL500|STAGE15/);
  assert.match(bookingPage, /promoValidationPreview\?\.status === "valid"/);
  assert.match(bookingPage, /:\s*0;\s*const discountedSubtotal/);
});

test("public validation returns one generic invalid response", () => {
  assert.match(publicValidationRoute, /promo\.status !== "valid"/);
  assert.match(publicValidationRoute, /description: null/);
  assert.match(publicValidationRoute, /status: "invalid"/);
  assert.doesNotMatch(publicValidationRoute, /status: promo\.status/);
  assert.match(publicValidationRoute, /description: "Promo code applied\."/);
});

test("public promo validation is rate limited without exposing a library", () => {
  assert.match(publicValidationRoute, /limit: 15/);
  assert.match(publicValidationRoute, /scope: "public_promo_validate_ip"/);
  assert.doesNotMatch(publicValidationRoute, /loadPromoCodesWithUsage/);
  assert.doesNotMatch(publicValidationRoute, /export async function GET/);
});

test("promo management remains authenticated and Super Admin restricted", () => {
  assert.match(adminPromoRoute, /requireActiveStaff\(request\)/);
  assert.match(adminPromoRoute, /isSuperAdminProfile\(auth\.staffProfile\)/);
  assert.match(adminPromoRoute, /action: "promo\.created"/);
  assert.match(adminPromoRoute, /"promo\.enabled"/);
  assert.match(adminPromoRoute, /"promo\.disabled"/);
  assert.match(adminPromoRoute, /"promo\.updated"/);
});

test("booking creation retains server-authoritative promo revalidation", () => {
  const bookingRoute = readFileSync(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(bookingRoute, /const promo = await validatePromoCode\(supabase/);
  assert.match(bookingRoute, /promo: promo\.status === "valid" \? promo : null/);
  assert.match(bookingRoute, /promoCodeId: promo\.status === "valid"/);
});
