import assert from "node:assert/strict";
import test from "node:test";

import {
  sortCompactBookingRows,
  type CompactBookingRow,
} from "./compactBookingView.ts";

const row = (
  overrides: Partial<CompactBookingRow> = {},
): CompactBookingRow => ({
  balanceDue: 0,
  balanceLabel: "R0 due",
  customerName: "Ada Lovelace",
  pax: 2,
  paymentLabel: "Fully Paid",
  paymentSortValue: "fully-paid",
  reference: "ZNG-ADA001",
  section: "Middle Ring",
  sourceLabel: "Online / Website",
  statusLabel: "Confirmed",
  statusTone: "green",
  tableLabel: "Table 201",
  ...overrides,
});

test("compact booking sort handles text columns without mutating the source", () => {
  const rows = [
    row({ customerName: "Zola", reference: "ZNG-Z" }),
    row({ customerName: "  ada", reference: "ZNG-A" }),
  ];

  assert.deepEqual(
    sortCompactBookingRows(rows, "name", "asc").map(
      (booking) => booking.reference,
    ),
    ["ZNG-A", "ZNG-Z"],
  );
  assert.deepEqual(
    rows.map((booking) => booking.reference),
    ["ZNG-Z", "ZNG-A"],
  );
});

test("compact booking sort handles pax and outstanding balance numerically", () => {
  const rows = [
    row({ balanceDue: 400, pax: 12, reference: "ZNG-12" }),
    row({ balanceDue: 1_200, pax: 2, reference: "ZNG-02" }),
  ];

  assert.deepEqual(
    sortCompactBookingRows(rows, "pax", "asc").map(
      (booking) => booking.reference,
    ),
    ["ZNG-02", "ZNG-12"],
  );
  assert.deepEqual(
    sortCompactBookingRows(rows, "balance", "desc").map(
      (booking) => booking.reference,
    ),
    ["ZNG-02", "ZNG-12"],
  );
});

test("compact booking sort covers section, table, payment, and source", () => {
  const rows = [
    row({
      paymentSortValue: "pending-payment",
      reference: "ZNG-B",
      section: "Royal Balcony",
      sourceLabel: "Staff / Manual",
      tableLabel: "Floor Assignment",
    }),
    row({
      paymentSortValue: "fully-paid",
      reference: "ZNG-A",
      section: "Golden Circle",
      sourceLabel: "Data Import",
      tableLabel: "Table 8",
    }),
  ];

  for (const key of ["section", "payment", "source"] as const) {
    assert.deepEqual(
      sortCompactBookingRows(rows, key, "asc").map(
        (booking) => booking.reference,
      ),
      ["ZNG-A", "ZNG-B"],
    );
  }

  assert.deepEqual(
    sortCompactBookingRows(rows, "table", "asc").map(
      (booking) => booking.reference,
    ),
    ["ZNG-B", "ZNG-A"],
  );
});

test("compact booking sort uses references as deterministic tie-breakers", () => {
  const rows = [row({ reference: "ZNG-B" }), row({ reference: "ZNG-A" })];

  assert.deepEqual(
    sortCompactBookingRows(rows, "name", "asc").map(
      (booking) => booking.reference,
    ),
    ["ZNG-A", "ZNG-B"],
  );
});
