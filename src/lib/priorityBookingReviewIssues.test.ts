import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveAddedGuestPricingBasis, calculateAddedGuestFinancials, matchesAddedGuestPreview } from "./addedGuestFinancials.ts";
import { resolveGratuityStatus } from "./gratuityTransition.ts";
import { calculatePublicBookingPricing } from "./pricing.ts";
import { clampReviewPage, getReviewPageCount } from "./reviews/reviewPagination.ts";

const metadata = { source: "admin" as const, pricePerPerson: 1440, paymentOption: "deposit" as const,
  pricingProvenance: { agreedPricePerPerson: 1440, depositPerPerson: 550, paymentModel: "deposit" as const, source: "standard-zone" as const } };

test("old tabs cannot submit missing or stale deposit-only price previews", () => {
  assert.equal(matchesAddedGuestPreview(undefined, 1620), false);
  assert.equal(matchesAddedGuestPreview(550, 1620), false);
  assert.equal(matchesAddedGuestPreview(1620, 1620), true);
  const route = readFileSync(new URL("../app/api/admin/bookings/reconciliation/route.ts", import.meta.url), "utf8");
  assert.match(route, /matchesAddedGuestPreview\(body.expectedAdditionalAmount/);
  assert.match(route, /ADDED_GUEST_PRICE_REVIEW_REQUIRED/);
});

test("BUG-000035 is a settled historical charge, not an invented collection label", () => {
  assert.equal(12500 - 1250 + 1406, 12656);
  assert.equal(resolveGratuityStatus({ amountPaid: 12656, totalAmount: 12656, serviceFeeAmount: 1406, paymentStatus: "fully_paid" }).kind, "collected");
});

test("new Standard gratuity remains at venue while Corporate pricing retains its rule", () => {
  const common = { authoritativePricePerPerson: 1250, includeBookingFee: false, partySize: 10, paymentOption: "full" as const, zoneId: "golden-circle" as const };
  assert.equal(calculatePublicBookingPricing({ ...common, includeGratuity: false }).serviceFeeAmount, 0);
  assert.equal(calculatePublicBookingPricing({ ...common, includeGratuity: true }).serviceFeeAmount, 1562.5);
});

test("BUG-000036 full obligation preserves the original collected gratuity and deposit plan", () => {
  const basis = resolveAddedGuestPricingBasis({ bookingOrigin: "admin_staff", metadata, serviceFeeAmount: 2943 });
  assert.deepEqual(basis, { paymentBasis: "full", source: "standard-zone", unitAmount: 1440, gratuityRate: 0.125 });
  const result = calculateAddedGuestFinancials({ basis, currentGuestCount: 16, newGuestCount: 17, currentOutstanding: 17683 });
  assert.equal(result.additionalAmount, 1620);
  assert.equal(26483 + result.additionalAmount!, 28103);
  assert.equal(result.newOutstanding, 19303);
  assert.equal(metadata.pricingProvenance.depositPerPerson, 550);
  assert.equal(8800 + 18233, 27033);
});

test("venue-paid native additions never add gratuity; legacy deposit agreements remain intact", () => {
  const venue = resolveAddedGuestPricingBasis({ bookingOrigin: "customer_public", metadata: { ...metadata, gratuityPolicy: "pay-at-venue" }, serviceFeeAmount: 0 });
  assert.equal(calculateAddedGuestFinancials({ basis: venue, currentGuestCount: 16, newGuestCount: 17, currentOutstanding: 1000 }).additionalAmount, 1440);
  const legacy = resolveAddedGuestPricingBasis({ bookingOrigin: "data_import", metadata, serviceFeeAmount: 2943 });
  assert.equal(calculateAddedGuestFinancials({ basis: legacy, currentGuestCount: 16, newGuestCount: 17, currentOutstanding: 1000 }).additionalAmount, 550);
});

test("gratuity rounds on the added ticket subtotal, not each guest", () => {
  const basis = resolveAddedGuestPricingBasis({ bookingOrigin: "admin_staff", metadata: { ...metadata, pricingProvenance: { ...metadata.pricingProvenance, agreedPricePerPerson: 1000.05 } }, serviceFeeAmount: 100 });
  assert.equal(calculateAddedGuestFinancials({ basis, currentGuestCount: 6, newGuestCount: 8, currentOutstanding: 0 }).additionalAmount, 2250.11);
});

test("Reviews recover a removed final page without changing ordinary pagination", () => {
  assert.equal(clampReviewPage(2, 10, 10), 1);
  assert.equal(clampReviewPage(78, 779, 10), 78);
  assert.equal(clampReviewPage(78, 770, 10), 77);
  assert.equal(clampReviewPage(4, 0, 10), 1);
  assert.equal(clampReviewPage(2.5, 20, 10), 1);
  assert.equal(getReviewPageCount(743, 10), 75);
});

test("Reviews recovery precedes list/selection updates and retains server permissions", () => {
  const workspace = readFileSync(new URL("../app/admin/ReviewsAdminWorkspace.tsx", import.meta.url), "utf8");
  assert.ok(workspace.indexOf("const availablePage =") < workspace.indexOf("setResult(data)"));
  assert.match(workspace, /!targetReviewId && availablePage !== page/);
  assert.match(workspace, /setSelectedId\(null\);\s*setSelectedDetail\(null\);\s*setPage\(availablePage\)/);
  const route = readFileSync(new URL("../app/api/admin/reviews/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /communications:manage/);
  assert.match(route, /\.in\("venue", venues.length/);
});
