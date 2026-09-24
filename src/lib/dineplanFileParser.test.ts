import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseDineplanFile, parseDineplanPdfText } from "./dineplanFileParser.ts";

function createTextPdf(lines: string[]) {
  const escapeText = (value: string) => value.replace(/([\\()])/g, "\\$1");
  const content = [
    "BT",
    "/F1 9 Tf",
    "40 790 Td",
    ...lines.flatMap((line, index) => [index ? "0 -14 Td" : "", `(${escapeText(line)}) Tj`].filter(Boolean)),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

test("Dineplan PDF text table parses into reservation records", () => {
  const text = `Johannesburg\nReport Date: 23/09/2026\nGenerated: 24/09/2026 07:40\nTime   Pax   Guest                    Payment          Notes        Telephone     Seating                  Table\n17:00  2     Dione Pieterse           Deposit Paid                   0821234567    Private Raised Booths    21\n17:00  9     Shannon Hennessy         Deposit Paid                   0820000000    Golden Circle            402\nReservations: 2\nCovers: 11`;
  const records = parseDineplanPdfText(text);
  assert.equal(records.length, 2);
  assert.equal(records[0].Guest, "Dione Pieterse");
  assert.equal(records[0].Table, "21");
  assert.equal(records[1].Pax, "9");
});

test("invalid PDF text without reservation headers is rejected", () => {
  assert.throws(() => parseDineplanPdfText("Dineplan summary only"), /columns could not be detected/i);
});

test("valid Dineplan CSV parses into a normalized snapshot", async () => {
  const csv = [
    "Booking Reference,Booking Date,Time,Covers,Guest Name,Payment,Seating Area,Table(s)",
    "DIONE,23/09/2026,17:00,2,Dione Pieterse,Deposit Paid,Private Raised Booths,21",
  ].join("\n");
  const parsed = await parseDineplanFile({
    bytes: Buffer.from(csv),
    filename: "Dineplan_JHB_2026-09-23.csv",
    mimeType: "text/csv",
  });
  assert.equal(parsed.reservations.length, 1);
  assert.equal(parsed.reservations[0].sourceReference, "DIONE");
  assert.equal(parsed.venue, "johannesburg");
});

test("valid Dineplan PDF parses through the file boundary", async () => {
  const text = `Johannesburg\nReport Date: 23/09/2026\nGenerated: 24/09/2026 07:40\nTime   Pax   Guest                    Payment          Notes        Telephone     Seating                  Table\n17:00  2     Dione Pieterse           Deposit Paid                   0821234567    Private Raised Booths    21`;
  const parsed = await parseDineplanFile({
    bytes: Buffer.from("%PDF-1.4 test fixture"),
    extractPdfText: async () => text,
    filename: "Dineplan_JHB_2026-09-23.pdf",
    mimeType: "application/pdf",
  });
  assert.equal(parsed.reservations.length, 1);
  assert.equal(parsed.reservations[0].guestName, "Dione Pieterse");
  assert.equal(parsed.generatedAt, "2026-09-24T07:40:00+02:00");
});

test("real Dineplan PDF parses through the server worker runtime", async () => {
  const bytes = createTextPdf([
    "Johannesburg",
    "Report Date: 23/09/2026",
    "Generated: 24/09/2026 07:40",
    "Time   Pax   Guest                    Payment          Notes        Telephone     Seating                  Table",
    "17:00  2     Dione Pieterse           Deposit Paid                   0821234567    Private Raised Booths    21",
  ]);
  const parsed = await parseDineplanFile({
    bytes,
    filename: "Dineplan_JHB_2026-09-23.pdf",
    mimeType: "application/pdf",
  });
  assert.equal(parsed.venue, "johannesburg");
  assert.equal(parsed.generatedAt, "2026-09-24T07:40:00+02:00");
  assert.equal(parsed.reservations.length, 1);
  assert.equal(parsed.reservations[0].performanceDate, "2026-09-23");
  assert.equal(parsed.reservations[0].performanceTime, "17:00");
  assert.equal(parsed.reservations[0].pax, 2);
});

test("valid Dineplan XLSX parses through the file boundary", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Reservations");
  worksheet.addRow(["Booking Reference", "Booking Date", "Time", "Covers", "Guest Name", "Payment", "Seating Area", "Table(s)"]);
  worksheet.addRow(["DP-XLSX", "23/09/2026", "17:00", 3, "Anthea Example", "Fully Paid", "Golden Circle", "402"]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseDineplanFile({
    bytes,
    filename: "Dineplan_JHB_2026-09-23.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  assert.equal(parsed.reservations.length, 1);
  assert.equal(parsed.reservations[0].sourceReference, "DP-XLSX");
  assert.equal(parsed.reservations[0].pax, 3);
});

test("unsupported and invalid files are rejected before persistence", async () => {
  await assert.rejects(
    parseDineplanFile({ bytes: Buffer.from("not a workbook"), filename: "legacy.xls", mimeType: "application/vnd.ms-excel" }),
    /PDF, CSV or XLSX/i,
  );
  await assert.rejects(
    parseDineplanFile({ bytes: Buffer.from("not a pdf"), filename: "report.pdf", mimeType: "application/pdf" }),
    /not a valid PDF/i,
  );
});
