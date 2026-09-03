import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateManagementAnalytics,
  defaultManagementAnalyticsFilters,
  getBookingSource,
  type ManagementAnalyticsBooking,
  type ManagementAnalyticsDataset,
  type ManagementAnalyticsFilters,
} from "./managementAnalytics.ts";

const show = (id: string, date: string, venue: "johannesburg" | "cape-town" = "johannesburg") => ({ id, date, venue, name: "The Royal Countess", status: "active", time: venue === "johannesburg" ? "17:00:00" : "18:00:00" });
const booking = (overrides: Partial<ManagementAnalyticsBooking> = {}): ManagementAnalyticsBooking => ({
  amountPaid: 500, archivedAt: null, balanceOutstanding: 500, bookingOrigin: "customer_public",
  bookingReference: "ZNG-TEST", bookingSource: "online", bookingStatus: "confirmed",
  corporateRequestId: null, createdAt: "2026-09-01T08:00:00+02:00", customerId: "customer-1",
  guestCount: 4, id: "booking-1", paymentStatus: "deposit_paid", section: "Middle Ring",
  showId: "show-1", totalAmount: 1000, ...overrides,
});
const dataset = (bookings: ManagementAnalyticsBooking[], shows = [show("show-1", "2026-10-17")]): ManagementAnalyticsDataset => ({
  asOf: "2026-09-03T10:00:00+02:00", bookings, capacityByVenue: { "cape-town": 458, johannesburg: 458 },
  customers: Array.from(new Set(bookings.map((row) => row.customerId))).map((id) => ({ id, createdAt: "2026-09-01T08:00:00+02:00", hasCompleteContact: true })),
  payments: [], shows,
});
const filtered = (values: Partial<ManagementAnalyticsFilters>) => ({ ...defaultManagementAnalyticsFilters, ...values });

test("booking-created activity and performance-date demand are separate", () => {
  const result = calculateManagementAnalytics(dataset([booking()]), filtered({ bookingCreatedFrom: "2026-09-01", bookingCreatedTo: "2026-09-01", performanceFrom: "2026-10-01" }));
  assert.equal(result.core.bookings, 1);
  assert.equal(result.performanceDemand[0].date, "2026-10-17");
});

test("imported legacy rows are excluded from acquisition but included in demand", () => {
  const imported = booking({ bookingOrigin: "data_import" });
  const result = calculateManagementAnalytics(dataset([imported]), defaultManagementAnalyticsFilters);
  assert.equal(result.core.bookings, 0);
  assert.equal(result.performanceDemand[0].bookings, 1);
  assert.equal(result.sourceAnalysis.find((row) => row.source === "imported")?.bookings, 1);
});

test("venue filter scopes every analytical dimension", () => {
  const rows = [booking(), booking({ id: "booking-2", showId: "show-2", customerId: "customer-2" })];
  const result = calculateManagementAnalytics(dataset(rows, [show("show-1", "2026-10-17"), show("show-2", "2026-10-18", "cape-town")]), filtered({ venue: "cape-town" }));
  assert.equal(result.core.bookings, 1); assert.equal(result.performanceDemand.length, 1); assert.equal(result.performanceDemand[0].venue, "cape-town");
});

test("Tuesday remains an individual weekday category", () => {
  const result = calculateManagementAnalytics(dataset([booking()], [show("show-1", "2026-10-20")]), defaultManagementAnalyticsFilters);
  const tuesday = result.dayOfWeek.find((row) => row.day === "Tuesday");
  assert.equal(tuesday?.performances, 1); assert.equal(tuesday?.guests, 4);
});

test("midweek and weekend use the visible Monday-Thursday and Friday-Sunday definition", () => {
  const result = calculateManagementAnalytics(dataset([
    booking(), booking({ id: "booking-2", showId: "show-2", customerId: "customer-2", guestCount: 6 }),
  ], [show("show-1", "2026-10-20"), show("show-2", "2026-10-24")]), defaultManagementAnalyticsFilters);
  assert.equal(result.midweekVsWeekend.find((row) => row.label === "Midweek")?.guests, 4);
  assert.equal(result.midweekVsWeekend.find((row) => row.label === "Weekend")?.guests, 6);
});

test("January and February without shows are No Inventory Available", () => {
  const result = calculateManagementAnalytics(dataset([booking()]), defaultManagementAnalyticsFilters);
  assert.equal(result.performanceMonths.find((row) => row.month === "2027-01")?.inventoryState, "No Inventory Available");
  assert.equal(result.performanceMonths.find((row) => row.month === "2027-02")?.inventoryState, "No Inventory Available");
});

test("inventory with no bookings is distinguished from no inventory", () => {
  const result = calculateManagementAnalytics(dataset([], [show("show-1", "2027-01-10")]), defaultManagementAnalyticsFilters);
  assert.equal(result.performanceMonths.find((row) => row.month === "2027-01")?.inventoryState, "Inventory Available / Zero Bookings");
});

test("occupancy uses active guests divided by configured venue capacity", () => {
  const result = calculateManagementAnalytics(dataset([booking({ guestCount: 229 })]), defaultManagementAnalyticsFilters);
  assert.equal(result.performanceDemand[0].occupancy, 50);
});

test("lead time uses performance date minus creation date", () => {
  const result = calculateManagementAnalytics(dataset([booking({ createdAt: "2026-10-01T12:00:00+02:00" })]), defaultManagementAnalyticsFilters);
  assert.equal(result.leadTime.averageDaysAhead, 16); assert.equal(result.leadTime.medianDaysAhead, 16);
  assert.equal(result.leadTime.buckets.find((row) => row.label === "15–30 days")?.bookings, 1);
});

test("corporate and standard filters follow authoritative provenance", () => {
  const corporate = booking({ bookingOrigin: "corporate", bookingSource: "corporate-direct", corporateRequestId: "request-1" });
  assert.equal(getBookingSource(corporate), "corporate");
  assert.equal(calculateManagementAnalytics(dataset([corporate]), filtered({ bookingType: "corporate" })).core.bookings, 1);
  assert.equal(calculateManagementAnalytics(dataset([corporate]), filtered({ bookingType: "standard" })).core.bookings, 0);
});

test("payment totals use successful payment rows without provider fees", () => {
  const data = dataset([booking()]);
  data.payments = [
    { id: "p1", bookingId: "booking-1", paymentType: "deposit", paymentStatus: "deposit_paid", amount: 500, providerGrossAmount: 510, transactionFeeAmount: 10, createdAt: "2026-09-01T09:00:00+02:00", processedAt: "2026-09-01T09:01:00+02:00" },
    { id: "p2", bookingId: "booking-1", paymentType: "full_payment", paymentStatus: "pending_payment", amount: 500, providerGrossAmount: 510, transactionFeeAmount: 10, createdAt: "2026-09-01T09:00:00+02:00", processedAt: null },
  ];
  const result = calculateManagementAnalytics(data, filtered({ bookingCreatedFrom: "2026-09-01", bookingCreatedTo: "2026-09-01" }));
  assert.equal(result.payments.successfullyPaid, 500); assert.equal(result.payments.transactionFees, 10); assert.equal(result.payments.pendingCheckouts, 1);
});

test("Day 1 benchmark reproduces established headline definitions", () => {
  const rows = Array.from({ length: 135 }, (_, index) => booking({ id: `day1-${index}`, bookingReference: `ZNG-D1-${index}`, customerId: `c-${index}`, guestCount: index === 0 ? 4 : index < 130 ? 4 : 3, totalAmount: index === 0 ? 795976 - 134 * 5000 : 5000, amountPaid: index === 0 ? 526977 - 100 * 5000 : index <= 100 ? 5000 : 0, balanceOutstanding: 0, bookingStatus: index <= 100 ? "confirmed" : index === 134 ? "cancelled" : "pending_payment" }));
  const result = calculateManagementAnalytics(dataset(rows), filtered({ bookingCreatedFrom: "2026-09-01", bookingCreatedTo: "2026-09-01", source: "public" }));
  assert.equal(result.core.bookings, 135); assert.equal(result.core.guests, 535); assert.equal(result.core.bookingValue, 795976); assert.equal(result.core.amountPaid, 526977); assert.equal(result.core.confirmed, 101); assert.equal(result.core.pendingPayment, 33); assert.equal(result.core.cancelled, 1);
});

test("Day 2 benchmark reproduces established activity metrics", () => {
  const rows = Array.from({ length: 63 }, (_, index) => booking({ id: `day2-${index}`, bookingReference: `ZNG-D2-${index}`, customerId: `d2-c-${index}`, createdAt: "2026-09-02T08:00:00+02:00", guestCount: index < 32 ? 5 : 4, totalAmount: index === 0 ? 417617 - 62 * 6500 : 6500, amountPaid: index === 0 ? 257174 - 46 * 5500 : index <= 46 ? 5500 : 0, bookingStatus: index <= 46 ? "confirmed" : "pending_payment" }));
  const result = calculateManagementAnalytics(dataset(rows), filtered({ bookingCreatedFrom: "2026-09-02", bookingCreatedTo: "2026-09-02", source: "public" }));
  assert.equal(result.core.bookings, 63); assert.equal(result.core.guests, 284); assert.equal(result.core.bookingValue, 417617); assert.equal(result.core.amountPaid, 257174); assert.equal(result.core.confirmed, 47); assert.equal(result.core.pendingPayment, 16);
});

test("management routes require analytics permission and export eight named sheets", async () => {
  const route = await readFile(new URL("../app/api/admin/analytics/management/route.ts", import.meta.url), "utf8");
  const exportRoute = await readFile(new URL("../app/api/admin/analytics/management/export/route.ts", import.meta.url), "utf8");
  const workbook = await readFile(new URL("./exports/managementAnalyticsWorkbook.ts", import.meta.url), "utf8");
  assert.match(route, /requireActiveStaff\(request\)/); assert.match(route, /analytics:read/);
  assert.match(exportRoute, /requireActiveStaff\(request\)/); assert.match(exportRoute, /analytics:read/);
  for (const sheet of ["EXEC SUMMARY", "BOOKINGS", "PAYMENTS", "SEATING", "SHOWS", "PERFORMANCE DEMAND", "DAY OF WEEK", "LEAD TIME"]) assert.match(workbook, new RegExp(`addWorksheet\\(\\"${sheet}\\"\\)`));
});

test("Analytics UI is isolated from Admin root state and offers required management controls", async () => {
  const component = await readFile(new URL("../app/admin/ManagementAnalytics.tsx", import.meta.url), "utf8");
  assert.match(component, /Performance Demand/); assert.match(component, /Tuesday/); assert.match(component, /Midweek vs Weekend/); assert.match(component, /Performance Month Demand/); assert.match(component, /Booking Lead Time/); assert.match(component, /Export Report/);
  assert.doesNotMatch(component, /setBookings|setCustomers|saveBookings/);
});
