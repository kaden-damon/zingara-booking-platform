import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  calculateManagementAnalytics,
  defaultManagementAnalyticsFilters,
  selectManagementForecastRows,
  type ManagementAnalyticsBooking,
  type ManagementAnalyticsDataset,
} from "./managementAnalytics.ts";
import {
  buildManagementForecastWorkbook,
  managementForecastHeaders,
} from "./exports/managementForecastWorkbook.ts";

function booking(
  id: string,
  overrides: Partial<ManagementAnalyticsBooking> = {},
): ManagementAnalyticsBooking {
  return {
    amountPaid: 1_000,
    archivedAt: null,
    balanceOutstanding: 0,
    bookingOrigin: "customer_public",
    bookingReference: `ZNG-${id}`,
    bookingSource: "online",
    bookingStatus: "confirmed",
    corporateRequestId: null,
    createdAt: "2026-10-01T08:00:00+02:00",
    customerId: `customer-${id}`,
    guestCount: 4,
    id,
    paymentStatus: "fully_paid",
    section: "Golden Circle",
    showId: "future-jhb",
    totalAmount: 1_000,
    ...overrides,
  };
}

function fixture(): ManagementAnalyticsDataset {
  const bookings = [
    booking("confirmed"),
    booking("deposit", {
      amountPaid: 500,
      balanceOutstanding: 500,
      paymentStatus: "deposit_paid",
    }),
    booking("complimentary", {
      amountPaid: 0,
      guestCount: 3,
      paymentStatus: "comp_vip",
      totalAmount: 0,
    }),
    booking("floor-queue", {
      guestCount: 2,
      paymentStatus: "pending_payment",
    }),
    booking("past", { showId: "past-cpt" }),
  ];

  return {
    asOf: "2026-10-05T10:00:00+02:00",
    bookings,
    capacityByVenue: { "cape-town": 10, johannesburg: 10 },
    customers: bookings.map((row) => ({
      createdAt: row.createdAt,
      hasCompleteContact: true,
      id: row.customerId,
    })),
    payments: [],
    shows: [
      {
        date: "2026-10-07",
        id: "future-jhb",
        name: "The Royal Countess",
        status: "active",
        time: "17:00:00",
        venue: "johannesburg",
      },
      {
        date: "2026-10-01",
        id: "past-cpt",
        name: "The Royal Countess",
        status: "active",
        time: "18:00:00",
        venue: "cape-town",
      },
    ],
  };
}

test("management forecast is a projection of authoritative performance demand", () => {
  const data = fixture();
  const analytics = calculateManagementAnalytics(
    data,
    defaultManagementAnalyticsFilters,
  );
  const rows = selectManagementForecastRows(
    analytics.performanceDemand,
    data.asOf,
    "future",
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "future-jhb");
  assert.equal(rows[0].guests, 13);
  assert.equal(rows[0].amountPaid, 2_500);
  assert.equal(rows[0].confirmed, 4);
  assert.equal(rows[0].depositPaid, 1);
  assert.equal(rows[0].fullyPaid, 1);
  assert.equal(rows[0].complimentary, 1);
  assert.equal(rows[0].occupancy, 130);
});

test("date and venue filters drive both forecast rows and workbook", async () => {
  const data = fixture();
  const filters = {
    ...defaultManagementAnalyticsFilters,
    performanceFrom: "2026-10-07",
    performanceTo: "2026-10-07",
    venue: "johannesburg" as const,
  };
  const report = await buildManagementForecastWorkbook(data, filters, "future");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(report.buffer);
  const sheet = workbook.getWorksheet("MANAGEMENT FORECAST");

  assert.ok(sheet);
  assert.deepEqual(
    sheet.getRow(4).values?.slice(1),
    [...managementForecastHeaders],
  );
  assert.equal(sheet.rowCount, 5);
  assert.equal(sheet.getCell("B5").value, "JHB");
  assert.equal(sheet.getCell("C5").value, 13);
  assert.equal(sheet.getCell("D5").value, 1.3);
  assert.equal(sheet.getCell("E5").value, 2_500);
  assert.equal(sheet.getCell("J5").value, "Capacity issue");
  assert.equal(sheet.getColumn(4).numFmt, "0.0%");
  assert.equal(sheet.getColumn(5).numFmt, '"R"#,##0.00');
  assert.match(report.filename, /2026-10-07_to_2026-10-07/);
});

test("venue filtering uses the canonical show venue for all, CPT and JHB", () => {
  const data = fixture();
  const allRows = calculateManagementAnalytics(data, {
    ...defaultManagementAnalyticsFilters,
  }).performanceDemand;
  const capeTownRows = calculateManagementAnalytics(data, {
    ...defaultManagementAnalyticsFilters,
    venue: "cape-town",
  }).performanceDemand;
  const johannesburgRows = calculateManagementAnalytics(data, {
    ...defaultManagementAnalyticsFilters,
    venue: "johannesburg",
  }).performanceDemand;

  assert.deepEqual(allRows.map((row) => row.venue).sort(), ["cape-town", "johannesburg"]);
  assert.deepEqual(capeTownRows.map((row) => row.venue), ["cape-town"]);
  assert.deepEqual(johannesburgRows.map((row) => row.venue), ["johannesburg"]);
});

test("venue, date and scope combine without changing forecast values", () => {
  const data = fixture();
  const unfiltered = calculateManagementAnalytics(
    data,
    defaultManagementAnalyticsFilters,
  ).performanceDemand.find((row) => row.id === "future-jhb");
  const filtered = selectManagementForecastRows(
    calculateManagementAnalytics(data, {
      ...defaultManagementAnalyticsFilters,
      performanceFrom: "2026-10-07",
      performanceTo: "2026-10-07",
      venue: "johannesburg",
    }).performanceDemand,
    data.asOf,
    "future",
  );

  assert.ok(unfiltered);
  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0], unfiltered);
});

test("workbook population matches all, CPT and JHB screen populations", async () => {
  const data = fixture();
  for (const venue of ["all", "cape-town", "johannesburg"] as const) {
    const filters = { ...defaultManagementAnalyticsFilters, venue };
    const screenRows = selectManagementForecastRows(
      calculateManagementAnalytics(data, filters).performanceDemand,
      data.asOf,
      "all",
    );
    const report = await buildManagementForecastWorkbook(data, filters, "all");

    assert.deepEqual(
      report.rows.map((row) => row.id),
      screenRows.map((row) => row.id),
    );
    assert.ok(
      report.rows.every((row) => venue === "all" || row.venue === venue),
    );
  }
});

test("management forecast remains self-service and permission protected", async () => {
  const component = await readFile(
    new URL("../app/admin/ManagementAnalytics.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/admin/analytics/management/export/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(component, /Management/);
  assert.match(component, /Detailed/);
  assert.match(component, /Download Excel/);
  assert.match(component, /Forward Forecast venue/);
  assert.match(component, /All venues/);
  assert.match(component, /No performances match these filters\./);
  assert.match(component, /filtersToSearchParams\(filters\)/);
  assert.match(component, /selectManagementForecastRows/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /analytics:read/);
  assert.match(route, /management-forecast/);
  assert.match(route, /loadManagementAnalyticsDataset/);
  assert.match(route, /venue_scope/);
});
