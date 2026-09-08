import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getImportedCorporateProvenance,
  importedEnquiryClaimsPayment,
  parseImportedCorporateFinancialDraft,
  validateImportedCorporateFinancialDraft,
} from "./corporateFinancialReconciliation";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

const importedRequest = {
  notes:
    '__zingara_corporate_enquiry_import__:{"sourceRow":19,"sourceFile":"Cape Town Enquiries.xlsx","sourceSheet":"Corporate Booking enquiries","fingerprint":"source-fingerprint","paymentState":"Paid in full plus gratuity (R32 100)"}',
  source: "Data Import" as const,
};

test("paid imported enquiries remain fail-closed without persisted evidence", async () => {
  const route = await source(
    "../app/api/admin/corporate-requests/convert/route.ts",
  );

  assert.equal(importedEnquiryClaimsPayment(importedRequest), true);
  assert.match(route, /importedEnquiryClaimsPayment/);
  assert.match(route, /!financialReconciliation/);
  assert.match(route, /FINANCIAL RECONCILIATION REQUIRED/);
});

test("Sherlene components reconcile once without double-counting Halaal", () => {
  const result = parseImportedCorporateFinancialDraft({
    additionalAmount: "1500",
    amountPaid: "32100",
    gratuityAmount: "3400",
    notes: "Ash workbook: ticket, gratuity and three Strict Halaal meals.",
    paymentMethod: "EFT",
    ticketObligation: "27200",
  });

  assert.deepEqual(result, {
    additionalAmount: 1500,
    amountPaid: 32100,
    gratuityAmount: 3400,
    notes: "Ash workbook: ticket, gratuity and three Strict Halaal meals.",
    paymentMethod: "EFT",
    ticketObligation: 27200,
  });
  assert.equal(27200 + 3400 + 1500, 32100);
});

test("contradictory imported financial evidence is rejected", () => {
  const errors = validateImportedCorporateFinancialDraft({
    additionalAmount: "0",
    amountPaid: "32101",
    gratuityAmount: "3400",
    notes: "Reviewed source.",
    paymentMethod: "EFT",
    ticketObligation: "27200",
  });

  assert.match(errors.amountPaid ?? "", /cannot exceed/);
});

test("source provenance is preserved and parsed independently of physical identity", () => {
  assert.deepEqual(getImportedCorporateProvenance(importedRequest), {
    fingerprint: "source-fingerprint",
    paymentState: "Paid in full plus gratuity (R32 100)",
    sourceFile: "Cape Town Enquiries.xlsx",
    sourceRow: 19,
    sourceSheet: "Corporate Booking enquiries",
  });
});

test("reconciliation route is permissioned, scoped, concurrent, audited and mutation narrow", async () => {
  const [route, migration] = await Promise.all([
    source(
      "../app/api/admin/corporate-requests/reconcile-financials/route.ts",
    ),
    source(
      "../../supabase/migrations/20260908210000_phase_41_1l_b_imported_corporate_financial_reconciliation.sql",
    ),
  ]);

  assert.match(route, /bookings:reconcile/);
  assert.match(route, /outside your assigned location/);
  assert.match(route, /p_expected_updated_at: expectedUpdatedAt/);
  assert.match(migration, /for update/);
  assert.match(migration, /CORPORATE_RECONCILIATION_STALE/);
  assert.match(migration, /v_outstanding := round\(v_total - p_amount_paid, 2\)/);
  assert.match(migration, /corporate\.imported-financials-reconciled/);
  assert.match(migration, /revoke all on function[\s\S]*anon, authenticated/);
  assert.doesNotMatch(route, /from\("bookings"\)/);
  assert.doesNotMatch(route, /from\("payments"\)/);
  assert.doesNotMatch(route, /from\("tickets"\)/);
  assert.doesNotMatch(route, /communications|payfast/i);
});

test("conversion consumes persisted evidence and rejects a stale review", async () => {
  const [route, bookingRoute, modal, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source("../app/api/bookings/route.ts"),
    source("../app/admin/CorporateConversionModal.tsx"),
    source(
      "../../supabase/migrations/20260908210000_phase_41_1l_b_imported_corporate_financial_reconciliation.sql",
    ),
  ]);

  assert.match(route, /body\.reconciliationUpdatedAt !== financialReconciliation\.reconciledAt/);
  assert.match(route, /totalPrice: financialReconciliation\.totalObligation/);
  assert.match(route, /amountPaid: financialReconciliation\.amountPaid/);
  assert.match(route, /balanceDue: financialReconciliation\.outstandingAmount/);
  assert.match(route, /historicalPaymentMethod/);
  assert.match(bookingRoute, /Historical payment evidence requires Corporate financial reconciliation access/);
  assert.match(bookingRoute, /historicalMethod \?\?/);
  assert.match(migration, /historicalPaymentMethod/);
  assert.match(modal, /Authoritative Historical Reconciliation/);
  assert.match(modal, /Financial values are locked to/);
});

test("active duplicate imports cannot independently convert and Sherlene residue is superseded", async () => {
  const [route, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source(
      "../../supabase/migrations/20260908210000_phase_41_1l_b_imported_corporate_financial_reconciliation.sql",
    ),
  ]);

  assert.match(route, /loadActiveCorporateImportDuplicates/);
  assert.match(route, /DUPLICATE IMPORTED ENQUIRY/);
  assert.match(migration, /CORPORATE_IMPORT_DUPLICATE_ACTIVE/);
  assert.match(migration, /2d14df5e-569a-4178-be25-81750763fae4/);
  assert.match(migration, /023ae02b-91fe-4ca4-967f-4f25b8c77e01/);
  assert.match(migration, /set archived_at = v_now/);
  assert.match(migration, /corporate\.imported-duplicate-superseded/);
  assert.doesNotMatch(migration, /delete from public\.corporate_requests/);
});

test("41.1L-A conversion feedback remains intact", async () => {
  const modal = await source("../app/admin/CorporateConversionModal.tsx");

  assert.match(modal, /Converting Booking\.\.\./);
  assert.match(modal, /Booking Created ✓/);
  assert.match(modal, /submitStartedRef/);
});
