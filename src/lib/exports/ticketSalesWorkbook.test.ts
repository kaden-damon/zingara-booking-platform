import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import type { TicketSalesReport } from "../ticketSalesReport.ts";
import { buildTicketSalesWorkbook, ticketSalesFilename } from "./ticketSalesWorkbook.ts";

const report = {
  daily: [{ amountPaid: 1_000, bookingValue: 1_500, bookings: 1, date: "2026-10-01", outstanding: 500, ticketsSold: 2 }],
  excluded: { complimentary: 1, importedUnreliableSaleDate: 2, inactiveLifecycle: 3, unpaidTicketEntitlements: 4 },
  filters: { bookingType: "all", from: "2026-09-30", paymentStatus: "all", performanceId: "", to: "2026-10-20", venue: "all" },
  generatedAt: "2026-10-20T10:00:00Z",
  performances: [],
  rows: [{ amountPaid: 1_000, bookingReference: "ZNG-ONE", bookingType: "standard", bookingValue: 1_500, customerName: "Guest", outstanding: 500, paymentStatus: "deposit_paid", performance: "Show · 18:00", performanceDate: "2026-10-10", saleDate: "2026-10-01", saleTimestamp: "2026-10-01T10:00:00Z", showId: "show-a", ticketEntitlements: 2, venue: "cape-town" }],
  summary: { amountPaid: 1_000, bookingValue: 1_500, bookings: 1, outstanding: 500, ticketsSold: 2 },
  timezone: "Africa/Johannesburg",
  venues: [{ amountPaid: 1_000, bookingValue: 1_500, bookings: 1, outstanding: 500, ticketsSold: 2, venue: "cape-town" }, { amountPaid: 0, bookingValue: 0, bookings: 0, outstanding: 0, ticketsSold: 0, venue: "johannesburg" }],
} satisfies TicketSalesReport;

test("workbook contains complete summary, daily, venue and booking detail sheets", async () => {
  const buffer = await buildTicketSalesWorkbook(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["SUMMARY", "DAILY BREAKDOWN", "VENUE COMPARISON", "BOOKING DETAIL"]);
  assert.equal(workbook.getWorksheet("SUMMARY")?.getCell("B5").value, 2);
  assert.equal(workbook.getWorksheet("BOOKING DETAIL")?.getCell("C5").value, "ZNG-ONE");
  assert.equal(workbook.getWorksheet("BOOKING DETAIL")?.autoFilter?.toString().includes("A4:M4"), true);
});

test("filename includes venue and SAST sale range", () => {
  assert.equal(ticketSalesFilename(report), "Zingara_Ticket_Sales_ALL_2026-09-30_to_2026-10-20.xlsx");
});
