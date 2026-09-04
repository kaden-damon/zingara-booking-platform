import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  openPaymentLinkToken,
  sealPaymentLinkToken,
} from "./payment-links/paymentLinkTokenVault.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("managed payment-link tokens are recoverable only with the server secret", () => {
  const envelope = sealPaymentLinkToken("customer-link-token", "server-secret");

  assert.equal(
    openPaymentLinkToken(envelope, "server-secret"),
    "customer-link-token",
  );
  assert.equal(openPaymentLinkToken(envelope, "different-secret"), null);
  assert.equal(JSON.stringify(envelope).includes("customer-link-token"), false);
});

test("active link lookup is authenticated and permission protected", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  const getBranch = route.slice(route.indexOf("export async function GET"));

  assert.match(getBranch, /requireActiveStaff\(request\)/);
  assert.match(getBranch, /!canManage \|\| !canReconcile/);
  assert.match(getBranch, /status: 403/);
  assert.match(getBranch, /loadLatestPaymentLinkForBooking/);
});

test("managed lookup returns authoritative bounded outstanding and booking linkage", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  const helper = await source("./payment-links/customerPaymentLinks.ts");

  assert.match(route, /getPaymentLinkCheckoutAmount\(link, booking\)/);
  assert.match(route, /loadBookingForPaymentLink\(serviceClient, bookingReference\)/);
  assert.match(helper, /Math\.min\(configuredAmount, outstandingAmount\)/);
  assert.match(helper, /\.eq\("booking_id", bookingId\)/);
});

test("expired revoked and paid links are not exposed as usable URLs", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  const helper = await source("./payment-links/customerPaymentLinks.ts");

  assert.match(helper, /link\.status === "used".*getOutstandingAmount\(booking\) <= 0/s);
  assert.match(helper, /link\.status === "revoked"/);
  assert.match(helper, /link\.status === "expired"/);
  assert.match(route, /status === "active"[\s\S]*getManagedLinkToken\(link, booking\.notes\)/);
  assert.match(route, /function getManagedLinkToken[\s\S]*openPaymentLinkToken/);
  assert.match(route, /paymentUrl: token \? getPaymentLinkUrl\(request, token\) : null/);
});

test("resend resolves an existing managed link instead of creating another token", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");
  const resendBranch = route.slice(
    route.indexOf('action === "send-existing"'),
    route.indexOf('if (action !== "create"', route.indexOf('action === "send-existing"')),
  );

  assert.match(resendBranch, /loadPaymentLinkById\(supabase, body\.linkId\)/);
  assert.match(resendBranch, /getManagedLinkToken\(requestedLink, authoritativeBooking\.notes\)/);
  assert.match(resendBranch, /revokeOnFailure: false/);
  assert.doesNotMatch(resendBranch, /createPaymentLinkToken/);
  assert.doesNotMatch(resendBranch, /\.insert\(/);
});

test("new managed links store an encrypted token envelope", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");

  assert.match(route, /token_hash: hashPaymentLinkToken\(token\)/);
  assert.match(route, /tokenEnvelope: sealPaymentLinkToken\(token\)/);
});

test("Booking Details exposes status and active View Copy Resend controls", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /Payment Link · \{paymentLinkDetails\.status\}/);
  assert.match(page, /View Payment Link/);
  assert.match(page, /Copy Link/);
  assert.match(page, /Resend Payment Link/);
  assert.match(page, /LINK COPIED ✓/);
});

test("view and copy are local read-only actions", async () => {
  const page = await source("../app/admin/page.tsx");
  const viewCopyBranch = page.slice(
    page.indexOf("function viewManagedPaymentLink"),
    page.indexOf("async function sendCustomerPaymentLink"),
  );

  assert.match(viewCopyBranch, /window\.open\(link\.paymentUrl/);
  assert.match(viewCopyBranch, /navigator\.clipboard\.writeText\(link\.paymentUrl\)/);
  assert.doesNotMatch(viewCopyBranch, /fetchSupabaseApi/);
  assert.doesNotMatch(viewCopyBranch, /PayFast|payment_status|amount_paid/);
});

test("Corporate payment links now use the managed server route", async () => {
  const page = await source("../app/admin/page.tsx");
  const corporateBranch = page.slice(
    page.indexOf("async function sendCorporatePaymentLink"),
    page.indexOf("function cancelCorporateRequest"),
  );

  assert.match(corporateBranch, /loadManagedPaymentLink/);
  assert.match(corporateBranch, /sendCustomerPaymentLink/);
  assert.doesNotMatch(corporateBranch, /createCorporatePaymentToken/);
  assert.doesNotMatch(corporateBranch, /saveBookings|saveCorporateRequests/);
});

test("payment-link management never marks a booking paid or starts PayFast", async () => {
  const route = await source("../app/api/admin/bookings/payment-link/route.ts");

  assert.doesNotMatch(route, /preparePayFastCheckoutAttempt|confirm_payfast_payment/);
  assert.doesNotMatch(route, /payment_status|amount_paid/);
});
