import ExcelJS from "exceljs";

import {
  analyticsTimezone,
  calculateManagementAnalytics,
  getManagementForecastAttention,
  getJohannesburgDateKey,
  selectManagementForecastRows,
  type ManagementAnalyticsDataset,
  type ManagementAnalyticsFilters,
  type ManagementForecastScope,
} from "../managementAnalytics.ts";

const gold = "D8C36A";
const warmBlack = "15120D";
const ivory = "FFF8E7";
const currencyFormat = '"R"#,##0.00';
const percentageFormat = "0.0%";

export const managementForecastHeaders = [
  "DATE",
  "VENUE",
  "GUESTS BOOKED",
  "GC",
  "MR",
  "PB",
  "RB",
  "OCCUPANCY %",
  "AMOUNT PAID",
  "CONFIRMED",
  "DEPOSIT-PAID",
  "FULLY-PAID",
  "COMPLIMENTARY",
  "ATTENTION",
] as const;

function venueLabel(venue: "cape-town" | "johannesburg") {
  return venue === "cape-town" ? "CPT" : "JHB";
}

export function managementForecastFilename(
  rows: Array<{ date: string }>,
  filters: ManagementAnalyticsFilters,
  asOf: string,
) {
  const from = filters.performanceFrom || rows[0]?.date || getJohannesburgDateKey(asOf);
  const to = filters.performanceTo || rows.at(-1)?.date || from;
  return `Zingara_Management_Forecast_${from}_to_${to}.xlsx`;
}

export async function buildManagementForecastWorkbook(
  dataset: ManagementAnalyticsDataset,
  filters: ManagementAnalyticsFilters,
  scope: ManagementForecastScope = "future",
) {
  const analytics = calculateManagementAnalytics(dataset, filters);
  const rows = selectManagementForecastRows(
    analytics.performanceDemand,
    dataset.asOf,
    scope,
  );
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zingara Booking Platform";
  workbook.created = new Date(dataset.asOf);
  const sheet = workbook.addWorksheet("MANAGEMENT FORECAST");

  sheet.mergeCells("A1:N1");
  sheet.getCell("A1").value = "ZINGARA / THE ROYAL COUNTESS · MANAGEMENT FORECAST";
  sheet.getCell("A1").font = { bold: true, color: { argb: ivory }, size: 18 };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: warmBlack },
  };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells("A2:N2");
  sheet.getCell("A2").value =
    `${filters.performanceFrom || "Current"} to ${filters.performanceTo || "future"} · ` +
    `${filters.venue === "all" ? "All venues" : venueLabel(filters.venue)} · ${analyticsTimezone}`;

  const headerRow = sheet.getRow(4);
  headerRow.values = [...managementForecastHeaders];
  headerRow.font = { bold: true, color: { argb: warmBlack } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: gold },
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  for (const row of rows) {
    const worksheetRow = sheet.addRow([
      new Date(`${row.date}T12:00:00+02:00`),
      venueLabel(row.venue),
      row.guests,
      row.zoneGuests.gc,
      row.zoneGuests.mr,
      row.zoneGuests.pb,
      row.zoneGuests.rb,
      row.occupancy / 100,
      row.amountPaid,
      row.confirmed,
      row.depositPaid,
      row.fullyPaid,
      row.complimentary,
      getManagementForecastAttention(row),
    ]);
    worksheetRow.alignment = { vertical: "top", wrapText: true };
  }

  sheet.getColumn(1).numFmt = "dd mmm yyyy";
  sheet.getColumn(8).numFmt = percentageFormat;
  sheet.getColumn(9).numFmt = currencyFormat;
  [18, 10, 16, 8, 8, 8, 8, 15, 18, 14, 16, 14, 18, 22].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: managementForecastHeaders.length },
  };

  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    filename: managementForecastFilename(rows, filters, dataset.asOf),
    rows,
  };
}
