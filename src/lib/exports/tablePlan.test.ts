import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ExcelJS from "exceljs";

import {
  buildTablePlanWorkbook,
  type TablePlanBooking,
  type TablePlanCustomer,
  type TablePlanTable,
} from "./tablePlan.ts";

function table(
  id: string,
  code: string,
  bookingId: string | null,
  overrides: Partial<TablePlanTable> = {},
): TablePlanTable {
  return {
    availability_scope: "operational",
    booking_id: bookingId,
    capacity: 6,
    capacity_configured: true,
    id,
    is_override: false,
    is_physical: true,
    merged_from: null,
    merged_parent_id: null,
    override_notes: null,
    section: "middle-ring",
    status: bookingId ? "booked" : "available",
    table_code: code,
    ...overrides,
  };
}

function booking(
  id: string,
  reference: string,
  pax: number,
  tableId: string | null,
  overrides: Partial<TablePlanBooking> = {},
): TablePlanBooking {
  return {
    amount_paid: pax * 50,
    archived_at: null,
    balance_outstanding: pax * 50,
    booking_origin: "data_import",
    booking_reference: reference,
    booking_status: "confirmed",
    customer_id: `customer-${id}`,
    dietary_requirements: null,
    guest_count: pax,
    id,
    notes: null,
    payment_status: "deposit_paid",
    section: "middle-ring",
    table_id: tableId,
    total_amount: pax * 100,
    ...overrides,
  };
}

function customer(id: string, name: string): TablePlanCustomer {
  return {
    dietary_requirements: null,
    email: `${name.toLowerCase().replaceAll(" ", ".")}@example.com`,
    first_name: name,
    id: `customer-${id}`,
    mobile: "+27110000000",
    relationship_notes: null,
    surname: null,
  };
}

function cellNumber(value: ExcelJS.CellValue) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value) {
    return typeof value.result === "number" ? value.result : 0;
  }
  return 0;
}

test("Table Plan exports physical claims with singular booking totals", async () => {
  const bookings = [
    booking("one", "ONE", 4, "table-1"),
    booking("two", "TWO", 10, "table-2"),
    booking("five", "FIVE", 30, "merged-five", {
      notes: "Birthday dinner | Final Dineplan source: workbook row 1 | Source fingerprint: abc",
    }),
    booking("temp", "TEMP", 2, "temp-1"),
    booking("queue", "QUEUE", 3, null),
    booking("released", "RELEASED", 2, "released-table"),
    booking("balcony", "BALCONY", 2, "table-800", {
      notes: "Balcony note",
      section: "royal-balcony",
    }),
  ];
  const tables = [
    table("table-1", "1", "one"),
    table("table-2", "2", "two"),
    table("table-10", "10", "two"),
    table("released-table", "11", null),
    table("temp-1", "TEMP-1", "temp", { is_physical: false }),
    table("table-800", "800", "balcony", { section: "royal-balcony" }),
    table("merged-five", "20+21+22+23+24", "five", {
      capacity: 30,
      is_physical: false,
      merged_from: ["table-20", "table-21", "table-22", "table-23", "table-24"],
    }),
    ...[20, 21, 22, 23, 24].map((code) =>
      table(`table-${code}`, String(code), null, {
        merged_parent_id: "merged-five",
        status: "disabled",
      }),
    ),
    ...[406, 500, 505, 506, 600].map((code) =>
      table(`table-${code}`, String(code), null, {
        section: "golden-circle",
      }),
    ),
  ];
  const customers = [
    customer("one", "Single Guest"),
    customer("two", "Two Table Guest"),
    customer("five", "Five Table Guest"),
    customer("temp", "Temporary Guest"),
    customer("queue", "Queue Guest"),
    customer("released", "Released Guest"),
    customer("balcony", "Balcony Guest"),
  ];
  const buffer = await buildTablePlanWorkbook({
    bookings,
    configuredZonePrices: {
      "golden-circle": 100,
      "middle-ring": 100,
      "private-booths": 100,
      "royal-balcony": 100,
    },
    customers,
    payments: [
      {
        amount: 500,
        booking_id: "two",
        method: "card",
        notes: null,
        payment_status: "deposit_paid",
        payment_type: "deposit",
      },
    ],
    show: {
      date: "2026-09-10",
      id: "show-1",
      name: "Test Show",
      time: "17:00:00",
      venue: "johannesburg",
    },
    tables,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Table Plan");
  const notes = workbook.getWorksheet("Notes");

  assert.ok(sheet);
  assert.ok(notes);
  const rows = Array.from({ length: sheet.rowCount }, (_, index) => sheet.getRow(index + 1));
  const bookingRows = rows.filter((row) => String(row.getCell(5).value ?? "").includes("Guest"));
  const tableCodes = rows
    .map((row) => String(row.getCell(2).value ?? ""))
    .filter((value) => /^(?:\d+|TEMP-1)$/.test(value));

  assert.deepEqual(tableCodes.slice(0, 4), ["1", "2", "10", "11"]);
  assert.deepEqual(
    tableCodes.filter((value) => ["20", "21", "22", "23", "24"].includes(value)),
    ["20", "21", "22", "23", "24"],
  );
  const rowForTable = (tableCode: string) =>
    rows.find((row) => String(row.getCell(2).value ?? "") === tableCode)!
      .number;
  const capacitySubtotals = rows.filter((row) => {
    const value = row.getCell(3).value;
    return (
      value &&
      typeof value === "object" &&
      "formula" in value &&
      /^SUM\(C\d+:C\d+\)$/.test(String(value.formula))
    );
  });
  const subtotalAfter = (rowNumber: number) =>
    capacitySubtotals.find((row) => row.number > rowNumber)!;
  const subtotal400 = subtotalAfter(rowForTable("406"));
  const subtotal500 = subtotalAfter(rowForTable("500"));
  const subtotal600 = subtotalAfter(rowForTable("600"));

  assert.ok(rowForTable("406") < subtotal400.number);
  assert.ok(subtotal400.number < rowForTable("500"));
  assert.ok(rowForTable("500") < rowForTable("505"));
  assert.ok(rowForTable("505") < rowForTable("506"));
  assert.ok(rowForTable("506") < subtotal500.number);
  assert.ok(subtotal500.number < rowForTable("600"));
  assert.ok(rowForTable("600") < subtotal600.number);
  assert.notEqual(subtotal400.number, subtotal500.number);
  assert.notEqual(subtotal500.number, subtotal600.number);
  assert.equal(cellNumber(subtotal400.getCell(3).value), 6);
  assert.equal(cellNumber(subtotal500.getCell(3).value), 18);
  assert.equal(cellNumber(subtotal600.getCell(3).value), 6);
  assert.equal(tableCodes.some((value) => value.includes("+")), false);
  assert.equal(
    bookingRows.filter((row) => row.getCell(5).value === "Single Guest").length,
    1,
  );
  assert.equal(
    bookingRows.filter((row) => row.getCell(5).value === "Two Table Guest").length,
    2,
  );
  assert.equal(
    bookingRows.filter((row) => row.getCell(5).value === "Five Table Guest").length,
    5,
  );
  assert.deepEqual(
    bookingRows
      .filter((row) => row.getCell(5).value === "Two Table Guest")
      .map((row) => cellNumber(row.getCell(4).value)),
    [6, 4],
  );
  assert.equal(
    bookingRows.reduce((total, row) => total + cellNumber(row.getCell(4).value), 0),
    53,
  );
  assert.equal(
    bookingRows
      .filter((row) => row.getCell(5).value === "Two Table Guest")
      .reduce((total, row) => total + cellNumber(row.getCell(9).value), 0),
    500,
  );
  const twoTableRows = bookingRows.filter(
    (row) => row.getCell(5).value === "Two Table Guest",
  );
  assert.deepEqual(
    Array.from({ length: 13 }, (_, index) => twoTableRows[1].getCell(8 + index).value),
    Array(13).fill(null),
  );
  const unknownMethodRow = bookingRows.find(
    (row) => row.getCell(5).value === "Single Guest",
  );
  assert.ok(unknownMethodRow);
  assert.deepEqual(
    [8, 9, 10, 11].map((column) => cellNumber(unknownMethodRow.getCell(column).value)),
    [0, 0, 0, 0],
  );
  assert.equal(cellNumber(unknownMethodRow.getCell(12).value), 200);
  assert.deepEqual(
    Array.from({ length: 13 }, (_, index) =>
      String(sheet.getRow(3).getCell(8 + index).value ?? "").trim(),
    ),
    [
      "FULL-PYT-CC",
      "PRE-PYT /CC",
      "PRE-PYT /EFT",
      "FULL-PYT/EFT",
      "TO PAY",
      "MEDIA",
      "COMP",
      "HALAAL MEALS",
      "KOSHER MEALS",
      "T/GRT-PAID",
      "B/TAB PAID",
      "B/GRAT PAID",
      "TIPS",
    ],
  );
  assert.equal(
    rows.some(
      (row) =>
        row.getCell(2).value === "11" && row.getCell(5).value === "Released Guest",
    ),
    false,
  );
  assert.equal(
    bookingRows.filter((row) => row.getCell(5).value === "Released Guest")[0]
      ?.getCell(2).value,
    "UNASSIGNED",
  );
  assert.equal(
    bookingRows.filter((row) => row.getCell(5).value === "Queue Guest")[0]
      ?.getCell(2).value,
    "UNASSIGNED",
  );
  assert.equal(
    bookingRows.filter((row) => row.getCell(5).value === "Temporary Guest")[0]
      ?.getCell(2).value,
    "TEMP-1",
  );
  const noteText = notes.getSheetValues().flat(Infinity).join(" | ");
  assert.equal(notes.getCell("A1").value, "Table notes: 10 September 2026");
  assert.match(noteText, /Birthday dinner/);
  assert.match(noteText, /Balcony Guest.*Balcony note/);
  assert.doesNotMatch(noteText, /Dineplan|fingerprint/i);
});

test("Table Plan route remains batched and includes report-critical booking state", () => {
  const route = readFileSync(
    new URL("../../app/api/admin/analytics/table-plan/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /show_tables/);
  assert.match(route, /zone_entitlements/);
  assert.match(route, /await Promise\.all\(\[/);
  assert.doesNotMatch(route, /\.not\("table_id",\s*"is",\s*null\)/);
});
