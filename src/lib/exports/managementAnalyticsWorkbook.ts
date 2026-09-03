import ExcelJS, { type Worksheet } from "exceljs";
import {
  analyticsTimezone,
  calculateManagementAnalytics,
  type ManagementAnalyticsDataset,
  type ManagementAnalyticsFilters,
} from "@/lib/managementAnalytics";

const gold = "D8C36A";
const warmBlack = "15120D";
const ivory = "FFF8E7";
const currencyFormat = '"R"#,##0.00';
const percentageFormat = "0.0%";

function titleSheet(sheet: Worksheet, title: string, filters: ManagementAnalyticsFilters, asOf: string) {
  sheet.mergeCells("A1:J1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `ZINGARA / THE ROYAL COUNTESS · ${title}`;
  titleCell.font = { bold: true, color: { argb: ivory }, size: 18 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: warmBlack } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A2:J2");
  sheet.getCell("A2").value = `Generated ${new Date(asOf).toLocaleString("en-ZA", { timeZone: analyticsTimezone })} · ${analyticsTimezone}`;
  sheet.mergeCells("A3:J3");
  sheet.getCell("A3").value = `Filters: venue ${filters.venue}; booking created ${filters.bookingCreatedFrom || "any"} to ${filters.bookingCreatedTo || "any"}; performance ${filters.performanceFrom || "any"} to ${filters.performanceTo || "any"}`;
  sheet.getCell("A3").alignment = { wrapText: true };
}

function addTable(sheet: Worksheet, rowNumber: number, headers: string[], rows: Array<Array<string | number>>) {
  const header = sheet.getRow(rowNumber);
  header.values = headers;
  header.font = { bold: true, color: { argb: warmBlack } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gold } };
  header.alignment = { vertical: "middle", wrapText: true };
  rows.forEach((values) => {
    const row = sheet.addRow(values);
    row.alignment = { vertical: "top", wrapText: true };
  });
  sheet.views = [{ state: "frozen", ySplit: rowNumber }];
  sheet.autoFilter = { from: { row: rowNumber, column: 1 }, to: { row: rowNumber, column: headers.length } };
  sheet.columns.forEach((column) => { column.width = Math.min(Math.max(column.width ?? 12, 14), 28); });
}

function moneyColumns(sheet: Worksheet, columns: number[]) {
  columns.forEach((column) => { sheet.getColumn(column).numFmt = currencyFormat; });
}

export async function buildManagementAnalyticsWorkbook(
  dataset: ManagementAnalyticsDataset,
  filters: ManagementAnalyticsFilters,
) {
  const analytics = calculateManagementAnalytics(dataset, filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zingara Booking Platform";
  workbook.created = new Date(dataset.asOf);

  const summary = workbook.addWorksheet("EXEC SUMMARY");
  titleSheet(summary, "MANAGEMENT ANALYTICS", filters, dataset.asOf);
  addTable(summary, 5, ["METRIC", "VALUE"], [
    ["Bookings", analytics.core.bookings], ["Guests", analytics.core.guests],
    ["Booking Value", analytics.core.bookingValue], ["Amount Paid", analytics.core.amountPaid],
    ["Outstanding", analytics.core.outstanding], ["Average Booking Value", analytics.core.averageBookingValue],
    ["Average Party Size", analytics.core.averagePartySize], ["Confirmed", analytics.core.confirmed],
    ["Pending Payment", analytics.core.pendingPayment], ["Cancelled", analytics.core.cancelled],
    ["New Customers", analytics.core.newCustomers], ["Returning Customers", analytics.core.returningCustomers],
  ]);
  summary.getColumn(2).numFmt = currencyFormat;
  for (const row of [6, 7, 9, 10, 11, 12, 14, 15, 16, 17]) summary.getCell(row, 2).numFmt = "0";
  summary.getCell(13, 2).numFmt = "0.00";

  const bookings = workbook.addWorksheet("BOOKINGS");
  titleSheet(bookings, "BOOKING ACTIVITY", filters, dataset.asOf);
  addTable(bookings, 5, ["SOURCE", "BOOKINGS", "GUESTS", "BOOKING VALUE", "PAID", "OUTSTANDING"], analytics.sourceAnalysis.map((row) => [row.source, row.bookings, row.guests, row.bookingValue, row.amountPaid, row.outstanding]));
  moneyColumns(bookings, [4, 5, 6]);

  const payments = workbook.addWorksheet("PAYMENTS");
  titleSheet(payments, "PAYMENT ANALYTICS", filters, dataset.asOf);
  addTable(payments, 5, ["METRIC", "VALUE"], Object.entries({
    "Successful payments": analytics.payments.successfulPaymentCount,
    "Successfully paid": analytics.payments.successfullyPaid,
    "Average successful payment": analytics.payments.averageSuccessfulPayment,
    "Full payments": analytics.payments.fullPayments,
    "Full payment value": analytics.payments.fullPaymentValue,
    "Deposits": analytics.payments.deposits,
    "Deposit value": analytics.payments.depositValue,
    "Pending checkouts": analytics.payments.pendingCheckouts,
    "Provider gross": analytics.payments.providerGross,
    "Transaction fees": analytics.payments.transactionFees,
    "Refunds": analytics.payments.refunds,
  }).map(([label, value]) => [label, value]));
  payments.getColumn(2).numFmt = currencyFormat;

  const seating = workbook.addWorksheet("SEATING");
  titleSheet(seating, "SEATING DEMAND", filters, dataset.asOf);
  addTable(seating, 5, ["ZONE", "BOOKINGS", "GUESTS", "BOOKING VALUE", "AVERAGE PARTY", "SHARE OF DEMAND"], analytics.seatingDemand.map((row) => [row.zone, row.bookings, row.guests, row.bookingValue, row.averagePartySize, row.demandShare]));
  moneyColumns(seating, [4]); seating.getColumn(6).numFmt = percentageFormat;

  const shows = workbook.addWorksheet("SHOWS");
  titleSheet(shows, "PERFORMANCE MONTH DEMAND", filters, dataset.asOf);
  addTable(shows, 5, ["MONTH", "INVENTORY", "AVAILABLE SHOWS", "BOOKINGS", "GUESTS", "BOOKING VALUE", "PAID", "OUTSTANDING", "AVG GUESTS/SHOW", "AVG OCCUPANCY"], analytics.performanceMonths.map((row) => [row.month, row.inventoryState, row.performancesAvailable, row.bookings, row.guests, row.bookingValue, row.amountPaid, row.outstanding, row.averageGuestsPerPerformance, row.averageOccupancy / 100]));
  moneyColumns(shows, [6, 7, 8]); shows.getColumn(10).numFmt = percentageFormat;

  const demand = workbook.addWorksheet("PERFORMANCE DEMAND");
  titleSheet(demand, "PERFORMANCE DEMAND", filters, dataset.asOf);
  addTable(demand, 5, ["DATE", "DAY", "VENUE", "TIME", "BOOKINGS", "GUESTS", "BOOKING VALUE", "PAID", "OUTSTANDING", "CAPACITY", "OCCUPANCY", "STATUS"], analytics.performanceDemand.map((row) => [row.date, row.dayOfWeek, row.venue, row.showTime, row.bookings, row.guests, row.bookingValue, row.amountPaid, row.outstanding, row.capacity, row.occupancy / 100, row.status]));
  moneyColumns(demand, [7, 8, 9]); demand.getColumn(11).numFmt = percentageFormat;

  const weekdays = workbook.addWorksheet("DAY OF WEEK");
  titleSheet(weekdays, "DAY OF WEEK PERFORMANCE", filters, dataset.asOf);
  addTable(weekdays, 5, ["DAY", "PERFORMANCES", "BOOKINGS", "GUESTS", "BOOKING VALUE", "PAID", "OUTSTANDING", "AVG GUESTS/SHOW", "AVG OCCUPANCY", "AVG BOOKING VALUE", "AVG PARTY"], analytics.dayOfWeek.map((row) => [row.day, row.performances, row.bookings, row.guests, row.bookingValue, row.amountPaid, row.outstanding, row.averageGuestsPerPerformance, row.averageOccupancy / 100, row.averageBookingValue, row.averagePartySize]));
  moneyColumns(weekdays, [5, 6, 7, 10]); weekdays.getColumn(9).numFmt = percentageFormat;

  const leadTime = workbook.addWorksheet("LEAD TIME");
  titleSheet(leadTime, "BOOKING LEAD TIME", filters, dataset.asOf);
  leadTime.getCell("A5").value = "Average days ahead"; leadTime.getCell("B5").value = analytics.leadTime.averageDaysAhead;
  leadTime.getCell("A6").value = "Median days ahead"; leadTime.getCell("B6").value = analytics.leadTime.medianDaysAhead;
  addTable(leadTime, 8, ["BUCKET", "BOOKINGS"], analytics.leadTime.buckets.map((row) => [row.label, row.bookings]));

  return workbook;
}
