import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readCorporateBuyoutAgreement, validateCorporateBuyoutAgreement, type CorporateBuyoutAgreement } from "./corporateBuyoutAgreement.ts";
import { resolveFunctionBriefBuyoutComposition } from "./corporateFunctionBriefFinancials.ts";
import { getRestrictedDietaryQuantities } from "./dietaryAddonOrdering.ts";
import { buildAuthoritativeBookingInvoiceDraft } from "./xero/bookingInvoice.ts";

const cases = [
  [42929.25, 13570, 2600, 746029.25],
  [66300, 32257.50, 0, 785487.50],
  [66300, 24207.50, 0, 777437.50],
];
function fixture(values = cases[0]): CorporateBuyoutAgreement {
  return { sourceDocument: "Tracy workbook, Vodacom Buyouts CPT", sourceSha256: "5bad2b09b367ab2e60f820c23912d9405c5ec54050a1c1afc288032b6309e54c",
    packageName: "Private Salon CPT", originalBase: 590000, discount: 59000, vat: 79650, gratuity: 73750,
    addons: [
      { id: "custom-drinks", name: "Drinks package including service", amount: values[0], description: "Includes 12.5% SF; workbook allowance, not paid spend" },
      { id: "custom-halaal-charge", name: "Strictly Halaal charge", amount: values[1], description: "Workbook charge only, not a supplier order" },
      { id: "custom-kosher-charge", name: "Kosher charge", amount: values[2], description: "Workbook charge only, not a supplier order" },
      { id: "custom-delivery", name: "Hotbox / delivery", amount: 2530, description: "Workbook inclusive charge" },
    ], requirements: { strictlyHalaal: 45, kosher: 4, sourceQuantity: "45+4" } };
}

for (const [index, values] of cases.entries()) test(`agreement ${index + 1} reconciles exactly without proportional rescaling`, () => {
  const agreement = fixture(values);
  const total = values[3];
  assert.equal(validateCorporateBuyoutAgreement(agreement, total), null);
  const addons = agreement.addons.reduce((sum, a) => sum + a.amount, 0);
  const notes = "__zingara_booking_meta__:" + JSON.stringify({ commercialModel: "fixed-buyout-package", totalPrice: total, buyoutComponentAgreement: agreement });
  assert.deepEqual(readCorporateBuyoutAgreement(notes, total), agreement);
  assert.equal(readCorporateBuyoutAgreement(notes, total + 1), null);
  assert.deepEqual(resolveFunctionBriefBuyoutComposition({ package_snapshot: { displayName: "The Grand Society" }, commercial_base_amount: 531000,
    commercial_vat_amount: 79650, commercial_gratuity_amount: 73750, commercial_total_amount: 684400, commercial_additional_guest_amount: 0 },
  { notes, addonsTotal: addons, serviceFee: 73750, totalAmount: total }), { packageName: "Private Salon CPT", packageBaseAmount: 531000, vatAmount: 79650 });
  const draft = buildAuthoritativeBookingInvoiceDraft({ bookingNotes: notes, addonsTotal: addons, bookingFeeAmount: 0, bookingReference: "ZNG-TEST",
    discountAmount: 59000, revenueCategory: "buyouts", serviceFee: 73750, subtotalAmount: 669650 + addons, totalAmount: total });
  assert.equal(draft.totalCents, Math.round(total * 100));
  assert.equal(draft.lines[0].unitPrice, "678500.00");
  assert.equal(draft.lines[1].unitPrice, "-67850.00");
  assert.equal(draft.lines.reduce((sum, line) => sum + Math.round(Number(line.unitPrice) * 100), 0), Math.round(total * 100));
  assert.deepEqual(getRestrictedDietaryQuantities(agreement.addons.map(a => ({ ...a, price: a.amount, quantity: 1 }))), {
    "dietary-strictly-halaal": 0, "dietary-kosher": 0,
  });
});

test("invalid totals, basis, precision, quantities and canonical supplier-order identifiers are rejected", () => {
  for (const change of [ { vat: 88500 }, { gratuity: 66375 }, { discount: -1 }, { originalBase: 590000.001 },
    { requirements: { strictlyHalaal: 1.5, kosher: 4, sourceQuantity: "45+4" } },
    { addons: [{ id: "dietary-kosher", name: "Kosher", amount: 61629.25, description: "" }] } ]) {
    assert.ok(validateCorporateBuyoutAgreement({ ...fixture(), ...change }, 746029.25));
  }
});

test("atomic extension retains reconciliation safeguards and does not write orders or historical snapshots", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261119140000_corporate_buyout_component_reconciliation.sql", import.meta.url), "utf8");
  for (const pattern of [/for update/, /BOOKING_REVISION_CHANGED/, /BOOKING_LOCKED/, /source_booking_reference/,
    /p_amount_paid is distinct from b.amount_paid/, /reconcile_booking_financials_and_links_atomic/, /supplier_orders_created.*false/,
    /revoke all.*[\s\S]*from public,anon,authenticated/]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /set\s+(package_snapshot|terms_snapshot|guest_count|dietary_requirements)\s*=/i);
  assert.doesNotMatch(sql, /insert into public\.(payments|booking_dietary|communications|email)/i);
});
