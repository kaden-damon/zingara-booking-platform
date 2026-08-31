import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCorporateEnquiryImportPlan,
  buildCorporateEnquiryImportRecord,
  classifyCorporateEnquiryImport,
  getCorporateEnquirySourceFingerprint,
  normalizeCorporateRequestedDate,
  type CorporateEnquiryExistingIdentity,
  type CorporateEnquirySourceRow,
} from "./corporateEnquiryImport.ts";

function sourceRow(
  overrides: Partial<CorporateEnquirySourceRow> = {},
): CorporateEnquirySourceRow {
  return {
    companyName: "Example Company",
    contactName: "Example Contact",
    contactNumber: "",
    email: "contact@example.com",
    guestCount: 20,
    guestCountText: "20",
    invoiceState: "",
    paymentState: "",
    quoteState: "",
    requestedDate: "2026-12-11",
    requestedDateText: "2026-12-11",
    seatingPreference: "Golden Circle",
    sourceFile: "Cape Town Enquiries.xlsx",
    sourceRow: 2,
    sourceSheet: "Corporate Booking enquiries",
    statusNote: "",
    ...overrides,
  };
}

test("source fingerprints are deterministic and sensitive to source identity", () => {
  const row = sourceRow();

  assert.equal(
    getCorporateEnquirySourceFingerprint(row),
    getCorporateEnquirySourceFingerprint({ ...row }),
  );
  assert.notEqual(
    getCorporateEnquirySourceFingerprint(row),
    getCorporateEnquirySourceFingerprint({ ...row, sourceRow: 3 }),
  );
});

test("an exact imported fingerprint makes sparse rows idempotent", () => {
  const row = sourceRow({
    companyName: "Vodacom",
    contactName: "Vodacom",
    contactNumber: "",
    email: "",
    guestCount: null,
    guestCountText: "buyouts",
    requestedDate: null,
    requestedDateText: "19,20,21 November",
  });
  const fingerprint = getCorporateEnquirySourceFingerprint(row);

  assert.equal(
    classifyCorporateEnquiryImport(row, [
      {
        companyName: "Vodacom",
        contactName: "Vodacom",
        contactNumber: null,
        email: null,
        guestCount: null,
        preferredDate: null,
        sourceFingerprint: fingerprint,
      },
    ]).action,
    "SKIP - ALREADY EXISTS",
  );
});

test("Kyle is skipped by the authoritative composite identity", () => {
  const row = sourceRow({
    companyName: "SLR Consulting",
    contactName: "Kyle Isaacs",
    email: "",
    guestCount: 105,
    sourceRow: 45,
  });
  const existing: CorporateEnquiryExistingIdentity[] = [
    {
      companyName: "SLR Consulting",
      contactName: "Kyle Isaacs",
      contactNumber: null,
      email: null,
      guestCount: 105,
      preferredDate: "2026-12-11",
    },
  ];

  assert.equal(
    classifyCorporateEnquiryImport(row, existing).action,
    "SKIP - ALREADY EXISTS",
  );
});

test("Shaze remains on hold when only the contact name overlaps", () => {
  const row = sourceRow({
    companyName: "BlueSky Digital Solutions (Pty) Ltd",
    contactName: "Shaze Hopkins",
    email: "shaze.h@bsky.co.za",
    guestCount: 20,
    requestedDate: "2026-11-12",
    requestedDateText: "2026-11-12",
    sourceRow: 13,
  });
  const existing: CorporateEnquiryExistingIdentity[] = [
    {
      companyName: "",
      contactName: "Shaze Hopkins",
      contactNumber: null,
      email: null,
      guestCount: 80,
      preferredDate: "2026-11-18",
      reference: "DP-X83KQC",
    },
  ];

  assert.equal(
    classifyCorporateEnquiryImport(row, existing).action,
    "HOLD - MANUAL REVIEW",
  );
});

test("unresolved and multiple requested dates remain source text", () => {
  assert.deepEqual(normalizeCorporateRequestedDate("December"), {
    requestedDate: null,
    requestedDateText: "December",
  });
  assert.deepEqual(normalizeCorporateRequestedDate("19,20,21 November"), {
    requestedDate: null,
    requestedDateText: "19,20,21 November",
  });
  assert.deepEqual(normalizeCorporateRequestedDate("6th or 12th"), {
    requestedDate: null,
    requestedDateText: "6th or 12th",
  });
});

test("Roxanne maps directly to cancelled and archived without side effects", () => {
  const row = sourceRow({
    companyName: "Axis Aviation",
    contactName: "Roxanne Dippenaar",
    paymentState: "CANCELLED",
    sourceRow: 27,
  });
  const decision = classifyCorporateEnquiryImport(row, []);
  const record = buildCorporateEnquiryImportRecord(row, decision, {
    importedAt: "2026-08-31T12:00:00.000Z",
    importedByStaffId: "staff-1",
    sourceChecksum: "source-checksum",
  });

  assert.equal(decision.action, "CREATE CANCELLED/ARCHIVED ENQUIRY");
  assert.equal(record.status, "cancelled");
  assert.equal(record.archived_at, "2026-08-31T12:00:00.000Z");
  assert.equal(record.linked_booking_id, null);
  assert.equal(record.linked_booking_reference, null);
});

test("qualified quote text is preserved without upgrading status", () => {
  const row = sourceRow({
    quoteState: "Informal quote sent - Director has approved",
  });
  const decision = classifyCorporateEnquiryImport(row, []);
  const record = buildCorporateEnquiryImportRecord(row, decision, {
    importedAt: "2026-08-31T12:00:00.000Z",
    importedByStaffId: "staff-1",
    sourceChecksum: "source-checksum",
  });

  assert.equal(record.status, "corporate_tentative");
  assert.match(record.notes, /Informal quote sent/);
});

test("snapshot guard fails closed when reviewed totals change", () => {
  const decisions = [
    classifyCorporateEnquiryImport(sourceRow(), []),
    classifyCorporateEnquiryImport(
      sourceRow({ paymentState: "CANCELLED", sourceRow: 3 }),
      [],
    ),
  ];

  assert.doesNotThrow(() =>
    assertCorporateEnquiryImportPlan(decisions, {
      creates: 2,
      holds: 0,
      skips: 0,
      sourceRows: 2,
    }),
  );
  assert.throws(() =>
    assertCorporateEnquiryImportPlan(decisions, {
      creates: 1,
      holds: 0,
      skips: 0,
      sourceRows: 2,
    }),
  );
});
