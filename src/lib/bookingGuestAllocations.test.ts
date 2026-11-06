import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calculateGuestAllocationFinancials,
  deriveZoneEntitlements,
  formatGuestAllocationSummary,
  getComplimentaryGuestCounts,
  getGuestAllocationTotals,
  parseBookingGuestAllocations,
  validateBookingGuestAllocations,
} from "./bookingGuestAllocations.ts";

test("parses one-zone paid and COMP guests without changing the booking total", () => {
  const parsed = parseBookingGuestAllocations(
    [
      {
        complimentaryCategory: "standard",
        complimentaryPax: "5",
        paidPax: "5",
        zoneId: "golden-circle",
      },
    ],
    10,
  );
  assert.deepEqual(parsed, [
    {
      complimentaryCategory: "standard",
      complimentaryPax: 5,
      paidPax: 5,
      zoneId: "golden-circle",
    },
  ]);
  assert.deepEqual(deriveZoneEntitlements(parsed!), [
    { pax: 10, zoneId: "golden-circle" },
  ]);
});

test("supports mixed multi-zone Paid, Media and Tradex allocations", () => {
  const parsed = parseBookingGuestAllocations(
    [
      {
        complimentaryCategory: "standard",
        complimentaryPax: "0",
        paidPax: "100",
        zoneId: "golden-circle",
      },
      {
        complimentaryCategory: "media",
        complimentaryPax: "12",
        paidPax: "8",
        zoneId: "middle-ring",
      },
      {
        complimentaryCategory: "tradex",
        complimentaryPax: "5",
        paidPax: "0",
        zoneId: "royal-balcony",
      },
    ],
    125,
  );
  assert.deepEqual(getGuestAllocationTotals(parsed!), {
    allocatedPax: 125,
    complimentaryPax: 17,
    paidPax: 108,
  });
  assert.deepEqual(getComplimentaryGuestCounts(parsed), {
    media: 12,
    standard: 0,
    tradex: 5,
  });
  assert.match(formatGuestAllocationSummary(parsed), /Golden Circle: 100 Paid/);
  assert.match(formatGuestAllocationSummary(parsed), /Middle Ring: 8 Paid \+ 12 Media/);
});

test("rejects duplicate zones, negative quantities, empty rows and unreconciled totals", () => {
  assert.match(
    validateBookingGuestAllocations(
      [
        { complimentaryCategory: "standard", complimentaryPax: "1", paidPax: "1", zoneId: "golden-circle" },
        { complimentaryCategory: "media", complimentaryPax: "1", paidPax: "1", zoneId: "golden-circle" },
      ],
      4,
    )!,
    /only once/,
  );
  assert.match(
    validateBookingGuestAllocations(
      [{ complimentaryCategory: "standard", complimentaryPax: "-1", paidPax: "2", zoneId: "golden-circle" }],
      1,
    )!,
    /whole guest counts/,
  );
  assert.match(
    validateBookingGuestAllocations(
      [{ complimentaryCategory: "standard", complimentaryPax: "0", paidPax: "0", zoneId: "golden-circle" }],
      1,
    )!,
    /at least one guest/,
  );
  assert.match(
    validateBookingGuestAllocations(
      [{ complimentaryCategory: "standard", complimentaryPax: "2", paidPax: "3", zoneId: "golden-circle" }],
      6,
    )!,
    /equal 6/,
  );
});

test("charges only Paid guests while retaining COMP internal counts", () => {
  const allocations = parseBookingGuestAllocations(
    [
      { complimentaryCategory: "standard", complimentaryPax: "5", paidPax: "5", zoneId: "golden-circle" },
      { complimentaryCategory: "media", complimentaryPax: "8", paidPax: "12", zoneId: "middle-ring" },
    ],
    30,
  )!;
  const financials = calculateGuestAllocationFinancials({
    addonsTotal: 0,
    allocations,
    depositForZone: (_zoneId, total, paidPax) => Math.min(total, paidPax * 550),
    serviceFeeGuestThreshold: 6,
    serviceFeeRate: 0.125,
    totalPax: 30,
    zonePrice: (zoneId) => zoneId === "golden-circle" ? 1_320 : 990,
  });
  assert.equal(financials.seatingSubtotal, 18_480);
  assert.equal(financials.serviceFeeAmount, 2_310);
  assert.equal(financials.total, 20_790);
  assert.equal(financials.depositAmount, 9_350);
  assert.equal(financials.effectivePaidPricePerPerson, 18_480 / 17);
});

test("an all-COMP allocation has no payable value or deposit", () => {
  const allocations = parseBookingGuestAllocations(
    [{ complimentaryCategory: "tradex", complimentaryPax: "8", paidPax: "0", zoneId: "middle-ring" }],
    8,
  )!;
  const financials = calculateGuestAllocationFinancials({
    addonsTotal: 500,
    allocations,
    depositForZone: () => 4_400,
    serviceFeeGuestThreshold: 6,
    serviceFeeRate: 0.125,
    totalPax: 8,
    zonePrice: () => 990,
  });
  assert.equal(financials.total, 0);
  assert.equal(financials.depositAmount, 0);
  assert.equal(financials.addonsTotal, 0);
});

test("ordinary internal allocations do not collect venue gratuity upfront", () => {
  const financials = calculateGuestAllocationFinancials({
    addonsTotal: 500,
    allocations: [{
      complimentaryCategory: null,
      complimentaryPax: 0,
      paidPax: 6,
      zoneId: "golden-circle",
    }],
    depositForZone: () => 0,
    includeGratuity: false,
    serviceFeeGuestThreshold: 6,
    serviceFeeRate: 0.125,
    totalPax: 6,
    zonePrice: () => 1000,
  });

  assert.equal(financials.serviceFeeAmount, 0);
  assert.equal(financials.total, 6500);
});

test("staff allocation persistence remains authorised, atomic and multi-zone for Standard and Corporate", () => {
  const route = readFileSync(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261106030000_phase_3_multi_zone_split_payments.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(route, /rolePermissions\[staffRole\]\.includes\("bookings:manage"\)/);
  assert.match(route, /reserve_staff_guest_allocations/);
  assert.match(route, /Allocate tables separately after creating this booking/);
  assert.match(migration, /booking_source in \('admin', 'corporate-direct'\)/);
  assert.match(migration, /reserve_public_booking_entitlement/);
  assert.match(migration, /zone_entitlements = p_zone_entitlements/);
  assert.match(migration, /STAFF_GUEST_ALLOCATION_IDEMPOTENCY_CONFLICT/);
  assert.doesNotMatch(
    migration,
    /booking_source = 'admin'[\s\S]{0,120}jsonb_array_length\(guest_allocations\) = 1/,
  );
});
