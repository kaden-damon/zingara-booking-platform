import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileDineplanSnapshot,
  snapshotFromRecords,
  type ZingaraReconciliationBooking,
} from "./dineplanReconciliation.ts";

function booking(overrides: Partial<ZingaraReconciliationBooking> = {}): ZingaraReconciliationBooking {
  return {
    amountPaid: 1100,
    archivedAt: null,
    authoritativeChanges: [],
    bookingOrigin: "data_import",
    bookingKind: "standard",
    bookingReference: "DP-DIONE",
    bookingStatus: "confirmed",
    company: null,
    customerName: "Dione Pieterse",
    id: "booking-1",
    importedAt: "2026-08-29T10:00:00+02:00",
    mobile: "0821234567",
    outstanding: 0,
    partySize: 2,
    paymentStatus: "fully_paid",
    performanceDate: "2026-09-23",
    performanceTime: "17:00",
    seatingZone: "Private Booths",
    sourceReference: "DIONE",
    tables: ["21"],
    totalAmount: 2880,
    updatedAt: "2026-08-29T10:00:00+02:00",
    ...overrides,
  };
}

function snapshot(records: Record<string, string>[]) {
  return snapshotFromRecords({ bytes: Buffer.from(JSON.stringify(records)), records });
}

test("later Zingara pax and payment evidence is ZINGARA NEWER", () => {
  const source = snapshot([{ "Booking Reference": "DIONE", "Booking Date": "23/09/2026", Covers: "2", "Guest Name": "Dione Pieterse", Payment: "Deposit Paid", "Seating Area": "Private Raised Booths" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    partySize: 3,
    paymentStatus: "fully_paid",
    authoritativeChanges: [
      { at: "2026-09-23T13:46:00+02:00", fields: ["pax"], reason: "Authorised 2 to 3 guest amendment" },
      { at: "2026-09-23T14:10:00+02:00", fields: ["payment"], reason: "Successful PayFast balance payment" },
    ],
  })]);
  assert.equal(result.results[0].classification, "zingara_newer");
  assert.equal(result.results[0].severity, "critical");
});

test("later Zingara performance move is ZINGARA NEWER", () => {
  const source = snapshot([{ "Booking Reference": "ANTHEA", "Booking Date": "23/09/2026", Covers: "6", "Guest Name": "Anthea Myatt" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    bookingReference: "DP-ANTHEA",
    sourceReference: "ANTHEA",
    customerName: "Anthea Myatt",
    performanceDate: "2026-10-03",
    authoritativeChanges: [{ at: "2026-09-23T09:12:00+02:00", fields: ["performance"], reason: "Authorised show transfer" }],
  })]);
  assert.equal(result.results[0].classification, "zingara_newer");
});

test("imported source reference matches despite different company presentation", () => {
  const source = snapshot([{ "Booking Reference": "DIOPOINT", "Booking Date": "03/10/2026", Covers: "35", "Guest Name": "Diopoint", Company: "Diopoint" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    bookingReference: "DP-DIOPOINT",
    company: "Diopoint (Pty) Ltd",
    customerName: "Gabriela Teodoro",
    partySize: 35,
    performanceDate: "2026-10-03",
    sourceReference: "DIOPOINT",
  })]);
  assert.equal(result.results[0].classification, "matched");
  assert.equal(result.results[0].matchConfidence, "exact");
  assert.match(result.results[0].matchReason, /legacy\/source reference/i);
});

test("mobile and performance date provide a deterministic fallback match", () => {
  const source = snapshot([{ "Booking Date": "23/09/2026", Covers: "2", "Guest Name": "D. Pieterse", Telephone: "+27 82 123 4567" }]);
  const result = reconcileDineplanSnapshot(source, [booking()]);
  assert.equal(result.results[0].classification, "matched");
  assert.equal(result.results[0].matchConfidence, "high");
  assert.match(result.results[0].matchReason, /mobile and performance date/i);
});

test("later operational table assignment is ZINGARA NEWER without critical severity", () => {
  const source = snapshot([{ "Booking Reference": "DIONE", "Booking Date": "23/09/2026", Covers: "2", "Guest Name": "Dione Pieterse", Table: "20" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    authoritativeChanges: [{ at: "2026-09-23T15:00:00+02:00", fields: ["table"], reason: "Later Floor assignment" }],
    tables: ["21"],
  })]);
  assert.equal(result.results[0].classification, "zingara_newer");
  assert.equal(result.results[0].severity, "normal");
});

test("later Dineplan cancellation is critical but never mutates Zingara", () => {
  const source = snapshot([{ "Booking Reference": "DIOPOINT", "Booking Date": "03/12/2026", Covers: "35", "Guest Name": "Gabriela Teodoro", Status: "Cancelled", "Last Modified": "2026-09-24T09:00:00+02:00" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    bookingReference: "DP-DIOPOINT",
    sourceReference: "DIOPOINT",
    customerName: "Gabriela Teodoro",
    partySize: 35,
    performanceDate: "2026-12-03",
  })]);
  assert.equal(result.results[0].classification, "dineplan_newer");
  assert.equal(result.results[0].severity, "critical");
  assert.equal(result.results[0].capacityImpact, 35);
});

test("name-only match remains REVIEW", () => {
  const source = snapshot([{ "Booking Date": "23/09/2026", Covers: "2", "Guest Name": "Dione Pieterse" }]);
  const result = reconcileDineplanSnapshot(source, [booking({ mobile: null })]);
  assert.equal(result.results[0].classification, "review");
  assert.equal(result.results[0].matchConfidence, "possible");
});

test("unmatched Dineplan reservation remains REVIEW", () => {
  const source = snapshot([{ "Booking Date": "23/09/2026", Covers: "4", "Guest Name": "Unknown Guest", Telephone: "0710000000" }]);
  const result = reconcileDineplanSnapshot(source, [booking()]);
  assert.equal(result.results[0].classification, "review");
  assert.equal(result.results[0].matchConfidence, "unmatched");
  assert.equal(result.results[0].zingara, null);
});

test("Dineplan paid wording cannot mark or classify Zingara as paid", () => {
  const source = snapshot([{ "Booking Reference": "SHANNON", "Booking Date": "23/09/2026", Covers: "9", "Guest Name": "Shannon Hennessy", Payment: "Paid in full" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    bookingReference: "DP-SHANNON",
    sourceReference: "SHANNON",
    customerName: "Shannon Hennessy",
    partySize: 9,
    paymentStatus: "deposit_paid",
    outstanding: 8910,
  })]);
  assert.equal(result.results[0].classification, "review");
  assert.match(result.results[0].reason, /comparison evidence only/i);
});

test("matching deposit-level wording is not treated as full payment", () => {
  const source = snapshot([{ "Booking Reference": "SHANNON", "Booking Date": "23/09/2026", Covers: "9", "Guest Name": "Shannon Hennessy", Payment: "Deposit Paid" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    bookingReference: "DP-SHANNON",
    sourceReference: "SHANNON",
    customerName: "Shannon Hennessy",
    partySize: 9,
    paymentStatus: "deposit_paid",
    outstanding: 8910,
  })]);
  assert.equal(result.results[0].classification, "matched");
});

test("missing Dineplan row does not cancel a Zingara legacy booking", () => {
  const result = reconcileDineplanSnapshot(snapshot([]), [booking()]);
  assert.equal(result.results[0].classification, "review");
  assert.match(result.results[0].reason, /not treated as cancellation/i);
});

test("show-level bridge explains Dione's additional guest", () => {
  const source = snapshot([{ "Booking Reference": "DIONE", "Booking Date": "23/09/2026", Covers: "2", "Guest Name": "Dione Pieterse" }]);
  const result = reconcileDineplanSnapshot(source, [booking({
    partySize: 3,
    authoritativeChanges: [{ at: "2026-09-23T13:46:00+02:00", fields: ["pax"], reason: "Authorised amendment" }],
  })]);
  assert.equal(result.bridge.difference, 1);
  assert.equal(result.bridge.explainedByRows[0].delta, 1);
});
