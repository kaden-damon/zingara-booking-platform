import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCreditNoteLines, canManageXeroCreditNotes, remainingCreditCents } from "./creditNotes.ts";
import { calculateXeroDocumentTotals } from "./documentMath.ts";

const invoiceLines = calculateXeroDocumentTotals([
  { description: "Corporate package", mappingCategory: "corporate", quantity: "10", unitPrice: "500", taxCode: "OUTPUT3", taxRatePercent: "15" },
  { description: "Approved discount", mappingCategory: "discounts", quantity: "1", unitPrice: "-250", taxCode: "OUTPUT3", taxRatePercent: "15" },
], "exclusive").lines;

test("credit note lines preserve authoritative mapping and VAT treatment", () => {
  const credit = buildCreditNoteLines({
    amountType: "exclusive",
    invoiceLines,
    selections: [
      { lineIndex: 0, quantity: "2", unitPrice: "500" },
      { lineIndex: 1, quantity: "1", unitPrice: "-100" },
    ],
  });
  assert.equal(credit.lines[0].mappingCategory, "corporate");
  assert.equal(credit.lines[0].taxCode, "OUTPUT3");
  assert.equal(credit.subtotalCents, 90_000);
  assert.equal(credit.taxCents, 13_500);
  assert.equal(credit.totalCents, 103_500);
});

test("credit note lines cannot exceed or change the sign of invoice lines", () => {
  assert.throws(() => buildCreditNoteLines({ amountType: "exclusive", invoiceLines, selections: [{ lineIndex: 0, quantity: "11", unitPrice: "500" }] }), /cannot exceed/);
  assert.throws(() => buildCreditNoteLines({ amountType: "exclusive", invoiceLines, selections: [{ lineIndex: 1, quantity: "1", unitPrice: "100" }] }), /cannot exceed/);
  assert.throws(() => buildCreditNoteLines({ amountType: "exclusive", invoiceLines, selections: [] }), /at least one/);
});

test("remaining invoice value never becomes negative", () => {
  assert.equal(remainingCreditCents(100_000, 25_000), 75_000);
  assert.equal(remainingCreditCents(100_000, 125_000), 0);
});

test("only the approved active Accounts identities can manage credit notes", () => {
  assert.equal(canManageXeroCreditNotes({ active: true, id: "1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d" }, true), true);
  assert.equal(canManageXeroCreditNotes({ active: true, id: "3ea8ff16-d914-477b-95fc-23380e71019a" }, true), true);
  assert.equal(canManageXeroCreditNotes({ active: true, id: "00000000-0000-0000-0000-000000000000" }, true), false);
  assert.equal(canManageXeroCreditNotes({ active: false, id: "1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d" }, true), false);
});

test("credit note route and migration preserve the activation boundary", () => {
  const route = readFileSync(new URL("../../app/api/admin/xero/credit-notes/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../../supabase/migrations/20261029193000_phase_58_1_credit_notes.sql", import.meta.url), "utf8");
  assert.match(route, /Live Xero credit-note posting is awaiting accounting approval/);
  assert.match(route, /create_xero_credit_note_draft_atomic/);
  assert.doesNotMatch(route, /runLiveXeroSyncWorker/);
  assert.match(migration, /for update/);
  assert.match(migration, /XERO_CREDIT_EXCEEDS_REMAINING_VALUE/);
  assert.match(migration, /idempotency_key uuid not null unique/);
  assert.match(migration, /xero_credit_note_draft_created/);
});
