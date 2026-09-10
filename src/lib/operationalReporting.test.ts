import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBookingGrainReportRows,
  buildCustomerGrainReportRows,
  buildOperationalTableReportRows,
  sanitizeOperationalReportNotes,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./operationalReporting.ts";
import type { DemoBooking, DemoTable, SeatingZoneId } from "./zingaraDemo.ts";

function booking(
  reference: string,
  pax: number,
  claims: Array<{ id: string; capacity: number; section?: string }> = [],
  overrides: Partial<DemoBooking> = {},
): DemoBooking {
  return {
    bookingDate: "2026-09-10 17:00",
    customer: {
      email: `${reference.toLowerCase()}@example.com`,
      name: reference,
      phone: "+27110000000",
    },
    partySize: pax,
    pricePerPerson: 100,
    reference,
    reservationTableClaims: claims.map((claim, index) => ({
      capacity: claim.capacity,
      primary: index === 0,
      section: claim.section ?? "middle-ring",
      tableCode: claim.id,
      tableId: claim.id,
    })),
    status: "confirmed",
    tableId: claims[0]?.id ?? "requires-floor-assignment",
    tableNumber: claims.map((claim) => claim.id).join(" + ") || "Requires floor assignment",
    ticketCode: `${reference}-ticket`,
    totalPrice: pax * 100,
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    ...overrides,
  };
}

function table(
  id: string,
  capacity: number,
  overrides: Partial<DemoTable> = {},
): DemoTable {
  return {
    capacityConfigured: true,
    guestNotes: "",
    id,
    physicalTable: true,
    seatCapacity: capacity,
    status: "booked",
    tableNumber: id,
    zoneId: "middle-ring",
    ...overrides,
  };
}

test("keeps one-table bookings at booking grain and table grain", () => {
  const bookings = [booking("ONE", 4, [{ id: "201", capacity: 4 }])];
  const tables = [table("201", 4)];

  assert.equal(buildBookingGrainReportRows(bookings, tables).length, 1);
  assert.deepEqual(
    buildOperationalTableReportRows(bookings, tables).map((row) => [
      row.tableNumber,
      row.allocatedPax,
    ]),
    [["201", 4]],
  );
});

test("expands two-table and five-table merged claims without duplicating pax", () => {
  const two = booking("TWO", 12, [{ id: "merged-two", capacity: 12 }]);
  const five = booking("FIVE", 30, [{ id: "merged-five", capacity: 30 }], {
    zoneId: "royal-booths",
    zoneTitle: "Private Booths",
  });
  const tables = [
    table("merged-two", 12, { mergedFrom: ["18", "19"], physicalTable: false, tableNumber: "18+19" }),
    table("18", 6, { mergedInto: "merged-two", status: "disabled" }),
    table("19", 6, { mergedInto: "merged-two", status: "disabled" }),
    table("merged-five", 30, { mergedFrom: ["20", "21", "22", "23", "24"], physicalTable: false, tableNumber: "20+21+22+23+24", zoneId: "royal-booths" }),
    ...["20", "21", "22", "23", "24"].map((id) =>
      table(id, 6, { mergedInto: "merged-five", status: "disabled", zoneId: "royal-booths" }),
    ),
  ];
  const rows = buildOperationalTableReportRows([two, five], tables);
  const twoRows = rows.filter((row) => row.booking?.reference === "TWO");
  const fiveRows = rows.filter((row) => row.booking?.reference === "FIVE");

  assert.deepEqual(twoRows.map((row) => row.tableNumber), ["18", "19"]);
  assert.equal(twoRows.reduce((sum, row) => sum + row.allocatedPax, 0), 12);
  assert.deepEqual(fiveRows.map((row) => row.tableNumber), ["20", "21", "22", "23", "24"]);
  assert.equal(fiveRows.reduce((sum, row) => sum + row.allocatedPax, 0), 30);
  assert.equal(buildBookingGrainReportRows([two, five], tables).length, 2);
});

test("uses all direct show-table claims while treating tableId as primary only", () => {
  const multi = booking("MULTI", 10, [
    { id: "1", capacity: 6 },
    { id: "2", capacity: 6 },
  ]);
  const rows = buildOperationalTableReportRows(
    [multi],
    [table("1", 6), table("2", 6)],
  );

  assert.deepEqual(rows.map((row) => row.allocatedPax), [6, 4]);
  assert.equal(rows.reduce((sum, row) => sum + row.allocatedPax, 0), 10);
  assert.equal(
    buildBookingGrainReportRows([multi], [table("1", 6), table("2", 6)])[0]
      .tableSummary,
    "1, 2",
  );
});

test("keeps multi-zone Corporate pax zone-correct and counts financials once", () => {
  const corporate = booking("CORP", 10, [
    { id: "GC1", capacity: 4, section: "golden-circle" },
    { id: "MR1", capacity: 6, section: "middle-ring" },
  ], {
    customerId: "customer-1",
    totalPrice: 12_000,
    zoneEntitlements: [
      { pax: 4, zoneId: "golden-circle" },
      { pax: 6, zoneId: "middle-ring" },
    ],
  });
  const tables = [
    table("GC1", 4, { zoneId: "golden-circle" }),
    table("MR1", 6),
  ];
  const tableRows = buildOperationalTableReportRows([corporate], tables);
  const bookingRows = buildBookingGrainReportRows([corporate], tables);
  const customerRows = buildCustomerGrainReportRows(
    bookingRows,
    (item) => item.totalPrice,
  );

  assert.deepEqual(
    tableRows.map((row) => [row.zoneId, row.allocatedPax]),
    [["golden-circle", 4], ["middle-ring", 6]],
  );
  assert.equal(bookingRows[0].booking.partySize, 10);
  assert.equal(customerRows[0].totalSpend, 12_000);
  assert.equal(customerRows[0].bookings, 1);
});

test("keeps unassigned bookings at booking grain but out of claimed table rows", () => {
  const unassigned = booking("QUEUE", 8);
  const rows = buildBookingGrainReportRows([unassigned], []);

  assert.equal(rows[0].tableSummary, "Requires floor assignment");
  assert.deepEqual(buildOperationalTableReportRows([unassigned], []), []);
});

test("excludes released and inactive booking claims from current occupancy", () => {
  const released = booking("RELEASED", 4, [], { tableId: "requires-floor-assignment" });
  const cancelled = booking("CANCELLED", 4, [{ id: "202", capacity: 4 }], {
    status: "cancelled",
  });
  const rows = buildOperationalTableReportRows(
    [released, cancelled],
    [table("202", 4, { bookingReference: undefined, status: "available" })],
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "available");
  assert.equal(rows[0].allocatedPax, 0);
});

test("represents active temporary tables without inventing capacity", () => {
  const temporary = table("TEMP-1", 8, {
    physicalTable: false,
    status: "available",
  });
  const capacityRequired = table("TEMP-2", 0, {
    capacityConfigured: false,
    physicalTable: false,
    status: "available",
  });
  const rows = buildOperationalTableReportRows([], [temporary, capacityRequired]);

  assert.equal(rows[0].temporary, true);
  assert.equal(rows[0].capacity, 8);
  assert.equal(rows[1].capacityConfigured, false);
  assert.equal(rows[1].capacity, 0);
});

test("removes technical import provenance while preserving staff notes", () => {
  assert.equal(
    sanitizeOperationalReportNotes(
      "Birthday Party | Final Dineplan source: workbook / row 5 | Source fingerprint: abc | Floor assignment required | 1 x no red meat",
    ),
    "Birthday Party | 1 x no red meat",
  );
  assert.equal(sanitizeOperationalReportNotes("Booking import from Dineplan"), "");
});

test("customer grain deduplicates customers across bookings and tables", () => {
  const first = booking("A", 4, [{ id: "1", capacity: 4 }], {
    customerId: "same-customer",
    totalPrice: 4_000,
  });
  const second = booking("B", 2, [{ id: "2", capacity: 2 }], {
    customer: first.customer,
    customerId: "same-customer",
    totalPrice: 2_000,
  });
  const rows = buildCustomerGrainReportRows(
    buildBookingGrainReportRows([first, second], [table("1", 4), table("2", 2)]),
    (item) => item.totalPrice,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookings, 2);
  assert.equal(rows[0].totalSpend, 6_000);
});

test("supports all established reporting zones", () => {
  const zones: SeatingZoneId[] = [
    "golden-circle",
    "middle-ring",
    "royal-balcony",
    "royal-booths",
  ];
  const bookings = zones.map((zoneId, index) =>
    booking(`ZONE-${index}`, 1, [{ id: `T-${index}`, capacity: 1, section: zoneId }], {
      zoneId,
    }),
  );
  const tables = zones.map((zoneId, index) =>
    table(`T-${index}`, 1, { zoneId }),
  );

  assert.equal(buildOperationalTableReportRows(bookings, tables).length, 4);
});

test("report integrations use the shared grains and keep the show query batched", () => {
  const adminPage = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const tablePlanRoute = readFileSync(
    new URL("../app/api/admin/analytics/table-plan/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(adminPage, /buildBookingGrainReportRows/);
  assert.match(adminPage, /buildCustomerGrainReportRows/);
  assert.match(adminPage, /buildOperationalTableReportRows/);
  assert.doesNotMatch(
    tablePlanRoute,
    /\.not\("table_id",\s*"is",\s*null\)/,
  );
  assert.match(tablePlanRoute, /await Promise\.all\(\[/);
  assert.match(tablePlanRoute, /\.from\("show_tables"\)/);
  assert.match(tablePlanRoute, /\.in\("booking_id", bookingIds\)/);
});
