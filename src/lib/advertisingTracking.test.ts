import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAdvertisingTransactionId,
  getAdvertisingPurchaseEligibility,
  type AdvertisingPurchaseBooking,
} from "./advertisingPurchase.ts";

const journeyId = "journey_0123456789abcdef0123456789abcdef";

function booking(
  overrides: Partial<AdvertisingPurchaseBooking> = {},
): AdvertisingPurchaseBooking {
  return {
    amount_paid: 1500,
    archived_at: null,
    balance_outstanding: 0,
    booking_origin: "customer_public",
    booking_source: "online",
    booking_status: "confirmed",
    guest_count: 2,
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    payment_status: "fully_paid",
    public_checkout_journey_id: journeyId,
    total_amount: 1500,
    ...overrides,
  };
}

const verifiedPayment = {
  amount: 1500,
  payment_status: "fully_paid",
  provider_transaction_id: "pf-authoritative-evidence",
};

test("verified full public payment produces a stable opaque ZAR purchase", () => {
  const result = getAdvertisingPurchaseEligibility({
    booking: booking(),
    journeyId,
    payments: [verifiedPayment],
  });

  assert.equal(result.eligible, true);
  if (!result.eligible) return;

  assert.deepEqual(result.payload, {
    currency: "ZAR",
    eventId: result.payload.transactionId,
    guestCount: 2,
    transactionId: createAdvertisingTransactionId(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    ),
    value: 1500,
  });
  assert.doesNotMatch(result.payload.transactionId, /aaaaaaaa|pf-authoritative/);
  assert.equal(
    result.payload.transactionId,
    getAdvertisingPurchaseEligibility({
      booking: booking({ amount_paid: 1600, total_amount: 1600 }),
      journeyId,
      payments: [{ ...verifiedPayment, amount: 1600 }],
    }).eligible
      ? createAdvertisingTransactionId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
      : "",
  );
});

test("partial payments and incomplete provider evidence never qualify", () => {
  const partialBooking = getAdvertisingPurchaseEligibility({
    booking: booking({
      amount_paid: 750,
      balance_outstanding: 750,
      payment_status: "deposit_paid",
    }),
    journeyId,
    payments: [{ ...verifiedPayment, amount: 750, payment_status: "deposit_paid" }],
  });
  const incompleteEvidence = getAdvertisingPurchaseEligibility({
    booking: booking(),
    journeyId,
    payments: [{ ...verifiedPayment, amount: 750 }],
  });

  assert.deepEqual(partialBooking, {
    eligible: false,
    reason: "payment_not_complete",
  });
  assert.deepEqual(incompleteEvidence, {
    eligible: false,
    reason: "provider_evidence_incomplete",
  });
});

test("journey and public-origin checks fail closed", () => {
  const wrongJourney = getAdvertisingPurchaseEligibility({
    booking: booking(),
    journeyId: "journey_ffffffffffffffffffffffffffffffff",
    payments: [verifiedPayment],
  });
  const staffBooking = getAdvertisingPurchaseEligibility({
    booking: booking({ booking_origin: "admin_staff", booking_source: "admin" }),
    journeyId,
    payments: [verifiedPayment],
  });

  assert.deepEqual(wrongJourney, {
    eligible: false,
    reason: "journey_mismatch",
  });
  assert.deepEqual(staffBooking, {
    eligible: false,
    reason: "not_public_checkout",
  });
});

test("tag integration is consent controlled, single-script and purchase gated", async () => {
  const [tracking, component, route, consent, telemetry] = await Promise.all([
    readFile(new URL("./advertisingTracking.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/PublicAdvertisingTracking.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/advertising/purchase/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/PublicCookieConsent.tsx", import.meta.url), "utf8"),
    readFile(new URL("./browserPlatformTelemetry.ts", import.meta.url), "utf8"),
  ]);

  assert.match(tracking, /G-PP7C1SBY8N/);
  assert.match(tracking, /AW-18530431025\/mApNCLCkxaUdELHg_4NF/);
  assert.match(tracking, /1434578967806435/);
  assert.match(tracking, /getElementById\(googleScriptId\)/);
  assert.match(tracking, /getElementById\(metaScriptId\)/);
  assert.match(tracking, /ad_storage: "denied"/);
  assert.match(tracking, /analytics_storage: "denied"/);
  assert.match(tracking, /window\.fbq\?\.\("consent", "revoke"\)/);
  assert.match(tracking, /googlePageViewPath !== pagePath/);
  assert.match(tracking, /metaPageViewPath !== pagePath/);
  assert.match(tracking, /domains: \["zingara\.co\.za", "book\.zingara\.co\.za"\]/);
  assert.match(component, /cookieConsentChangedEvent/);
  assert.match(component, /pathname\.startsWith\("\/admin"\)/);
  assert.match(consent, /marketing: nextConfig\.enabled && storedConsent\?\.marketing === true/);
  assert.match(telemetry, /trackAdvertisingJourneyEvent/);
  assert.match(route, /advertisingPurchaseDispatchAuthorized\(\)/);
  assert.match(route, /public_checkout_journey_id/);
  assert.doesNotMatch(tracking, /customerName|customerEmail|customerPhone/);
});
