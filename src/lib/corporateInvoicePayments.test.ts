import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCorporateInvoiceFinancials,
  validateCorporateInvoiceFinancials,
} from "./corporateInvoicePayments.ts";
import type { DemoBooking } from "./zingaraDemo.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function booking(overrides: Partial<DemoBooking> = {}): DemoBooking {
  return {
    amountPaid: 0,
    balanceDue: 10_000,
    bookingDate: "2026-11-27 18:00",
    corporateInvoiceOutstandingAmount: 10_000,
    corporatePaymentBasis: "invoice-outstanding",
    createdAt: "2026-09-04T12:00:00.000Z",
    customer: { email: "finance@example.com", name: "Corporate Guest", phone: "+27110000000" },
    partySize: 10,
    paymentOption: "full",
    paymentStatus: "pending-payment",
    pricePerPerson: 1000,
    reference: "ZNG-EFT001",
    showId: "show-1",
    source: "corporate-direct",
    status: "pending-payment",
    tableId: "",
    tableNumber: "",
    totalPrice: 10_000,
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    ...overrides,
    communicationHistory: overrides.communicationHistory ?? [],
  };
}

test("outstanding invoice keeps the full obligation due without a fake payment", () => {
  const result = applyCorporateInvoiceFinancials(booking());

  assert.equal(result.totalPrice, 10_000);
  assert.equal(result.amountPaid, 0);
  assert.equal(result.balanceDue, 10_000);
  assert.equal(result.paymentStatus, "pending-payment");
  assert.equal(validateCorporateInvoiceFinancials(result), null);
});

test("new unpaid invoice rejects an unexplained partial outstanding amount", () => {
  const result = applyCorporateInvoiceFinancials(
    booking({ corporateInvoiceOutstandingAmount: 7_500 }),
  );

  assert.match(
    validateCorporateInvoiceFinancials(result) ?? "",
    /full obligation outstanding/,
  );
});

test("paid invoice derives full manual EFT settlement", () => {
  const result = applyCorporateInvoiceFinancials(
    booking({ corporatePaymentBasis: "invoice-paid" }),
  );

  assert.equal(result.amountPaid, 10_000);
  assert.equal(result.balanceDue, 0);
  assert.equal(result.paymentStatus, "fully-paid");
  assert.equal(result.status, "confirmed");
  assert.equal(validateCorporateInvoiceFinancials(result), null);
});

test("invoice modes remain Corporate-only", () => {
  assert.match(
    validateCorporateInvoiceFinancials(booking({ source: "online" })) ?? "",
    /only for internal Corporate bookings/,
  );
});

test("server enforces trusted Corporate invoice state and preserves atomic capacity", async () => {
  const route = await source("../app/api/bookings/route.ts");

  assert.match(route, /Invoice \/ EFT settlement requires authorised internal Corporate booking access/);
  assert.match(route, /applyCorporateInvoiceFinancials\(booking\)/);
  assert.match(route, /validateCorporateInvoiceFinancials\(booking\)/);
  assert.match(route, /isCorporateInvoicePaymentBasis\(booking\.corporatePaymentBasis\)[\s\S]*return true/);
  assert.match(route, /validateBookingCapacityIncrease/);
  assert.match(route, /isPaidInvoice \? "eft"/);
  assert.doesNotMatch(route, /provider_transaction_id:[\s\S]{0,120}invoice-paid/);
});

test("database suppresses only validated unpaid invoice stubs", async () => {
  const migration = await source(
    "../../supabase/migrations/20260904170000_phase_39_66_corporate_invoice_payments.sql",
  );

  assert.match(migration, /booking_source <> 'corporate-direct'/);
  assert.match(migration, /booking_origin <> 'corporate'/);
  assert.match(migration, /corporatePaymentBasis'[\s\S]*invoice-outstanding/);
  assert.match(migration, /return null/);
  assert.match(migration, /CORPORATE_INVOICE_PAYMENT_EVIDENCE_INVALID/);
  assert.doesNotMatch(migration, /update public\.(?:bookings|payments)/);
});

test("internal Corporate UI offers invoice modes without PayFast or automatic links", async () => {
  const [page, modal] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/admin/CorporateConversionModal.tsx"),
  ]);
  const handler = page.slice(
    page.indexOf("async function handleCreateCorporateInvoiceBooking"),
    page.indexOf("async function handleCreateManualPaymentLink"),
  );

  assert.match(page, /Invoiced – Outstanding Payment/);
  assert.match(page, /Invoiced – Paid In Full/);
  assert.match(page, /Outstanding Amount/);
  assert.match(modal, /Invoiced – Outstanding Payment/);
  assert.match(modal, /Paid In Full By Invoice \/ EFT/);
  assert.match(handler, /persistPendingCheckoutBooking/);
  assert.doesNotMatch(handler, /submitPayFastCheckoutForm|\/api\/payfast/);
  assert.doesNotMatch(handler, /handleCreateManualPaymentLink/);
});

test("Corporate hold, later reconciliation and managed payment links remain available", async () => {
  const [holdMigration, reconciliation, paymentLink] = await Promise.all([
    source("../../supabase/migrations/20260902150000_phase_39_48_booking_cutoff_corporate_holds.sql"),
    source("../app/api/admin/bookings/reconciliation/route.ts"),
    source("../app/api/admin/bookings/payment-link/route.ts"),
  ]);

  assert.match(holdMigration, /booking_source <> 'corporate-direct'/);
  assert.match(holdMigration, /corporate_payment_deadline/);
  assert.match(reconciliation, /reconcile_booking_financials_atomic/);
  assert.match(paymentLink, /getOutstandingAmount\(authoritativeBooking\)/);
});

test("invoice creation records immutable operational audit evidence", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");

  assert.match(route, /corporate\.invoice-booking\.created/);
  assert.match(route, /payment_basis: rawBooking\.corporatePaymentBasis/);
  assert.match(route, /payment_method: "eft"/);
  assert.match(route, /Corporate Bookings/);
});
