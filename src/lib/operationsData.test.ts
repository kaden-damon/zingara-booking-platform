import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bookingBelongsToOperationalShow,
  getArrivedGuestCount,
  getDefaultOperationalShow,
  getOperationalDashboardMetrics,
  getOperationalShowBookings,
  getSouthAfricaOperationalDate,
} from "./operationsData.ts";
import type { DemoBooking, DemoShow } from "./zingaraDemo.ts";

function show(overrides: Partial<DemoShow> = {}): DemoShow {
  return {
    date: "2026-09-02",
    id: "show-2026-09-02-1800",
    label: "Johannesburg 18:00",
    location: "johannesburg",
    operationalStatus: "active",
    supabaseId: "show-uuid",
    time: "18:00",
    venueName: "johannesburg",
    ...overrides,
  };
}

function booking(overrides: Partial<DemoBooking> = {}): DemoBooking {
  const value = {
    amountPaid: 1100,
    balanceDue: 1100,
    bookingDate: "2026-07-01",
    createdAt: "2026-07-01T00:00:00.000Z",
    customer: { email: "guest@example.test", name: "Guest", phone: "" },
    partySize: 2,
    paymentStatus: "deposit-paid",
    pricePerPerson: 1100,
    reference: "DP-ONE",
    showId: "show-2026-09-02-1800",
    source: "admin",
    status: "confirmed",
    tableId: "table-1",
    tableNumber: "101",
    totalPrice: 2200,
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    ...overrides,
  };

  return {
    ...value,
    communicationHistory: value.communicationHistory ?? [],
  } as DemoBooking;
}

test("show matching accepts stable and database identities", () => {
  assert.equal(bookingBelongsToOperationalShow(booking(), show()), true);
  assert.equal(
    bookingBelongsToOperationalShow(booking({ showId: "show-uuid" }), show()),
    true,
  );
  assert.equal(
    bookingBelongsToOperationalShow(booking({ showId: "another-show" }), show()),
    false,
  );
});

test("operational cohort includes imported, comp, Corporate, pending and unassigned bookings", () => {
  const rows = [
    booking({ reference: "DP-IMPORT", tableId: "" }),
    booking({ paymentStatus: "comp-vip", reference: "DP-COMP", totalPrice: 0 }),
    booking({ paymentStatus: "pending-payment", reference: "DP-PENDING" }),
    booking({ reference: "DP-CORP", source: "corporate-direct" }),
    booking({ reference: "DP-CANCELLED", status: "cancelled" }),
    booking({ archivedAt: "2026-09-01T00:00:00Z", reference: "DP-ARCHIVED" }),
    booking({ reference: "DP-OTHER", showId: "other-show" }),
  ];

  assert.deepEqual(
    getOperationalShowBookings(rows, show()).map((row) => row.reference),
    ["DP-IMPORT", "DP-COMP", "DP-PENDING", "DP-CORP"],
  );
});

test("dashboard metrics preserve show-specific financial dimensions", () => {
  const metrics = getOperationalDashboardMetrics([
    booking(),
    booking({
      amountPaid: 0,
      balanceDue: 0,
      partySize: 4,
      paymentStatus: "comp-vip",
      reference: "DP-COMP",
      source: "corporate-direct",
      totalPrice: 0,
    }),
  ]);

  assert.deepEqual(metrics, {
    arrivedGuests: 0,
    bookingValue: 2200,
    bookings: 2,
    complimentaryBookings: 1,
    corporateBookings: 1,
    depositsReceived: 1100,
    guests: 6,
    outstanding: 1100,
    paid: 1100,
  });
});

test("individual ticket arrivals contribute without marking the whole booking arrived", () => {
  const partial = booking({
    guestTickets: [
      { fullName: "One", id: "one", index: 1, status: "checked-in", ticketCode: "ONE", total: 2 },
      { fullName: "Two", id: "two", index: 2, status: "valid", ticketCode: "TWO", total: 2 },
    ],
  });

  assert.equal(getArrivedGuestCount(partial), 1);
  assert.equal(getArrivedGuestCount(booking({ status: "checked-in" })), 2);
});

test("default show selects today, otherwise the next active performance", () => {
  const tomorrow = show({ date: "2026-09-03", id: "tomorrow" });
  const today = show({ id: "today" });
  const inactiveToday = show({ id: "inactive", operationalStatus: "inactive" });

  assert.equal(getDefaultOperationalShow([tomorrow, today], "2026-09-02")?.id, "today");
  assert.equal(
    getDefaultOperationalShow([tomorrow, inactiveToday], "2026-09-02")?.id,
    "tomorrow",
  );
});

test("operational date follows Africa/Johannesburg across the UTC boundary", () => {
  assert.equal(
    getSouthAfricaOperationalDate(new Date("2026-09-01T22:30:00.000Z")),
    "2026-09-02",
  );
});

test("Operations Dashboard does not use booking creation date as show date", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const dashboard = page.slice(
    page.indexOf("const operationsDashboardKpis"),
    page.indexOf("const permittedManifestLocations"),
  );

  assert.match(dashboard, /selectedDashboardMetrics/);
  assert.doesNotMatch(dashboard, /bookingDate|todaysOperationalBookings/);
});

test("ticket validation route enforces the selected performance server-side", async () => {
  const route = await readFile(
    new URL("../app/api/admin/tickets/validate/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /showReference/);
  assert.match(route, /does not belong to the selected performance/);
  assert.match(route, /bookingRow\.show_id/);
});

test("manual check-in uses the active Check-In performance", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const checkIn = page.slice(
    page.indexOf("function checkInGuest"),
    page.indexOf("function findTicketRecord"),
  );

  assert.match(checkIn, /bookingBelongsToShow\(booking, effectiveCheckInShow\)/);
  assert.match(checkIn, /showReference: effectiveCheckInShowId/);
});
