import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  calculateManagementAnalytics,
  defaultManagementAnalyticsFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
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

test("an omitted weekday filter remains unfiltered instead of becoming Sunday", () => {
  const filters = {
    ...defaultManagementAnalyticsFilters,
    performanceFrom: "2026-10-11",
    performanceTo: "2026-12-27",
    venue: "cape-town" as const,
  };
  const params = filtersToSearchParams(filters);

  assert.equal(params.has("dayOfWeek"), false);
  assert.deepEqual(filtersFromSearchParams(params).dayOfWeek, []);
  assert.deepEqual(
    filtersFromSearchParams(new URLSearchParams("dayOfWeek=0")).dayOfWeek,
    [0],
  );
});

test("export retains every matching weekday, zero-booking show and same-date performance", async () => {
  const shows: ManagementAnalyticsDataset["shows"] = [
    { date: "2026-10-11", id: "cpt-sun", name: "Sunday", status: "active", time: "18:00:00", venue: "cape-town" },
    { date: "2026-10-14", id: "cpt-wed", name: "Wednesday", status: "active", time: "18:00:00", venue: "cape-town" },
    { date: "2026-10-15", id: "cpt-thu", name: "Thursday", status: "active", time: "18:00:00", venue: "cape-town" },
    { date: "2026-10-16", id: "cpt-fri", name: "Friday", status: "active", time: "18:00:00", venue: "cape-town" },
    { date: "2026-10-17", id: "cpt-sat-early", name: "Saturday Early", status: "active", time: "14:00:00", venue: "cape-town" },
    { date: "2026-10-17", id: "cpt-sat-late", name: "Saturday Late", status: "special_event", time: "19:00:00", venue: "cape-town" },
    { date: "2026-10-14", id: "jhb-wed", name: "JHB Wednesday", status: "active", time: "17:00:00", venue: "johannesburg" },
  ];
  const bookings = shows
    .filter((show) => show.id !== "cpt-thu")
    .map((show, index) => booking(`weekday-${index}`, { showId: show.id }));
  const data: ManagementAnalyticsDataset = {
    asOf: "2026-10-05T10:00:00+02:00",
    bookings,
    capacityByVenue: { "cape-town": 100, johannesburg: 100 },
    customers: bookings.map((row) => ({
      createdAt: row.createdAt,
      hasCompleteContact: true,
      id: row.customerId,
    })),
    payments: [],
    shows,
  };
  const clientFilters = {
    ...defaultManagementAnalyticsFilters,
    performanceFrom: "2026-10-11",
    performanceTo: "2026-10-17",
    venue: "cape-town" as const,
  };
  const serverFilters = filtersFromSearchParams(filtersToSearchParams(clientFilters));
  const screenRows = selectManagementForecastRows(
    calculateManagementAnalytics(data, clientFilters).performanceDemand,
    data.asOf,
    "future",
  );
  const report = await buildManagementForecastWorkbook(data, serverFilters, "future");

  assert.equal(screenRows.length, 6);
  assert.deepEqual(report.rows, screenRows);
  assert.deepEqual(
    report.rows.map((row) => row.date),
    ["2026-10-11", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-17"],
  );
  assert.equal(report.rows.find((row) => row.id === "cpt-thu")?.bookings, 0);
  assert.equal(report.rows.filter((row) => row.date === "2026-10-17").length, 2);
  assert.ok(report.rows.every((row) => row.venue === "cape-town"));
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
