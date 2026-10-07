import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  formatBookingExportFloorState,
  formatBookingExportSeating,
  getBookingExportType,
  type BookingsExportRow,
} from "./bookingsExport";
import {
  bookingsExportFilename,
  bookingsExportHeaders,
  buildBookingsWorkbook,
} from "./exports/bookingsWorkbook";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

function exportRow(index: number): BookingsExportRow {
  return {
    amountPaid: 500,
    archiveState: "Active",
    attention: index % 2 ? "Table needed" : "",
    bookingReference: `ZNG-${String(index).padStart(6, "0")}`,
    bookingSource: "Box Office",
    bookingStatus: "Confirmed",
    bookingType: index % 2 ? "Corporate" : "Standard",
    bookingValue: 1000,
    cancellationReason: "",
    company: index % 2 ? "Example Company" : "",
    complimentary: "No",
    createdAt: "2026-09-01T08:00:00.000Z",
    createdBy: "Lisa Rodderick",
    customerName: `Guest ${index}`,
    email: `guest${index}@example.com`,
    floorState: index % 2 ? "Table needed" : "Table 12",
    guestCount: index + 1,
    lastUpdated: "2026-10-07T08:00:00.000Z",
    mobile: "+27110000000",
    outstanding: 500,
    paymentStatus: "Deposit paid",
    performanceDate: "2026-11-01",
    replacementReference: "",
    seatingSection: "Golden Circle",
    showTime: "18:00",
    venue: "CPT",
  };
}

test("multi-zone Corporate bookings stay at one booking grain", () => {
  assert.equal(
    formatBookingExportSeating("Private Booths", [
      { pax: 100, zoneId: "royal-booths" },
      { pax: 20, zoneId: "royal-balcony" },
    ]),
    "Private Booths: 100; Royal Balcony: 20",
  );
  assert.equal(
    getBookingExportType({
      bookingOrigin: "corporate",
      bookingSource: "corporate-direct",
      corporateRequestId: "request-1",
    }),
    "Corporate",
  );
});

test("Floor state uses current table claims without deciding booking validity", () => {
  assert.equal(
    formatBookingExportFloorState({
      bookingStatus: "confirmed",
      hasStoredTable: true,
      tableCodes: ["402", "401"],
    }),
    "Tables 401 + 402",
  );
  assert.equal(
    formatBookingExportFloorState({
      bookingStatus: "confirmed",
      hasStoredTable: false,
      tableCodes: [],
    }),
    "Table needed",
  );
});

test("workbook exports every supplied matching row, beyond one UI page", async () => {
  const rows = Array.from({ length: 75 }, (_, index) => exportRow(index + 1));
  const buffer = await buildBookingsWorkbook({
    exportedAt: "2026-10-07T08:00:00.000Z",
    exportedBy: "Kaden Damon",
    filterSummary: "Created By: Lisa Rodderick · Venue: Cape Town",
    rows,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet("Bookings");
  const info = workbook.getWorksheet("Export Info");

  assert.ok(sheet);
  assert.ok(info);
  assert.equal(sheet.rowCount - 1, 75);
  assert.deepEqual(
    sheet.getRow(1).values?.slice(1),
    [...bookingsExportHeaders],
  );
  assert.equal(sheet.views[0]?.state, "frozen");
  assert.equal(sheet.autoFilter, "A1:Z1");
  assert.equal(sheet.getColumn(16).numFmt, '"R"#,##0.00');
  assert.equal(info.getCell("B4").value, "Created By: Lisa Rodderick · Venue: Cape Town");
  assert.equal(info.getCell("B5").value, 75);
  assert.equal(sheet.getCell("U2").value, "Lisa Rodderick");
  assert.equal(
    (sheet.getCell("V2").value as Date).toISOString(),
    "2026-09-01T10:00:00.000Z",
  );
  assert.equal(
    bookingsExportFilename("2026-10-06T22:30:00.000Z"),
    "Zingara_Bookings_2026-10-07.xlsx",
  );
});

test("Bookings UI exports the exact full filtered set before pagination", async () => {
  const page = await source("../app/admin/page.tsx");
  const filterStart = page.indexOf("function bookingMatchesCurrentFilters");
  const filterEnd = page.indexOf("function getFilteredArchivableBookings");
  const filters = page.slice(filterStart, filterEnd);

  assert.match(page, /DOWNLOAD EXCEL/i);
  assert.match(page, /compactSortedBookings\.map\(\(booking\) => booking\.reference\)/);
  assert.match(page, /const bookingPagination = paginateItems\(\s*compactSortedBookings/);
  assert.ok(
    page.indexOf("compactSortedBookings.map((booking) => booking.reference)") <
      page.indexOf("const bookingPagination = paginateItems"),
  );
  assert.match(filters, /bookingMatchesCreator\(booking, bookingCreatedByFilter\)/);
  assert.match(filters, /bookingMatchesCreatedWindow\(booking\.createdAt/);
  assert.match(filters, /bookingPerformanceFrom/);
  assert.match(filters, /bookingPerformanceTo/);
  assert.match(filters, /bookingPaymentStatusFilter/);
  assert.match(filters, /getBookingZoneEntitlements\(booking\)/);
  assert.match(filters, /getBookingSearchText\(booking\)\.includes\(searchTerm\)/);
});

test("server export re-loads references and enforces role and venue scope", async () => {
  const route = await source("../app/api/admin/bookings/export/route.ts");
  const server = await source("./supabase/bookingsExportServer.ts");

  assert.match(route, /requireActiveStaff/);
  assert.match(route, /bookings:manage/);
  assert.match(route, /tickets:validate/);
  assert.match(route, /loadBookingsExportRows/);
  assert.match(route, /bookings\.filtered_exported/);
  assert.match(server, /normalizeStaffVenueScope/);
  assert.match(server, /normalizeShowLocation/);
  assert.match(server, /outside your assigned location/);
  assert.match(server, /created_by_staff_id/);
  assert.match(server, /public_checkout_superseded_by/);
  assert.match(server, /duplicate_booking_review_dispositions/);
  assert.doesNotMatch(route, /insert into public\.(bookings|payments|tickets|customers)/i);
});
