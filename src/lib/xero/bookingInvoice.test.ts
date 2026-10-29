import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateXeroDocumentTotals } from "./documentMath.ts";
import {
  buildAuthoritativeBookingInvoiceDraft,
  directBookingInvoiceRevenueCategory,
} from "./bookingInvoice.ts";

test("builds an exact paid-booking invoice breakdown without inventing value", () => {
  const draft = buildAuthoritativeBookingInvoiceDraft({
    addonsTotal: 0,
    bookingReference: "ZNG-HT3FEZ",
    discountAmount: 0,
    revenueCategory: "ticket_sales",
    serviceFee: 1_875,
    subtotalAmount: 16_250,
    totalAmount: 18_125,
  });
  const totals = calculateXeroDocumentTotals(draft.lines, draft.lineAmountType);

  assert.equal(draft.lineAmountType, "inclusive");
  assert.equal(totals.totalCents, 1_812_500);
  assert.deepEqual(
    draft.lines.map((line) => [line.mappingCategory, line.unitPrice, line.taxRatePercent]),
    [
      ["ticket_sales", "16240.00", "15"],
      ["booking_fee", "10.00", "15"],
      ["gratuity", "1875.00", null],
    ],
  );
});

test("preserves add-ons and discounts as separate authoritative lines", () => {
  const draft = buildAuthoritativeBookingInvoiceDraft({
    addonsTotal: 300,
    bookingReference: "ZNG-EXAMPLE",
    discountAmount: 200,
    revenueCategory: "corporate",
    serviceFee: 100,
    subtotalAmount: 1_300,
    totalAmount: 1_200,
  });
  assert.equal(calculateXeroDocumentTotals(draft.lines, "inclusive").totalCents, 120_000);
  assert.deepEqual(
    draft.lines.map((line) => line.mappingCategory),
    ["corporate", "booking_fee", "addons", "discounts", "gratuity"],
  );
});

test("fails closed when stored booking amounts do not reconcile", () => {
  assert.throws(
    () => buildAuthoritativeBookingInvoiceDraft({
      addonsTotal: 0,
      bookingReference: "ZNG-BAD",
      discountAmount: 0,
      revenueCategory: "ticket_sales",
      serviceFee: 125,
      subtotalAmount: 1_000,
      totalAmount: 1_124,
    }),
    /do not reconcile/,
  );
});

test("classifies direct booking revenue from authoritative provenance", () => {
  assert.equal(directBookingInvoiceRevenueCategory({ bookingOrigin: "customer_public", bookingSource: "online", corporateRequestId: null }), "ticket_sales");
  assert.equal(directBookingInvoiceRevenueCategory({ bookingOrigin: "staff", bookingSource: "corporate", corporateRequestId: "request" }), "corporate");
  assert.equal(directBookingInvoiceRevenueCategory({ bookingOrigin: "staff", bookingSource: "buyout", corporateRequestId: null }), "buyouts");
});

test("direct booking invoice release remains permissioned, reconciled and duplicate-safe", async () => {
  const [route, migration, panel, workspace] = await Promise.all([
    readFile(new URL("../../app/api/admin/xero/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../supabase/migrations/20261029170000_p0_direct_booking_invoice.sql", import.meta.url), "utf8"),
    readFile(new URL("../../app/admin/BookingDocumentsSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/admin/XeroWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /canCreateBookingInvoice:\s*canConvertQuote/);
  assert.match(route, /Only Tristan or Rachelle can create a booking invoice draft/);
  assert.match(route, /assertDirectBookingInvoiceSyncEligibility/);
  assert.match(route, /verifiedPaymentTotal/);
  assert.match(route, /An invoice already exists for this booking/);
  assert.match(migration, /unique index[\s\S]*source_booking_id/);
  assert.match(migration, /source_quote_id is null/);
  assert.match(panel, /Create Invoice Draft/);
  assert.match(workspace, /document\.source_quote_id \|\| document\.source_booking_id/);
});
