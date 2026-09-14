import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDuplicateIntegrityGroups,
  type DuplicateIntegrityRecord,
} from "./duplicateIntegrity.ts";

function record(
  overrides: Partial<DuplicateIntegrityRecord> = {},
): DuplicateIntegrityRecord {
  return {
    amount: 9720,
    amountPaid: 0,
    bookingStatus: "pending_payment",
    capacityPax: 6,
    company: "Example Company",
    createdAt: "2026-09-14T10:00:00.000Z",
    createdBy: "Fixture Staff",
    customer: "Example Guest",
    customerIdentity: "customer-1|guest@example.com|27820000000",
    email: "guest@example.com",
    id: "record-1",
    mobile: "+27820000000",
    outstanding: 9720,
    pax: 6,
    recordType: "standard-booking",
    reference: "ZNG-ONE",
    seatingZone: "Golden Circle",
    showId: "show-1",
    showLabel: "Cape Town · 2026-11-28 · 18:00",
    source: "customer_public",
    status: "pending-payment",
    tableAssignments: [],
    ticketCount: 0,
    ...overrides,
  };
}

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("N1 identical imported enquiries form one exact group with no capacity impact", () => {
  const fingerprint = "n1-cape-town-row-36";
  const groups = buildDuplicateIntegrityGroups([
    record({
      capacityPax: 0,
      id: "8ddea9bb-822f-468b-bde7-31bd5ebd042e",
      importFingerprint: fingerprint,
      pax: 30,
      recordType: "corporate-enquiry",
      reference: "8ddea9bb-822f-468b-bde7-31bd5ebd042e",
    }),
    record({
      capacityPax: 0,
      id: "25b95191-aaff-4805-a7d6-f159f91f4c14",
      importFingerprint: fingerprint,
      pax: 30,
      recordType: "corporate-enquiry",
      reference: "25b95191-aaff-4805-a7d6-f159f91f4c14",
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.confidence, "exact");
  assert.equal(groups[0]?.capacityImpact, 0);
  assert.match(groups[0]?.whyFlagged ?? "", /Exact import fingerprint/);
});

test("unpaid checkout retry beside a paid booking is exact and exposes only excess pax", () => {
  const groups = buildDuplicateIntegrityGroups([
    record({ id: "retry", reference: "ZNG-P34A6K" }),
    record({
      amountPaid: 3850,
      bookingStatus: "confirmed",
      createdAt: "2026-09-14T10:01:28.000Z",
      id: "paid",
      reference: "ZNG-RVZD3B",
      status: "deposit-paid",
      ticketCount: 1,
    }),
  ]);

  assert.equal(groups[0]?.confidence, "exact");
  assert.equal(groups[0]?.capacityImpact, 6);
});

test("two paid close-window bookings are probable, not automatically exact", () => {
  const groups = buildDuplicateIntegrityGroups([
    record({ amountPaid: 9720, bookingStatus: "confirmed", ticketCount: 1 }),
    record({
      amountPaid: 9720,
      bookingStatus: "confirmed",
      createdAt: "2026-09-14T10:12:00.000Z",
      id: "record-2",
      reference: "ZNG-TWO",
      ticketCount: 1,
    }),
  ]);

  assert.equal(groups[0]?.confidence, "probable");
});

test("similar records with different party details are possible and require review", () => {
  const groups = buildDuplicateIntegrityGroups([
    record(),
    record({
      amount: 3240,
      createdAt: "2026-09-15T10:00:00.000Z",
      id: "record-2",
      pax: 2,
      capacityPax: 2,
      reference: "ZNG-TWO",
    }),
  ]);

  assert.equal(groups[0]?.confidence, "possible");
});

test("legitimate repeat records are never exact without exact provenance or retry evidence", () => {
  const groups = buildDuplicateIntegrityGroups([
    record({ amountPaid: 9720, bookingStatus: "confirmed" }),
    record({
      amount: 4860,
      amountPaid: 4860,
      bookingStatus: "confirmed",
      capacityPax: 3,
      createdAt: "2026-09-14T11:00:00.000Z",
      id: "record-2",
      pax: 3,
      reference: "ZNG-TWO",
    }),
  ]);

  assert.ok(groups.every((group) => group.confidence !== "exact"));
});

test("multi-table and multi-zone presentation never multiplies booking-grain pax", () => {
  const groups = buildDuplicateIntegrityGroups([
    record({
      capacityPax: 46,
      pax: 46,
      tableAssignments: ["1", "2", "3", "4"],
    }),
    record({
      bookingStatus: "confirmed",
      capacityPax: 46,
      createdAt: "2026-09-14T10:02:00.000Z",
      id: "record-2",
      pax: 46,
      reference: "ZNG-TWO",
      tableAssignments: ["11", "12"],
    }),
  ]);

  assert.equal(groups[0]?.capacityImpact, 46);
});

test("Corporate import uniqueness is transactional and leaves historical residue intact", async () => {
  const [migration, persistence] = await Promise.all([
    source("../../supabase/migrations/20260914170000_phase_41_2k_duplicate_integrity.sql"),
    source("./supabase/corporateRequestsServer.ts"),
  ]);

  assert.match(migration, /create unique index[\s\S]*import_fingerprint/i);
  assert.match(migration, /identity_rank = 1/);
  assert.match(migration, /else null/);
  assert.match(persistence, /onConflict: "import_fingerprint"/);
  assert.match(persistence, /ignoreDuplicates: true/);
  assert.match(persistence, /duplicate-import-prevented|onDuplicateImport/);
});

test("booking retry, staff warning and Corporate conversion guards remain server authoritative", async () => {
  const [bookingRoute, conversionRoute, conversionMigration] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source("../../supabase/migrations/20260903150000_phase_39_58_atomic_corporate_conversion.sql"),
  ]);

  assert.match(bookingRoute, /POTENTIAL_DUPLICATE_BOOKING/);
  assert.match(bookingRoute, /allowPotentialDuplicate/);
  assert.ok(
    bookingRoute.indexOf("const potentialDuplicates") <
      bookingRoute.indexOf("for (const entitlement of zoneEntitlements)"),
  );
  assert.match(conversionRoute, /existingBooking|idempotent/);
  assert.match(conversionMigration, /corporate_request_id/);
});

test("Admin review is permission protected, lazy and does not scan in the Admin root", async () => {
  const [route, panel, page, server] = await Promise.all([
    source("../app/api/admin/potential-duplicates/route.ts"),
    source("../app/admin/PotentialDuplicatesPanel.tsx"),
    source("../app/admin/page.tsx"),
    source("./supabase/duplicateIntegrityServer.ts"),
  ]);

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /bookings:manage/);
  assert.match(panel, /\/api\/admin\/potential-duplicates/);
  assert.match(panel, /if \(!nextOpen \|\| data \|\| isLoading\) return/);
  assert.match(panel, /Why|whyFlagged/);
  assert.match(panel, /Capacity Impact/);
  assert.match(page, /<PotentialDuplicatesPanel \/>/);
  assert.doesNotMatch(page, /buildDuplicateIntegrityGroups/);
  assert.match(server, /\.in\("booking_id", bookingIds\)/);
  assert.doesNotMatch(server, /for \([^)]*records[^)]*\)[\s\S]*for \([^)]*records/);
});
