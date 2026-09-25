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
  assert.equal(result.results[0].severity, "normal");
});

test("unmatched Dineplan reservation remains REVIEW", () => {
  const source = snapshot([{ "Booking Date": "23/09/2026", Covers: "4", "Guest Name": "Unknown Guest", Telephone: "0710000000" }]);
  const result = reconcileDineplanSnapshot(source, [booking()]);
  assert.equal(result.results[0].classification, "review");
  assert.equal(result.results[0].matchConfidence, "unmatched");
  assert.equal(result.results[0].zingara, null);
  assert.equal(result.results[0].capacityImpact, 0);
});

test("catastrophic deterministic match collapse fails the trust gate closed", () => {
  const records = Array.from({ length: 10 }, (_, index) => ({
    "Booking Date": "23/09/2026",
    Covers: "2",
    "Guest Name": `Source Guest ${index}`,
    Telephone: `08212345${String(index).padStart(2, "0")}`,
  }));
  const result = reconcileDineplanSnapshot(snapshot(records), [booking()]);
  assert.equal(result.quality.trusted, false);
  assert.equal(result.quality.status, "review_required");
  assert.match(result.quality.reasons.join(" "), /none matched deterministically/i);
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

test("real 25 September action candidates associate only through unique imported identity evidence", () => {
  const source = snapshot([
    { "Booking Date": "25/09/2026", Covers: "4", "Guest Name": "Chantal Groenewald", Telephone: "0733220285", "Seating Area": "Middle Ring R1320pp", Table: "309" },
    { "Booking Date": "25/09/2026", Covers: "4", "Guest Name": "Lloyd Swartz", Telephone: "0729986081", "Seating Area": "Middle Ring R1320pp", Table: "200" },
    { "Booking Date": "25/09/2026", Covers: "6", "Guest Name": "Natasha De Goede", Telephone: "0824672592", "Seating Area": "Private Raised Booths R1480pp", Table: "24" },
    { "Booking Date": "25/09/2026", Covers: "6", "Guest Name": "Natasha Pillay", Telephone: "0829095005", "Seating Area": "Middle Ring R1320pp", Table: "203" },
    { "Booking Date": "25/09/2026", Covers: "8", "Guest Name": "SOLET STROH SOLET STROH", Telephone: "0824984415", "Seating Area": "Royal Balcony R1320pp", Table: "901" },
    { "Booking Date": "25/09/2026", Covers: "12", "Guest Name": "Sonja Hood", Telephone: "0837071055", "Seating Area": "Private Raised Booths R1480pp", Table: "4, 5" },
    { "Booking Date": "25/09/2026", Covers: "12", "Guest Name": "Sylvia Roux", Telephone: "0729934249", "Seating Area": "Golden Circle R1540pp", Table: "400" },
    { "Booking Date": "25/09/2026", Covers: "7", "Guest Name": "Tyron Sussman", Telephone: "0792679674", "Seating Area": "Middle Ring R1320pp", Table: "201" },
    { "Booking Date": "25/09/2026", Covers: "3", "Guest Name": "Ursula Maritz", Telephone: "0823590409", "Seating Area": "Golden Circle R1540pp", Table: "601" },
  ]);
  const imported = (overrides: Partial<ZingaraReconciliationBooking>) => booking({
    bookingOrigin: "data_import",
    performanceDate: "2026-09-25",
    ...overrides,
  });
  const result = reconcileDineplanSnapshot(source, [
    imported({ bookingReference: "DP-KS17NC", customerEmail: "chantalg80@gmail.com", customerFirstName: "chantalg80@gmail.com", customerName: "chantalg80@gmail.com Groenewald", customerSurname: "Groenewald", id: "chantal", mobile: null, partySize: 4, seatingZone: "Middle Ring", tables: ["207"] }),
    imported({ bookingReference: "DP-ZGX4PC", customerFirstName: "Natasha", customerName: "Natasha Natasha De Goede", customerSurname: "Natasha De Goede", id: "natasha-de-goede", mobile: null, partySize: 6, seatingZone: "Private Booths", tables: ["23"] }),
    imported({ bookingReference: "DP-N487NC", customerFirstName: "Natasha", customerName: "Natasha Pillay", customerSurname: "Pillay", id: "natasha-pillay", mobile: "+27829095005", partySize: 6, seatingZone: "Middle Ring", tables: ["203"] }),
    imported({ bookingReference: "DP-C0GDPC", customerFirstName: "SOLET", customerName: "SOLET STROH S.", customerSurname: "STROH S.", id: "solet", mobile: null, partySize: 8, seatingZone: "Royal Balcony", tables: ["800"] }),
    imported({ bookingReference: "DP-QQWCPC", customerEmail: "sonja.hood@kapsch.net", customerFirstName: "sonja.hood@kapsch.net", customerName: "sonja.hood@kapsch.net Hood", customerSurname: "Hood", id: "sonja", mobile: null, partySize: 12, seatingZone: "Private Booths", tables: ["10", "11"] }),
    imported({ bookingReference: "DP-V038NC", customerEmail: "sylvia@ecwamix.co.za", customerFirstName: "sylvia@ecwamix.co.za", customerName: "sylvia@ecwamix.co.za Roux", customerSurname: "Roux", id: "sylvia", mobile: null, partySize: 12, seatingZone: "Golden Circle", tables: ["400"] }),
    imported({ bookingReference: "DP-RX63NC", customerEmail: "ursula.maritz@lenmed.co.za", customerFirstName: "ursula.maritz@lenmed.co.za", customerName: "ursula.maritz@lenmed.co.za Maritz", customerSurname: "Maritz", id: "ursula", mobile: null, partySize: 3, seatingZone: "Golden Circle", tables: ["601"] }),
  ]);
  const byGuest = new Map(result.results.filter((row) => row.dineplan).map((row) => [row.dineplan!.guestName, row]));
  for (const guest of ["Chantal Groenewald", "Natasha De Goede", "Natasha Pillay", "SOLET STROH SOLET STROH", "Sonja Hood", "Sylvia Roux", "Ursula Maritz"]) {
    assert.ok(byGuest.get(guest)?.zingara, `${guest} should have an authoritative association`);
    assert.match(byGuest.get(guest)?.matchReason ?? "", /imported identity|mobile and performance/i);
  }
  for (const guest of ["Lloyd Swartz", "Tyron Sussman"]) {
    assert.equal(byGuest.get(guest)?.zingara, null);
    assert.equal(byGuest.get(guest)?.severity, "critical");
  }
  assert.equal(result.quality.deterministicMatches, 7);
});

test("legacy identity evidence must be unique before it can associate a source row", () => {
  const source = snapshot([{ "Booking Date": "25/09/2026", Covers: "4", "Guest Name": "Chantal Groenewald", "Seating Area": "Middle Ring R1320pp" }]);
  const duplicate = {
    bookingOrigin: "data_import",
    customerEmail: "chantalg80@gmail.com",
    customerFirstName: "chantalg80@gmail.com",
    customerName: "chantalg80@gmail.com Groenewald",
    customerSurname: "Groenewald",
    mobile: null,
    partySize: 4,
    performanceDate: "2026-09-25",
    seatingZone: "Middle Ring",
  } satisfies Partial<ZingaraReconciliationBooking>;
  const result = reconcileDineplanSnapshot(source, [
    booking({ ...duplicate, id: "one", bookingReference: "DP-ONE" }),
    booking({ ...duplicate, id: "two", bookingReference: "DP-TWO" }),
  ]);
  assert.equal(result.results[0].matchConfidence, "unmatched");
  assert.equal(result.results[0].zingara, null);
});
