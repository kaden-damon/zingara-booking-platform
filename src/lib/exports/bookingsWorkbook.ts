import ExcelJS from "exceljs";

import type { BookingsExportRow } from "../bookingsExport";

const gold = "D8C36A";
const warmBlack = "15120D";
const ivory = "FFF8E7";
const currencyFormat = '"R"#,##0.00';
const reportTimezone = "Africa/Johannesburg";

export const bookingsExportHeaders = [
  "Booking Reference",
  "Customer Name",
  "Company",
  "Email",
  "Mobile",
  "Booking Type",
  "Venue",
  "Performance Date",
  "Show Time",
  "Guests",
  "Seating Section",
  "Table / Floor State",
  "Booking Status",
  "Archive State",
  "Payment Status",
  "Booking Value",
  "Amount Paid",
  "Outstanding",
  "Complimentary",
  "Booking Source",
  "Created By",
  "Created Date",
  "Last Updated",
  "Replacement / Current Reference",
  "Cancellation Reason",
  "Attention",
] as const;

export function bookingsExportFilename(generatedAt: string) {
  const date = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: reportTimezone,
    year: "numeric",
  }).format(new Date(generatedAt));
  return `Zingara_Bookings_${date}.xlsx`;
}

function safeMetadata(value: string) {
  const trimmed = value.trim().slice(0, 2000);
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function performanceDate(value: string) {
  return new Date(`${value}T12:00:00+02:00`);
}

function johannesburgExcelDateTime(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: reportTimezone,
      year: "numeric",
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour === 24 ? 0 : parts.hour,
      parts.minute,
      parts.second,
    ),
  );
}

export async function buildBookingsWorkbook(input: {
  exportedAt: string;
  exportedBy: string;
  filterSummary: string;
  rows: BookingsExportRow[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zingara Booking Platform";
  workbook.created = new Date(input.exportedAt);

  const sheet = workbook.addWorksheet("Bookings");
  const headerRow = sheet.getRow(1);
  headerRow.values = [...bookingsExportHeaders];
  headerRow.font = { bold: true, color: { argb: warmBlack } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: gold },
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 30;

  for (const booking of input.rows) {
    const row = sheet.addRow([
      booking.bookingReference,
      booking.customerName,
      booking.company,
      booking.email,
      booking.mobile,
      booking.bookingType,
      booking.venue,
      performanceDate(booking.performanceDate),
      booking.showTime,
      booking.guestCount,
      booking.seatingSection,
      booking.floorState,
      booking.bookingStatus,
      booking.archiveState,
      booking.paymentStatus,
      booking.bookingValue,
      booking.amountPaid,
      booking.outstanding,
      booking.complimentary,
      booking.bookingSource,
      booking.createdBy,
      johannesburgExcelDateTime(booking.createdAt),
      johannesburgExcelDateTime(booking.lastUpdated),
      booking.replacementReference,
      booking.cancellationReason,
      booking.attention,
    ]);
    row.alignment = { vertical: "top", wrapText: true };
  }

  sheet.getColumn(8).numFmt = "dd mmm yyyy";
  sheet.getColumn(10).numFmt = "0";
  for (const column of [16, 17, 18]) sheet.getColumn(column).numFmt = currencyFormat;
  for (const column of [22, 23]) sheet.getColumn(column).numFmt = "dd mmm yyyy hh:mm";
  [
    20, 28, 26, 30, 20, 16, 12, 18, 12, 10, 30, 24, 18, 15, 18, 18, 18,
    18, 16, 22, 24, 22, 22, 30, 28, 24,
  ].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: bookingsExportHeaders.length },
  };

  const info = workbook.addWorksheet("Export Info");
  info.getColumn(1).width = 22;
  info.getColumn(2).width = 110;
  info.addRow(["ZINGARA BOOKINGS EXPORT"]);
  info.mergeCells("A1:B1");
  info.getCell("A1").font = { bold: true, color: { argb: ivory }, size: 16 };
  info.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: warmBlack },
  };
  info.addRow(["Exported At", johannesburgExcelDateTime(input.exportedAt)]);
  info.addRow(["Exported By", safeMetadata(input.exportedBy)]);
  info.addRow(["Active Filters", safeMetadata(input.filterSummary)]);
  info.addRow(["Result Count", input.rows.length]);
  info.getColumn(2).alignment = { vertical: "top", wrapText: true };
  info.getCell("B2").numFmt = "dd mmm yyyy hh:mm";
  info.getColumn(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
