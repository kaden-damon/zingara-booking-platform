import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTicketSalesReport,
  getSoldTicketEntitlements,
  getTicketSalesDateRange,
  type TicketSalesBooking,
} from "./ticketSalesReport.ts";

function booking(overrides: Partial<TicketSalesBooking> = {}): TicketSalesBooking {
  return {
    amountPaid: 2_000,
    archivedAt: null,
    balanceOutstanding: 1_000,
    bookingOrigin: "public_checkout",
    bookingReference: "ZNG-BASE",
    bookingSource: "Online",
    bookingStatus: "confirmed",
    companyName: null,
    corporateRequestId: null,
    createdAt: "2026-10-01T22:30:00.000Z",
    customerName: "Guest",
    guestCount: 3,
    id: "booking-base",
    paymentStatus: "deposit_paid",
    showDate: "2026-10-10",
    showId: "show-a",
    showName: "The Royal Countess",
    showTime: "18:00:00",
    totalAmount: 3_000,
    venue: "cape-town",
    zoneEntitlements: null,
    ...overrides,
  };
}

const filters = {
  bookingType: "all" as const,
  from: "2026-09-30",
  paymentStatus: "all" as const,
  performanceId: "",
  to: "2026-10-20",
  venue: "all" as const,
};

test("uses SAST booking creation date and authoritative paid entitlement semantics", () => {
  const report = buildTicketSalesReport({
    bookings: [
      booking(),
      booking({
        bookingOrigin: "corporate",
        bookingReference: "ZNG-CORP",
        corporateRequestId: "request-a",
        guestCount: 10,
        id: "booking-corp",
        zoneEntitlements: [{ pax: 4, zoneId: "golden-circle" }, { pax: 6, zoneId: "royal-booths" }],
      }),
      booking({ bookingReference: "ZNG-UNPAID", id: "booking-unpaid", paymentStatus: "pending_payment" }),
    ],
    buyouts: [],
    filters,
    generatedAt: "2026-10-20T10:00:00Z",
  });
  assert.equal(report.rows[0].saleDate, "2026-10-02");
  assert.equal(report.summary.ticketsSold, 13);
  assert.equal(report.summary.bookings, 3);
  assert.equal(report.rows.find((row) => row.bookingReference === "ZNG-CORP")?.bookingType, "corporate");
  assert.equal(report.rows.find((row) => row.bookingReference === "ZNG-UNPAID")?.ticketEntitlements, 0);
});

test("Buyout tickets use explicit entitlement rather than package guest count", () => {
  const row = booking({ guestCount: 400, id: "buyout-booking", paymentStatus: "fully_paid" });
  assert.equal(getSoldTicketEntitlements(row, { bookingId: row.id, state: "confirmed", ticketEntitlementCount: 37 }), 37);
  assert.equal(getSoldTicketEntitlements(row, { bookingId: row.id, state: "released", ticketEntitlementCount: 37 }), 0);
});

test("complimentary, inactive and uncertain imported records do not inflate sales", () => {
  const report = buildTicketSalesReport({
    bookings: [
      booking({ bookingReference: "COMP", id: "comp", paymentStatus: "comp_vip" }),
      booking({ bookingReference: "CANCEL", bookingStatus: "cancelled", id: "cancel" }),
      booking({ bookingOrigin: "data_import", bookingReference: "IMPORT", id: "import" }),
    ],
    buyouts: [],
    filters,
  });
  assert.equal(report.summary.ticketsSold, 0);
  assert.equal(report.summary.bookings, 0);
  assert.deepEqual(report.excluded, {
    complimentary: 1,
    importedUnreliableSaleDate: 1,
    inactiveLifecycle: 1,
    unpaidTicketEntitlements: 0,
  });
});

test("SAST range includes the full selected end date", () => {
  assert.deepEqual(getTicketSalesDateRange("2026-10-01", "2026-10-01"), {
    start: "2026-09-30T22:00:00.000Z",
    endExclusive: "2026-10-01T22:00:00.000Z",
  });
});
