import ExcelJS from "exceljs";

import {
  boxOfficeReportTimezone,
  type BoxOfficeFinancialReport,
  type BoxOfficeReportFilters,
} from "../boxOfficeFinancialReport.ts";

const gold = "D8C36A";
const warmBlack = "15120D";
const ivory = "FFF8E7";
const currencyFormat = '"R"#,##0.00';

export function successfulPaymentsFilename(filters: Pick<BoxOfficeReportFilters, "from" | "to">) {
  return `Zingara_Successful_Payments_${filters.from}_to_${filters.to}.xlsx`;
}

export async function buildSuccessfulPaymentsWorkbook(
  report: BoxOfficeFinancialReport,
  filters: BoxOfficeReportFilters,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zingara Booking Platform";
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet("SUCCESSFUL PAYMENTS");

  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = "ZINGARA / THE ROYAL COUNTESS · SUCCESSFUL PAYMENTS";
  sheet.getCell("A1").font = { bold: true, color: { argb: ivory }, size: 18 };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: warmBlack } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells("A2:J2");
  sheet.getCell("A2").value =
    `${filters.from} to ${filters.to} · ${boxOfficeReportTimezone} · ` +
    `${filters.location === "all" ? "All venues" : filters.location === "johannesburg" ? "JHB" : "CPT"}`;
  sheet.mergeCells("A3:J3");
  sheet.getCell("A3").value =
    `${report.successfulPayments.count} successful payments · ` +
    `Amount received R${report.successfulPayments.amountReceived.toFixed(2)} · ` +
    `Refunds R${report.successfulPayments.refunds.toFixed(2)} · ` +
    `Net receipts R${report.successfulPayments.netReceived.toFixed(2)}`;
  sheet.mergeCells("A4:J4");
  sheet.getCell("A4").value =
    "Ticket Sale Amount and Show Gratuity are current authoritative booking-level sale context and may repeat when one booking has multiple successful payments. Amount Paid and Booking Fee belong to the individual payment event.";
  sheet.getCell("A4").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(4).height = 32;

  const headers = [
    "Payment Date",
    "Customer Name",
    "Booking Reference",
    "Location",
    "Pax",
    "Ticket Sale Amount",
    "Show Gratuity",
    "Booking Fee",
    "Payment Type",
    "Amount Paid",
  ];
  const headerRow = sheet.getRow(6);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: warmBlack } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gold } };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  for (const payment of report.successfulPayments.rows) {
    const row = sheet.addRow([
      new Date(payment.paymentDate),
      payment.customerName,
      payment.bookingReference,
      payment.location === "johannesburg" ? "JHB" : "CPT",
      payment.guestCount,
      payment.ticketSaleAmount,
      payment.showGratuity,
      payment.bookingFee,
      payment.paymentType,
      payment.amountPaid,
    ]);
    row.alignment = { vertical: "top", wrapText: true };
  }

  sheet.getColumn(1).numFmt = "dd mmm yyyy hh:mm:ss";
  for (const column of [6, 7, 8, 10]) sheet.getColumn(column).numFmt = currencyFormat;
  [22, 28, 20, 12, 10, 20, 18, 16, 18, 18].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 6 }];
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: headers.length },
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
