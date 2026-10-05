import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import type { BoxOfficeFinancialReport } from "../boxOfficeFinancialReport.ts";
import {
  buildSuccessfulPaymentsWorkbook,
  successfulPaymentsFilename,
} from "./successfulPaymentsWorkbook.ts";

const report = {
  generatedAt: "2026-09-03T08:00:00+02:00",
  successfulPayments: {
    amountReceived: 7_260,
    bookingFees: 30,
    count: 3,
    netReceived: 7_260,
    refunds: 0,
    rows: [
      { amountPaid: 560, bookingFee: 10, bookingReference: "DP-NHTCQC", customerName: "Lee Kritzinger", guestCount: 15, id: "p-1", location: "johannesburg", paymentDate: "2026-09-02T14:26:12+02:00", paymentType: "Balance Payment", providerTransactionId: "325723573", seatingSection: "Private Booths", showGratuity: 0, ticketSaleAmount: 8_250 },
      { amountPaid: 5_590, bookingFee: 10, bookingReference: "DP-XSDGPC", customerName: "Valerie Stubbs", guestCount: 6, id: "p-2", location: "johannesburg", paymentDate: "2026-09-02T15:41:52+02:00", paymentType: "Balance Payment", providerTransactionId: "325745645", seatingSection: "Private Booths", showGratuity: 0, ticketSaleAmount: 8_880 },
      { amountPaid: 1_110, bookingFee: 10, bookingReference: "ZNG-LAYU3D", customerName: "Cheryl Ramdayal", guestCount: 2, id: "p-3", location: "johannesburg", paymentDate: "2026-09-02T20:37:09+02:00", paymentType: "Deposit", providerTransactionId: "325817599", seatingSection: "Middle Ring", showGratuity: 0, ticketSaleAmount: 2_710 },
    ],
  },
} as BoxOfficeFinancialReport;

test("successful payments workbook preserves event rows, formats and accounting note", async () => {
  const buffer = await buildSuccessfulPaymentsWorkbook(report, {
    bookingType: "all",
    from: "2026-09-02",
    location: "all",
    to: "2026-09-02",
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet("SUCCESSFUL PAYMENTS");
  assert.ok(sheet);
  assert.equal(sheet.getCell("A6").value, "Payment Date");
  assert.equal(sheet.getCell("J6").value, "Amount Paid");
  assert.equal(sheet.getCell("C7").value, "DP-NHTCQC");
  assert.equal(sheet.getCell("J9").value, 1_110);
  assert.match(String(sheet.getCell("A4").value), /may repeat when one booking has multiple successful payments/);
  assert.equal(sheet.autoFilter?.toString().includes("A6:J6"), true);
  assert.equal(sheet.views[0]?.state, "frozen");
});

test("successful payments filename uses the selected SAST date range", () => {
  assert.equal(
    successfulPaymentsFilename({ from: "2026-09-02", to: "2026-09-05" }),
    "Zingara_Successful_Payments_2026-09-02_to_2026-09-05.xlsx",
  );
});
