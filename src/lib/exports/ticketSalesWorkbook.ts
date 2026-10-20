import ExcelJS from "exceljs";

import type { TicketSalesReport } from "../ticketSalesReport.ts";

const gold = "D8C36A";
const black = "15120D";
const ivory = "FFF8E7";
const moneyFormat = '"R"#,##0.00';

export function ticketSalesFilename(report: Pick<TicketSalesReport, "filters">) {
  const venue = report.filters.venue === "all" ? "ALL" : report.filters.venue === "cape-town" ? "CPT" : "JHB";
  return `Zingara_Ticket_Sales_${venue}_${report.filters.from}_to_${report.filters.to}.xlsx`;
}

function styleTitle(sheet: ExcelJS.Worksheet, endColumn: number, title: string, subtitle: string) {
  sheet.mergeCells(1, 1, 1, endColumn);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, color: { argb: ivory }, size: 17 };
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: black } };
  sheet.mergeCells(2, 1, 2, endColumn);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getRow(1).height = 28;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: black } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gold } };
  row.alignment = { vertical: "middle", wrapText: true };
}

export async function buildTicketSalesWorkbook(report: TicketSalesReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zingara Booking Platform";
  workbook.created = new Date(report.generatedAt);
  const subtitle = `${report.filters.from} to ${report.filters.to} · Africa/Johannesburg · ${report.filters.venue === "all" ? "All venues" : report.filters.venue === "cape-town" ? "Cape Town" : "Johannesburg"}`;

  const summary = workbook.addWorksheet("SUMMARY");
  styleTitle(summary, 2, "ZINGARA · TICKET SALES", subtitle);
  styleHeader(summary.getRow(4));
  summary.getRow(4).values = ["Metric", "Value"];
  [
    ["Tickets sold", report.summary.ticketsSold],
    ["Bookings", report.summary.bookings],
    ["Booking value", report.summary.bookingValue],
    ["Current verified paid", report.summary.amountPaid],
    ["Current outstanding", report.summary.outstanding],
    ["Imported rows excluded (unreliable sale date)", report.excluded.importedUnreliableSaleDate],
    ["Complimentary rows excluded", report.excluded.complimentary],
    ["Inactive lifecycle rows excluded", report.excluded.inactiveLifecycle],
  ].forEach((values) => summary.addRow(values));
  summary.getColumn(1).width = 46;
  summary.getColumn(2).width = 22;
  [7, 8, 9].forEach((row) => { summary.getCell(row, 2).numFmt = moneyFormat; });

  const daily = workbook.addWorksheet("DAILY BREAKDOWN");
  styleTitle(daily, 6, "TICKET SALES · DAILY BREAKDOWN", subtitle);
  daily.getRow(4).values = ["Sale Date", "Tickets", "Bookings", "Booking Value", "Current Paid", "Outstanding"];
  styleHeader(daily.getRow(4));
  report.daily.forEach((row) => daily.addRow([row.date, row.ticketsSold, row.bookings, row.bookingValue, row.amountPaid, row.outstanding]));
  [4, 5, 6].forEach((column) => { daily.getColumn(column).numFmt = moneyFormat; });
  [16, 12, 12, 20, 20, 20].forEach((width, i) => { daily.getColumn(i + 1).width = width; });

  const venues = workbook.addWorksheet("VENUE COMPARISON");
  styleTitle(venues, 6, "TICKET SALES · VENUE COMPARISON", subtitle);
  venues.getRow(4).values = ["Venue", "Tickets", "Bookings", "Booking Value", "Current Paid", "Outstanding"];
  styleHeader(venues.getRow(4));
  report.venues.forEach((row) => venues.addRow([row.venue === "cape-town" ? "Cape Town" : "Johannesburg", row.ticketsSold, row.bookings, row.bookingValue, row.amountPaid, row.outstanding]));
  [4, 5, 6].forEach((column) => { venues.getColumn(column).numFmt = moneyFormat; });
  [18, 12, 12, 20, 20, 20].forEach((width, i) => { venues.getColumn(i + 1).width = width; });

  const detail = workbook.addWorksheet("BOOKING DETAIL");
  styleTitle(detail, 13, "TICKET SALES · BOOKING DETAIL", subtitle);
  detail.getRow(4).values = ["Sale Date", "Sale Time", "Booking Ref", "Customer / Company", "Venue", "Type", "Payment", "Tickets", "Booking Value", "Current Paid", "Outstanding", "Performance Date", "Performance"];
  styleHeader(detail.getRow(4));
  report.rows.forEach((row) => detail.addRow([
    row.saleDate, new Date(row.saleTimestamp), row.bookingReference, row.customerName,
    row.venue === "cape-town" ? "Cape Town" : "Johannesburg", row.bookingType, row.paymentStatus,
    row.ticketEntitlements, row.bookingValue, row.amountPaid, row.outstanding, row.performanceDate, row.performance,
  ]));
  detail.getColumn(2).numFmt = "dd mmm yyyy hh:mm:ss";
  [9, 10, 11].forEach((column) => { detail.getColumn(column).numFmt = moneyFormat; });
  [14, 22, 18, 30, 16, 14, 18, 10, 18, 18, 18, 16, 36].forEach((width, i) => { detail.getColumn(i + 1).width = width; });
  detail.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 13 } };
  detail.views = [{ state: "frozen", ySplit: 4 }];

  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => { row.alignment = { ...row.alignment, vertical: "top", wrapText: true }; });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
