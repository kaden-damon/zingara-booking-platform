import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bookingAddonCatalogue,
  calculateBookingAddonFinancialUpdate,
  getBookingAddonTotal,
  normalizeInternalBookingAddons,
} from "./bookingAddons.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("shared Corporate catalogue preserves priced and operational items", () => {
  assert.deepEqual(
    bookingAddonCatalogue.map((item) => item.name),
    [
      "Arrival Drinks",
      "Branded Menu Cards",
      "Personalised Table Signage",
      "Face Painting · Eye",
      "Face Painting · Half Face",
      "Face Painting · Mask",
      "Tarot Reading",
      "VIP Bar",
    ],
  );
  assert.equal(bookingAddonCatalogue.find((item) => item.id === "arrival-drinks")?.price, 0);
  assert.equal(bookingAddonCatalogue.find((item) => item.id === "tarot-reading")?.unitPrice, 450);
});

test("catalogue quantity and total are calculated from authoritative prices", () => {
  const [item] = normalizeInternalBookingAddons(
    [{ id: "tarot-reading", name: "Tampered", price: 1, quantity: 2, unitPrice: 1 }],
    { allowCustomPricing: false },
  );
  assert.equal(item.name, "Tarot Reading");
  assert.equal(item.unitPrice, 450);
  assert.equal(item.price, 900);
  assert.equal(getBookingAddonTotal([item]), 900);
});

test("custom line totals are server-calculated and crafted totals ignored", () => {
  const [item] = normalizeInternalBookingAddons(
    [{ id: "custom-champagne", name: "Champagne Arrival", price: 1, quantity: 6, unitPrice: 150 }],
    { allowCustomPricing: true },
  );
  assert.equal(item.price, 900);
  assert.equal(item.quantity, 6);
  assert.equal(item.unitPrice, 150);
});

test("custom pricing, negative prices and invalid quantities fail closed", () => {
  assert.throws(
    () => normalizeInternalBookingAddons([{ id: "custom-a", name: "A", quantity: 1, unitPrice: 1 }], { allowCustomPricing: false }),
    /financial reconciliation access/,
  );
  assert.throws(
    () => normalizeInternalBookingAddons([{ id: "custom-a", name: "A", quantity: 1, unitPrice: -1 }], { allowCustomPricing: true }),
    /non-negative Rand amount/,
  );
  assert.throws(
    () => normalizeInternalBookingAddons([{ id: "tarot-reading", quantity: 1.5 }], { allowCustomPricing: false }),
    /whole number/,
  );
});

test("financial update includes add-ons, preserves paid and recalculates outstanding", () => {
  const result = calculateBookingAddonFinancialUpdate({
    amountPaid: 4_000,
    discountAmount: 0,
    newAddonsTotal: 900,
    oldAddonsTotal: 0,
    partySize: 6,
    subtotalAmount: 8_640,
  });
  assert.equal(result.subtotalAmount, 9_540);
  assert.equal(result.serviceFee, 1_192.5);
  assert.equal(result.totalAmount, 10_732.5);
  assert.equal(result.amountPaid, 4_000);
  assert.equal(result.balanceOutstanding, 6_732.5);
});

test("financial removal identifies a credit instead of manufacturing a refund", () => {
  const result = calculateBookingAddonFinancialUpdate({
    amountPaid: 10_000,
    discountAmount: 0,
    newAddonsTotal: 0,
    oldAddonsTotal: 2_000,
    partySize: 4,
    subtotalAmount: 10_000,
  });
  assert.equal(result.totalAmount, 8_000);
  assert.equal(result.createsCredit, true);
});

test("public Standard cannot retrieve or submit internal add-ons", async () => {
  const [page, bookingRoute, catalogueRoute] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
    source("../app/api/admin/booking-addons/route.ts"),
  ]);
  assert.match(page, /manualCheckoutRole !== "none" && addonCatalogue\.length > 0/);
  assert.match(bookingRoute, /Booking add-ons are available only through authorised staff booking creation/);
  assert.match(catalogueRoute, /requireActiveStaff\(request\)/);
  assert.match(catalogueRoute, /includes\("bookings:manage"\)/);
});

test("internal Standard and Corporate use one controlled editor", async () => {
  const page = await source("../app/book/page.tsx");
  assert.match(page, /isCorporateCalendarCheckout \? "Corporate Add-Ons" : "Add-Ons"/);
  assert.match(page, /canCustomPrice=\{canCustomPriceAddons\}/);
  assert.match(page, /addons: selectedAddons/);
});

test("complimentary priced add-ons fail closed while invoice paths retain add-ons", async () => {
  const [page, route] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
  ]);
  assert.match(route, /Priced add-ons cannot be included in a complimentary booking/);
  assert.match(page, /corporateInvoiceSubmissionAllowed/);
  assert.match(route, /applyCorporateInvoiceFinancials\(booking\)/);
});

test("Booking Details uses local draft, one save, financial preview and unsaved guard", async () => {
  const [editor, page] = await Promise.all([
    source("../app/admin/BookingMetadataDraftEditor.tsx"),
    source("../app/admin/page.tsx"),
  ]);
  assert.match(editor, /Edit Add-Ons/);
  assert.match(editor, /setDraft\(\(current\)/);
  assert.equal(editor.match(/await saveBookingMetadata\(/g)?.length, 1);
  assert.match(editor, /No payment, refund, link or communication is created automatically/);
  assert.match(page, /dirtyBookingMetadataReference === expandedBookingReference/);
});

test("one authoritative add-on edit preserves payments and revokes stale active links", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const handler = route.match(/async function persistBookingMetadataUpdate([\s\S]*?)\nasync function setBookingArchiveState/)?.[1] ?? "";
  assert.match(handler, /booking\.addons-updated/);
  assert.match(handler, /amountPaid: Number/);
  assert.match(handler, /Removing these add-ons would create a credit or refund condition/);
  assert.match(handler, /from\("booking_payment_links"\)/);
  assert.match(handler, /status: "revoked"/);
  assert.doesNotMatch(handler, /upsertPayment|PayFast|sendOperationalCustomerEmail|syncCommunications/);
});

test("public Corporate enquiry remains a preference list without custom pricing", async () => {
  const page = await source("../app/corporate/page.tsx");
  assert.match(page, /const corporateAddons = \[/);
  assert.doesNotMatch(page, /Add Custom Item|unitPrice|LINE TOTAL/i);
});
