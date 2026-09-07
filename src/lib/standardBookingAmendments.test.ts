import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateBookingAddonFinancialUpdate,
  getBookingAddonCatalogue,
  normalizeInternalBookingAddons,
} from "./bookingAddons.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Johannesburg dietary add-ons use authoritative per-meal pricing", () => {
  const catalogue = getBookingAddonCatalogue("johannesburg");
  const halaal = catalogue.find(
    (item) => item.id === "dietary-strictly-halaal",
  );
  const kosher = catalogue.find((item) => item.id === "dietary-kosher");

  assert.equal(halaal?.unitPrice, 250);
  assert.equal(kosher?.unitPrice, 500);

  const [twoHalaal, twoKosher] = normalizeInternalBookingAddons(
    [
      { id: "dietary-strictly-halaal", quantity: 2 },
      { id: "dietary-kosher", quantity: 2 },
    ],
    { allowCustomPricing: false, location: "johannesburg" },
  );

  assert.equal(twoHalaal.price, 500);
  assert.equal(twoKosher.price, 1_000);
});

test("dietary quantity is independent from booking pax", () => {
  const [kosher] = normalizeInternalBookingAddons(
    [{ id: "dietary-kosher", quantity: 2 }],
    { allowCustomPricing: false, location: "johannesburg" },
  );

  assert.equal(kosher.quantity, 2);
  assert.equal(kosher.price, 1_000);
});

test("Cape Town cannot inherit or craft Johannesburg dietary prices", () => {
  const capeTownIds = getBookingAddonCatalogue("cape-town").map(
    (item) => item.id,
  );

  assert.equal(capeTownIds.includes("dietary-strictly-halaal"), false);
  assert.equal(capeTownIds.includes("dietary-kosher"), false);
  assert.throws(
    () =>
      normalizeInternalBookingAddons(
        [{ id: "dietary-kosher", name: "Kosher", quantity: 1, unitPrice: 1 }],
        { allowCustomPricing: true, location: "cape-town" },
      ),
    /not configured for the booking venue/,
  );
});

test("priced amendments preserve historical financial basis and paid amount", () => {
  const result = calculateBookingAddonFinancialUpdate({
    amountPaid: 5_000,
    currentServiceFee: 625,
    currentTotalAmount: 5_000,
    newAddonsTotal: 1_000,
    oldAddonsTotal: 0,
    partySize: 8,
    subtotalAmount: 4_375,
  });

  assert.equal(result.subtotalAmount, 5_375);
  assert.equal(result.serviceFee, 750);
  assert.equal(result.totalAmount, 6_125);
  assert.equal(result.amountPaid, 5_000);
  assert.equal(result.balanceOutstanding, 1_125);
});

test("R0 operational items do not create a balance and overpayment fails closed", () => {
  const operational = calculateBookingAddonFinancialUpdate({
    amountPaid: 5_000,
    currentServiceFee: 0,
    currentTotalAmount: 5_000,
    newAddonsTotal: 0,
    oldAddonsTotal: 0,
    partySize: 4,
    subtotalAmount: 5_000,
  });
  const removal = calculateBookingAddonFinancialUpdate({
    amountPaid: 5_000,
    currentServiceFee: 0,
    currentTotalAmount: 5_000,
    newAddonsTotal: 0,
    oldAddonsTotal: 500,
    partySize: 4,
    subtotalAmount: 5_000,
  });

  assert.equal(operational.balanceOutstanding, 0);
  assert.equal(operational.createsCredit, false);
  assert.equal(removal.createsCredit, true);
});

test("notes save resolves immutable booking identity and preserves omitted add-ons", async () => {
  const [editor, client, route] = await Promise.all([
    source("../app/admin/BookingMetadataDraftEditor.tsx"),
    source("./supabase/bookings.ts"),
    source("../app/api/admin/bookings/route.ts"),
  ]);

  assert.match(editor, /bookingId=\{booking\.supabaseBookingId\}|bookingId,/);
  assert.match(client, /bookingId\?: string/);
  assert.match(route, /beforeQuery\.eq\("id", bookingId\)/);
  assert.match(route, /booking_reference[\s\S]*authoritative booking reference/i);
  assert.match(route, /body\.addons \?\? previousMetadata\?\.addons \?\? \[\]/);
  assert.doesNotMatch(
    route,
    /Booking notes and a booking reference are required/,
  );
});

test("Booking Details remains a local explicit-save editor", async () => {
  const editor = await source("../app/admin/BookingMetadataDraftEditor.tsx");
  const noteChange = editor.match(
    /onChange=\{\(event\) => \{([\s\S]*?)\n\s*\}\}/,
  )?.[1] ?? "";

  assert.match(noteChange, /setDraft/);
  assert.doesNotMatch(noteChange, /saveBookingMetadata|fetch/);
  assert.equal(editor.match(/await saveBookingMetadata\(/g)?.length, 1);
  assert.match(editor, /inFlightRef\.current/);
  assert.match(editor, /Saving\.\.\./);
  assert.match(editor, /Saved ✓/);
});

test("server amendment is venue authoritative and supports legacy metadata upgrade", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const handler = route.match(
    /async function persistBookingMetadataUpdate([\s\S]*?)\nasync function setBookingArchiveState/,
  )?.[0] ?? "";

  assert.match(handler, /requireActiveStaff\(request\)/);
  assert.match(handler, /includes\("bookings:manage"\)/);
  assert.match(handler, /normalizeInternalBookingAddons\(requestedAddons/);
  assert.match(handler, /location,/);
  assert.match(handler, /createLegacyBookingMetadataSnapshot/);
  assert.match(handler, /reference: bookingReference/);
  assert.doesNotMatch(handler, /historical booking does not have structured pricing metadata/);
});

test("financial save revokes stale links but creates no money or communication", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const handler = route.match(
    /async function persistBookingMetadataUpdate([\s\S]*?)\nasync function setBookingArchiveState/,
  )?.[0] ?? "";

  assert.match(handler, /status: "revoked"/);
  assert.match(handler, /paymentLinksInvalidated/);
  assert.match(handler, /amountPaid: Number/);
  assert.match(handler, /payment_status: nextPaymentStatus/);
  assert.doesNotMatch(
    handler,
    /upsertPayment|preparePayFast|sendOperationalCustomerEmail|insertCommunication/,
  );
});

test("managed balance link creation uses authoritative outstanding without sending", async () => {
  const [page, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/bookings/payment-link/route.ts"),
  ]);
  const createHandler = page.match(
    /async function createOutstandingPaymentLink[\s\S]*?\n  async function sendCustomerPaymentLink/,
  )?.[0] ?? "";

  assert.match(createHandler, /action: "create-outstanding"/);
  assert.match(createHandler, /Creating secure payment link/);
  assert.match(createHandler, /LINK READY ✓/);
  assert.doesNotMatch(createHandler, /sendOperationalCustomerEmail|PayFast/);
  assert.match(route, /getOutstandingAmount\(authoritativeBooking\)/);
  assert.match(route, /action === "create-outstanding"/);
  assert.doesNotMatch(route, /body\.amount/);
});

test("public and Corporate booking paths remain isolated", async () => {
  const [publicPage, publicRoute, corporatePage] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
    source("../app/corporate/page.tsx"),
  ]);

  assert.match(publicPage, /manualCheckoutRole !== "none" && addonCatalogue\.length > 0/);
  assert.match(publicRoute, /Booking add-ons are available only through authorised staff booking creation/);
  assert.match(publicRoute, /location: normalizeShowLocation\(show\.venue\)/);
  assert.match(corporatePage, /hasAcknowledgedAgePolicy/);
});

test("age policy and booking identities remain untouched", async () => {
  const [editor, route] = await Promise.all([
    source("../app/admin/BookingMetadataDraftEditor.tsx"),
    source("../app/api/admin/bookings/route.ts"),
  ]);

  assert.match(editor, /AgeRestrictionNotice/);
  const handler = route.match(
    /async function persistBookingMetadataUpdate([\s\S]*?)\nasync function setBookingArchiveState/,
  )?.[0] ?? "";
  const updatePayload = handler.match(
    /\.from\("bookings"\)[\s\S]*?\.update\(\{([\s\S]*?)\n\s*\}\)/,
  )?.[1] ?? "";

  assert.doesNotMatch(updatePayload, /ticket|table_id:|show_id:|customer_id:/);
});
