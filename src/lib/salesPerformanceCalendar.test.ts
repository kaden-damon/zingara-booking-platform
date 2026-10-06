import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateManagementAnalytics,
  defaultManagementAnalyticsFilters,
  type ManagementAnalyticsBooking,
  type ManagementAnalyticsDataset,
} from "./managementAnalytics.ts";
import {
  getCalendarGridDates,
  getCalendarMonthRange,
  groupSalesPerformanceByDate,
  shiftCalendarMonth,
  summarizeSalesPerformance,
} from "./salesPerformanceCalendar.ts";

function booking(id: string, showId: string, overrides: Partial<ManagementAnalyticsBooking> = {}): ManagementAnalyticsBooking {
  return {
    amountPaid: 600,
    archivedAt: null,
    balanceOutstanding: 400,
    bookingOrigin: "customer_public",
    bookingReference: `ZNG-${id}`,
    bookingSource: "online",
    bookingStatus: "confirmed",
    corporateRequestId: null,
    createdAt: "2026-09-01T10:00:00+02:00",
    customerId: `customer-${id}`,
    guestCount: 4,
    id,
    paymentStatus: "deposit_paid",
    section: "Golden Circle",
    showId,
    totalAmount: 1_000,
    ...overrides,
  };
}

function fixture(): ManagementAnalyticsDataset {
  const bookings = [
    booking("floor-queue", "cpt-early"),
    booking("solo", "cpt-late", { guestCount: 1, totalAmount: 1_940 }),
    booking("corporate", "jhb", { bookingOrigin: "corporate", bookingSource: "corporate-direct", guestCount: 20, totalAmount: 20_000 }),
    booking("cancelled", "jhb", { bookingStatus: "cancelled", guestCount: 100 }),
    booking("archived", "jhb", { archivedAt: "2026-10-01T12:00:00+02:00", guestCount: 100 }),
  ];
  return {
    asOf: "2026-10-06T12:00:00+02:00",
    bookings,
    capacityByVenue: { "cape-town": 100, johannesburg: 200 },
    customers: bookings.map((row) => ({ createdAt: row.createdAt, hasCompleteContact: true, id: row.customerId })),
    payments: [],
    shows: [
      { date: "2026-10-14", id: "cpt-early", name: "CPT Early", status: "active", time: "14:00:00", venue: "cape-town" },
      { date: "2026-10-14", id: "cpt-late", name: "CPT Late", status: "sold_out", time: "19:00:00", venue: "cape-town" },
      { date: "2026-10-14", id: "jhb", name: "JHB", status: "special_event", time: "17:00:00", venue: "johannesburg" },
      { date: "2026-10-20", id: "zero", name: "Zero", status: "active", time: "18:00:00", venue: "cape-town" },
      { date: "2026-11-01", id: "next", name: "Next", status: "active", time: "18:00:00", venue: "cape-town" },
    ],
  };
}

test("calendar is an exact month projection of authoritative performance demand", () => {
  const data = fixture();
  const rows = calculateManagementAnalytics(data, {
    ...defaultManagementAnalyticsFilters,
    performanceFrom: "2026-10-01",
    performanceTo: "2026-10-31",
  }).performanceDemand;

  assert.deepEqual(rows.map((row) => row.id), ["cpt-early", "jhb", "cpt-late", "zero"]);
  assert.equal(rows.find((row) => row.id === "cpt-early")?.guests, 4);
  assert.equal(rows.find((row) => row.id === "cpt-late")?.guests, 1);
  assert.equal(rows.find((row) => row.id === "jhb")?.guests, 20);
  assert.equal(rows.find((row) => row.id === "zero")?.guests, 0);
  assert.equal(rows.find((row) => row.id === "cpt-late")?.bookingValue, 1_940);
});

test("monthly summary uses the visible card population and weighted occupancy", () => {
  const rows = calculateManagementAnalytics(fixture(), {
    ...defaultManagementAnalyticsFilters,
    performanceFrom: "2026-10-01",
    performanceTo: "2026-10-31",
  }).performanceDemand;
  const summary = summarizeSalesPerformance(rows);

  assert.equal(summary.shows, 4);
  assert.equal(summary.guests, 25);
  assert.equal(summary.capacity, 500);
  assert.equal(summary.occupancy, 5);
  assert.equal(summary.bookingValue, 22_940);
  assert.equal(summary.amountPaid, 1_800);
  assert.equal(summary.outstanding, 1_200);
});

test("venue filtering, same-date shows and zero-booking shows remain intact", () => {
  const rows = calculateManagementAnalytics(fixture(), {
    ...defaultManagementAnalyticsFilters,
    performanceFrom: "2026-10-01",
    performanceTo: "2026-10-31",
    venue: "cape-town",
  }).performanceDemand;
  const groups = groupSalesPerformanceByDate(rows);

  assert.deepEqual(groups.get("2026-10-14")?.map((row) => row.id), ["cpt-early", "cpt-late"]);
  assert.equal(groups.get("2026-10-20")?.[0].guests, 0);
  assert.ok(rows.every((row) => row.venue === "cape-town"));
});

test("month helpers preserve SAST calendar boundaries", () => {
  assert.deepEqual(getCalendarMonthRange("2026-10"), { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(shiftCalendarMonth("2026-10", -1), "2026-09");
  assert.equal(shiftCalendarMonth("2026-12", 1), "2027-01");
  assert.equal(getCalendarGridDates("2026-10").filter(Boolean).at(0), "2026-10-01");
  assert.equal(getCalendarGridDates("2026-10").filter(Boolean).at(-1), "2026-10-31");
});

test("calendar remains read-only and reuses the management reporting boundary", async () => {
  const component = await readFile(new URL("../app/admin/SalesPerformanceCalendar.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/admin/analytics/management/route.ts", import.meta.url), "utf8");

  assert.match(component, /calculateManagementAnalytics/);
  assert.match(component, /performanceDemand/);
  assert.match(component, /Sales &amp; Performance/);
  assert.doesNotMatch(component, /fetch\(|POST|PATCH|DELETE|updateBooking/);
  assert.match(route, /analytics:read/);
  assert.match(route, /staffProfile\.venue_scope/);
});
