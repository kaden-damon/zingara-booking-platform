import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeInternalBookingAddons } from "./bookingAddons";
import { calculatePublicBookingPricing } from "./pricing";
import { defaultVenueSettings } from "./zingaraDemo";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("R500 per guest bar tab remains an add-on and does not replace the deposit", () => {
  const [barTab] = normalizeInternalBookingAddons(
    [
      {
        id: "custom-bar-tab",
        kind: "custom",
        name: "Bar tab",
        price: 11_000,
        quantity: 22,
        unitPrice: 500,
      },
    ],
    { allowCustomPricing: true, location: "johannesburg" },
  );
  const pricing = calculatePublicBookingPricing({
    addons: [barTab],
    partySize: 22,
    paymentOption: "deposit",
    settings: defaultVenueSettings,
    zoneId: "golden-circle",
  });

  assert.equal(barTab.price, 11_000);
  assert.equal(pricing.addonsTotal, 11_000);
  assert.equal(
    pricing.depositAmount,
    defaultVenueSettings.zonePricing["golden-circle"].depositAmount! * 22,
  );
  assert.notEqual(pricing.depositAmount, pricing.addonsTotal);
  assert.equal(pricing.amountDueNow, pricing.depositAmount);
});

test("booking creation resolves unique email before mobile fallback", async () => {
  const route = await source("../app/api/bookings/route.ts");
  const start = route.indexOf("async function upsertCustomer");
  const end = route.indexOf("async function getSupabaseShowId", start);
  const customerUpsert = route.slice(start, end);

  const emailLookup = customerUpsert.indexOf('.eq("email", payload.email)');
  const mobileLookup = customerUpsert.indexOf('.in("mobile", mobileVariants)');
  const insert = customerUpsert.indexOf(".insert(payload)");

  assert.ok(emailLookup > 0);
  assert.ok(mobileLookup > emailLookup);
  assert.ok(insert > mobileLookup);
  assert.match(customerUpsert, /getPhoneLookupVariants\(customer\.phone\)/);
  assert.doesNotMatch(customerUpsert, /\.or\(filters\)/);
});

test("customer uniqueness conflicts return a safe actionable reason", async () => {
  const route = await source("../app/api/bookings/route.ts");

  assert.match(route, /CUSTOMER_EMAIL_CONFLICT/);
  assert.match(route, /Select the existing customer and try again/);
  assert.match(route, /status: 409/);
});

test("Pay Now and payment-link creation share booking persistence and lock duplicate clicks", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /await persistPendingCheckoutBooking\(reference\)/);
  assert.match(page, /if \(isPayFastRedirecting\)/);
  assert.match(page, /isManualPaymentLinkCreating \|\|/);
  assert.match(page, /PREPARING PAYMENT\.\.\./);
  assert.match(page, /CREATING PAYMENT LINK\.\.\./);
});

test("payment links and Pay Now resolve their amount from persisted booking state", async () => {
  const [linkRoute, checkoutRoute] = await Promise.all([
    source("../app/api/admin/bookings/payment-link/route.ts"),
    source("../app/api/payfast/checkout/route.ts"),
  ]);

  assert.match(linkRoute, /getSelectedBookingPaymentAmount\(authoritativeBooking\)/);
  assert.match(checkoutRoute, /preparePayFastCheckoutAttempt/);
  assert.match(checkoutRoute, /preparedAmount: attemptResult\.attempt\.amount_due/);
});

test("the repair contains no Nando-specific mutation or communication path", async () => {
  const [route, page] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source("../app/book/page.tsx"),
  ]);

  assert.doesNotMatch(route, /Nando|Timika|CORP-MTLK49MW-343/i);
  assert.doesNotMatch(page, /Nando|Timika|CORP-MTLK49MW-343/i);
});
