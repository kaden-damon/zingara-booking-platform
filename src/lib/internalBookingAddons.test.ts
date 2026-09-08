import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bookingAddonCatalogue,
  calculateBookingAddonFinancialUpdate,
  getBookingAddonTotal,
  getBookingAddonCatalogue,
  normalizeInternalBookingAddons,
  validateNewCorporateAddonSelections,
} from "./bookingAddons.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("shared Corporate catalogue preserves priced and operational items", () => {
  assert.deepEqual(
    bookingAddonCatalogue.map((item) => item.name),
    [
      "Face Painting · Eye",
      "Face Painting · Half Face",
      "Face Painting · Mask",
      "Tarot Reading",
      "VIP Bar",
    ],
  );
  assert.equal(bookingAddonCatalogue.find((item) => item.id === "tarot-reading")?.unitPrice, 450);
});

test("unavailable catalogue items are excluded from every new selector", () => {
  for (const location of ["johannesburg", "cape-town"] as const) {
    const ids = getBookingAddonCatalogue(location).map((item) => item.id);
    assert.equal(ids.includes("arrival-drinks"), false);
    assert.equal(ids.includes("branded-menu-cards"), false);
    assert.equal(ids.includes("personalised-table-signage"), false);
    assert.equal(ids.includes("tarot-reading"), true);
  }
});

test("crafted unavailable catalogue and Corporate add-ons fail closed", () => {
  for (const id of [
    "arrival-drinks",
    "branded-menu-cards",
    "personalised-table-signage",
  ]) {
    assert.throws(
      () => normalizeInternalBookingAddons(
        [{ id, quantity: 1 }],
        { allowCustomPricing: true },
      ),
      /unavailable for new bookings/,
    );
  }

  for (const name of [
    "Arrival Drinks",
    "Branded Menus",
    "Personalised Table Signage",
    "Personalized Table Signage",
  ]) {
    assert.throws(
      () => validateNewCorporateAddonSelections([name]),
      /unavailable for new bookings/,
    );
  }
});

test("historical unavailable add-ons remain preservable without repricing", () => {
  const historical = {
    id: "arrival-drinks",
    kind: "catalogue" as const,
    name: "Arrival Drinks",
    price: 0,
    pricingType: "operational" as const,
    quantity: 1,
    unitPrice: 0,
  };
  const [preserved] = normalizeInternalBookingAddons(
    [historical],
    { allowCustomPricing: false, existingAddons: [historical] },
  );
  assert.deepEqual(preserved, {
    ...historical,
    catalogueUnitPrice: 0,
  });
  assert.equal(getBookingAddonTotal([preserved]), 0);
});

test("catalogue quantity and total are calculated from authoritative prices", () => {
  const [item] = normalizeInternalBookingAddons(
    [{ id: "tarot-reading", name: "Tampered", price: 1, quantity: 2 }],
    { allowCustomPricing: false },
  );
  assert.equal(item.name, "Tarot Reading");
  assert.equal(item.unitPrice, 450);
  assert.equal(item.price, 900);
  assert.equal(getBookingAddonTotal([item]), 900);
});

test("authorised catalogue overrides preserve both base and agreed booking price", () => {
  const [item] = normalizeInternalBookingAddons(
    [{ id: "face-painting-mask", quantity: 2, unitPrice: 175 }],
    { allowCustomPricing: true },
  );
  assert.equal(item.catalogueUnitPrice, 200);
  assert.equal(item.unitPrice, 175);
  assert.equal(item.price, 350);
  assert.equal(
    bookingAddonCatalogue.find((candidate) => candidate.id === item.id)?.unitPrice,
    200,
  );
});

test("catalogue overrides fail closed without financial permission", () => {
  assert.throws(
    () => normalizeInternalBookingAddons(
      [{ id: "face-painting-mask", quantity: 1, unitPrice: 175 }],
      { allowCustomPricing: false },
    ),
    /financial reconciliation access/,
  );
});

test("ordinary staff may preserve an existing agreed override and change quantity", () => {
  const existing = normalizeInternalBookingAddons(
    [{ id: "face-painting-mask", quantity: 1, unitPrice: 175 }],
    { allowCustomPricing: true },
  );
  const [item] = normalizeInternalBookingAddons(
    [{ id: "face-painting-mask", quantity: 3, unitPrice: 175 }],
    { allowCustomPricing: false, existingAddons: existing },
  );
  assert.equal(item.catalogueUnitPrice, 200);
  assert.equal(item.unitPrice, 175);
  assert.equal(item.price, 525);
});

test("available operational catalogue items remain unpriced", () => {
  const [item] = normalizeInternalBookingAddons(
    [{ id: "vip-bar", quantity: 8 }],
    { allowCustomPricing: false },
  );
  assert.equal(item.pricingType, "operational");
  assert.equal(item.unitPrice, 0);
  assert.equal(item.price, 0);
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
    currentServiceFee: 1_080,
    currentTotalAmount: 9_720,
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
    currentServiceFee: 0,
    currentTotalAmount: 10_000,
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
  const [page, editor] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/components/InternalBookingAddonsEditor.tsx"),
  ]);
  assert.match(page, /isCorporateCalendarCheckout \? "Corporate Add-Ons" : "Add-Ons"/);
  assert.match(page, /canCustomPrice=\{canCustomPriceAddons\}/);
  assert.match(page, /addons: selectedAddons/);
  assert.match(editor, /useState\(false\)/);
  assert.match(editor, /aria-expanded=\{expanded\}/);
  assert.match(editor, /expanded \? "−" : "\+"/);
  assert.match(editor, /No add-ons selected/);
  assert.match(editor, /value\.length === 1 \? "item" : "items"/);
});

test("custom item remains a local draft until Add Item commits it", async () => {
  const editor = await source("../app/components/InternalBookingAddonsEditor.tsx");
  const totalExpression = editor.match(/const total = ([^;]+);/)?.[1] ?? "";
  const openHandler = editor.match(/function openNewCustomItem\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  const commitHandler = editor.match(/function commitCustomItem\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";

  assert.match(totalExpression, /value\.reduce/);
  assert.doesNotMatch(totalExpression, /customDraft/);
  assert.match(openHandler, /setCustomDraft\(blankCustomItem\(\)\)/);
  assert.doesNotMatch(openHandler, /onChange/);
  assert.match(commitHandler, /onChange/);
  assert.match(editor, /editingCustomId \? "Save Item" : "Add Item"/);
  assert.match(editor, />Cancel</);
  assert.match(editor, />Edit</);
  assert.match(editor, />Remove</);
});

test("catalogue controls auto-populate base price and expose overrides only when authorised", async () => {
  const editor = await source("../app/components/InternalBookingAddonsEditor.tsx");
  assert.match(editor, /catalogueItem\.unitPrice/);
  assert.match(editor, /price: catalogueUnitPrice/);
  assert.match(editor, /unitPrice: catalogueUnitPrice/);
  assert.match(editor, /catalogueUnitPrice > 0 && canCustomPrice/);
  assert.match(editor, /Booking price/);
  assert.match(editor, /Catalogue/);
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
  assert.match(editor, /<InternalBookingAddonsEditor/);
  assert.match(editor, /addonsDirty/);
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
