import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("manual payment-link creation is enforced as Super Admin-only", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");

  assert.match(route, /isManualCheckoutAction && !isSuperAdminProfile\(staffProfile\)/);
  assert.match(route, /status: 403/);
  assert.match(route, /requireActiveStaff\(request\)/);
});

test("manual link creation persists selected checkout amount without sending", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  const createBranch = route.slice(
    route.indexOf('if (action === "create")'),
    route.indexOf("return sendLink({", route.indexOf('if (action === "create")')),
  );

  assert.match(
    route,
    /getSelectedBookingPaymentAmount\(authoritativeBooking\)/,
  );
  assert.match(route, /checkoutAmount: amount/);
  assert.match(createBranch, /canSend: Boolean\(recipient\)/);
  assert.doesNotMatch(createBranch, /sendOperationalCustomerEmail/);
});

test("existing secure token is reused when Super Admin sends to the guest", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");

  assert.match(route, /action === "send-existing"/);
  assert.match(route, /loadActivePaymentLink\(supabase, token\)/);
  assert.match(route, /link\.booking_id !== authoritativeBooking\.id/);
  assert.match(route, /revokeOnFailure: false/);
});

test("payment-link checkout uses bounded link amount and existing PayFast path", async () => {
  const [lookup, checkout, helper] = await Promise.all([
    source("../app/api/payment-links/[token]/route.ts"),
    source("../app/api/payment-links/[token]/checkout/route.ts"),
    source("./payment-links/customerPaymentLinks.ts"),
  ]);

  assert.match(lookup, /getPaymentLinkCheckoutAmount\(link, booking\)/);
  assert.match(checkout, /getPaymentLinkCheckoutAmount\(link, booking\)/);
  assert.match(checkout, /preparePayFastCheckoutAttempt/);
  assert.match(checkout, /createPayFastCheckoutForBookingLink/);
  assert.match(helper, /Math\.min\(configuredAmount, outstandingAmount\)/);
});

test("manual checkout exposes Pay Now plus duplicate-safe link actions", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /"PAY NOW"/);
  assert.match(page, /"SEND PAYMENT LINK"/);
  assert.match(page, /PAYMENT LINK CREATED ✓/);
  assert.match(page, /SEND TO GUEST/);
  assert.match(page, /COPY LINK/);
  assert.match(page, /isManualPaymentLinkCreating/);
  assert.match(page, /isManualPaymentLinkSending/);
});

test("manual booking uses authenticated Admin creation and atomic reservation", async () => {
  const [page, bookingApi, bookingClient, adminPage] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
    source("./supabase/bookings.ts"),
    source("../app/admin/page.tsx"),
  ]);

  assert.match(page, /createAdminBooking\(booking, booking\.journeyId\)/);
  assert.match(bookingClient, /"\/api\/admin\/bookings"/);
  assert.match(bookingApi, /booking\.source === "admin"/);
  assert.match(adminPage, /href="\/book\?staffCheckout=1"/);
});

test("missing contact blocks sending but leaves Copy Link available", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /isTrustedStaff: isTrustedManualCheckout/);
  assert.match(page, /required={!isTrustedManualCheckout}/);
  assert.match(page, /!manualPaymentLinkResult\.canSend/);
  assert.match(page, /Copy Link remains available/);
  assert.match(page, /navigator\.clipboard\.writeText/);
});

test("pending-payment lifecycle remains ITN-authoritative", async () => {
  const [page, checkout, itn] = await Promise.all([
    source("../app/book/page.tsx"),
    source("./payfast/checkout.ts"),
    source("../app/api/payfast/itn/route.ts"),
  ]);

  assert.match(page, /paymentStatus: "pending-payment"/);
  assert.match(page, /remains Pending Payment until PayFast confirms payment/);
  assert.match(checkout, /prepare_payfast_checkout_attempt/);
  assert.match(itn, /confirm_payfast_payment_core/);
});
