import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateDailyAnalytics,
  getDailyAnalyticsWindow,
  type DailyAnalyticsBookingCandidate,
  type DailyAnalyticsInput,
  type DailyAnalyticsPaymentEvidence,
  type DailyAnalyticsShow,
} from "./dailyAnalytics.ts";

function booking(
  id: string,
  overrides: Partial<DailyAnalyticsBookingCandidate> = {},
): DailyAnalyticsBookingCandidate {
  return {
    archivedAt: null,
    bookingOrigin: "customer_public",
    bookingReference: `ZNG-${id}`,
    bookingSource: "online",
    createdAt: "2026-09-09T08:00:00+02:00",
    customerCreatedAt: "2026-09-09T08:00:00+02:00",
    customerHasCompleteContact: true,
    customerId: `customer-${id}`,
    customerIsSynthetic: false,
    guestCount: 4,
    id,
    section: "middle-ring",
    showId: "show-1",
    totalAmount: 10_000,
    ...overrides,
  };
}

function payment(
  bookingRow: DailyAnalyticsBookingCandidate,
  overrides: Partial<DailyAnalyticsPaymentEvidence> = {},
): DailyAnalyticsPaymentEvidence {
  return {
    amount: 5_000,
    bookingCreatedAt: bookingRow.createdAt,
    bookingId: bookingRow.id,
    bookingReference: bookingRow.bookingReference,
    createdAt: "2026-09-09T08:05:00+02:00",
    id: `payment-${bookingRow.id}`,
    method: "payfast",
    paymentStatus: "deposit_paid",
    paymentType: "deposit",
    processedAt: "2026-09-09T08:06:00+02:00",
    providerGrossAmount: 5_000,
    transactionFeeAmount: 0,
    ...overrides,
  };
}

function input(
  bookings: DailyAnalyticsBookingCandidate[],
  overrides: Partial<DailyAnalyticsInput> = {},
): DailyAnalyticsInput {
  return {
    audits: [],
    bookings,
    communications: 0,
    excludedOtherActivity: 0,
    lifecycleEvents: [],
    payments: [],
    receivedPayments: [],
    reportDate: "2026-09-09",
    shows: [
      {
        date: "2026-10-17",
        id: "show-1",
        name: "The Royal Countess",
        time: "18:00:00",
        venue: "cape-town",
      },
    ],
    tickets: 0,
    walletRegistrations: 0,
    ...overrides,
  };
}

test("selected Daily Analytics date uses completed SAST boundaries", () => {
  assert.deepEqual(getDailyAnalyticsWindow("2026-09-09"), {
    dayNumber: 9,
    endExclusive: "2026-09-09T22:00:00.000Z",
    startInclusive: "2026-09-08T22:00:00.000Z",
  });
  assert.throws(() => getDailyAnalyticsWindow("2026-08-31"));
});

test("historical payment state excludes a payment processed after cutoff", () => {
  const row = booking("FUTURE");
  const report = calculateDailyAnalytics(
    input([row], {
      payments: [
        payment(row, {
          createdAt: "2026-09-09T20:00:00+02:00",
          paymentStatus: "fully_paid",
          paymentType: "full_payment",
          processedAt: "2026-09-10T07:00:00+02:00",
        }),
      ],
    }),
  );
  assert.equal(report.summary.pending, 1);
  assert.equal(report.payments.successfulPayments, 0);
  assert.equal(report.summary.outstanding, 10_000);
  assert.equal(report.paymentRows[0].paymentStatus, "Pending Payment");
});

test("post-cutoff operational edits restore EOD while corrected obligation remains authoritative", () => {
  const row = booking("MOVED", {
    guestCount: 6,
    section: "golden-circle",
    showId: "show-current",
    totalAmount: 12_000,
  });
  const report = calculateDailyAnalytics(
    input([row], {
      audits: [
        {
          beforeValues: {
            guest_count: 4,
            section: "middle-ring",
            show_id: "show-1",
            total_amount: 10_000,
          },
          bookingId: row.id,
          changedFields: ["guest_count", "section", "show_id", "total_amount"],
          createdAt: "2026-09-10T09:00:00+02:00",
        },
      ],
    }),
  );
  assert.equal(report.bookingRows[0].pax, 4);
  assert.equal(report.bookingRows[0].grossValue, 12_000);
  assert.equal(report.bookingRows[0].seatingZone, "Middle Ring");
  assert.equal(report.bookingRows[0].showId, "show-1");
});

test("archived checkout holds and conclusive QA residue match established exclusions", () => {
  const valid = booking("VALID");
  const archived = booking("ARCHIVED", {
    archivedAt: "2026-09-09T09:00:00+02:00",
  });
  const synthetic = booking("SYNTHETIC", { customerIsSynthetic: true });
  const report = calculateDailyAnalytics(input([valid, archived, synthetic]));
  assert.equal(report.summary.totalBookings, 1);
  assert.equal(report.excluded.checkoutResidues, 1);
  assert.equal(report.excluded.synthetic, 1);
});

test("one Standard, multi-table, or multi-zone booking remains one booking-grain row", () => {
  const corporate = booking("CORPORATE", {
    guestCount: 46,
    section: "private-booths",
  });
  const report = calculateDailyAnalytics(input([corporate]));
  assert.equal(report.summary.totalBookings, 1);
  assert.equal(report.summary.guests, 46);
  assert.equal(report.seatingRows.reduce((sum, row) => sum + row.bookings, 0), 1);
  assert.equal(report.showRows.reduce((sum, row) => sum + row.bookings, 0), 1);
});

function dayNineFixture() {
  const bookings = Array.from({ length: 149 }, (_, index) => {
    const grossValue =
      index < 12
        ? 6_965
        : index === 12
          ? 6_968
          : index < 65
            ? 9_249
            : index === 65
              ? 9_278
              : index < 147
                ? index < 146
                  ? 7_619
                  : 7_667
                : index === 147
                  ? 9_900
                  : 2_720;
    const pax = index < 9 ? 5 : index < 13 ? 4 : index < 57 ? 6 : 5;
    const customerNumber = Math.min(index, 143);
    return booking(`DAY9-${index}`, {
      customerCreatedAt:
        customerNumber < 5
          ? "2026-09-08T12:00:00+02:00"
          : "2026-09-09T07:00:00+02:00",
      customerId: `customer-${customerNumber}`,
      guestCount: pax,
      section:
        index < 66
          ? "golden-circle"
          : index < 106
            ? "middle-ring"
            : index < 131
              ? "private-booths"
              : "royal-balcony",
      showId:
        index < 13 ? "show-strong" : `show-${Math.floor((index - 13) / 9)}`,
      totalAmount: grossValue,
    });
  });
  const payments = bookings.slice(0, 147).map((row, index) =>
    payment(row, {
      amount: index < 146 ? 5_700 : 5_934,
      paymentStatus: index < 83 ? "fully_paid" : "deposit_paid",
      paymentType: index < 83 ? "full_payment" : "deposit",
      providerGrossAmount: index < 146 ? 5_700 : 5_934,
    }),
  );
  const showIds = Array.from(new Set(bookings.map((row) => row.showId)));
  const shows: DailyAnalyticsShow[] = showIds.map((id, index) => ({
    date: id === "show-strong" ? "2026-10-17" : `2026-11-${String((index % 28) + 1).padStart(2, "0")}`,
    id,
    name: "The Royal Countess",
    time: "18:00:00",
    venue: "cape-town",
  }));
  const residues = Array.from({ length: 14 }, (_, index) =>
    booking(`RESIDUE-${index}`, {
      archivedAt: "2026-09-09T20:00:00+02:00",
    }),
  );
  return input([...bookings, ...residues], {
    lifecycleEvents: [
      {
        bookingId: bookings[148].id,
        createdAt: "2026-09-09T12:00:00+02:00",
        reason: "Customer cancelled",
        toStatus: "cancelled",
      },
    ],
    payments,
    receivedPayments: payments,
    shows,
  });
}

test("Day 9 hard regression fixture reproduces established headline values", () => {
  const report = calculateDailyAnalytics(dayNineFixture());
  assert.deepEqual(
    {
      bookings: report.summary.totalBookings,
      cancelled: report.summary.cancelled,
      confirmed: report.summary.confirmed,
      gross: report.summary.grossValue,
      guests: report.summary.guests,
      outstanding: report.summary.outstanding,
      paid: report.payments.successfulApplied,
      pending: report.summary.pending,
    },
    {
      bookings: 149,
      cancelled: 1,
      confirmed: 147,
      gross: 1_210_581,
      guests: 785,
      outstanding: 369_727,
      paid: 838_134,
      pending: 1,
    },
  );
  assert.equal(report.payments.successfulPayments, 147);
  assert.equal(report.payments.fullPayments, 83);
  assert.equal(report.payments.depositPayments, 64);
  assert.equal(report.excluded.checkoutResidues, 14);
  const strongestZone = [...report.seatingRows].sort(
    (left, right) => right.grossValue - left.grossValue,
  )[0];
  assert.deepEqual(
    [strongestZone.zone, strongestZone.bookings, strongestZone.grossValue],
    ["Golden Circle", 66, 580_774],
  );
  const strongestShow = [...report.showRows].sort(
    (left, right) => right.grossValue - left.grossValue,
  )[0];
  assert.deepEqual(
    [
      strongestShow.performanceDate,
      strongestShow.location,
      strongestShow.bookings,
      strongestShow.pax,
      strongestShow.grossValue,
    ],
    ["2026-10-17", "Cape Town", 13, 61, 90_548],
  );
});

test("Daily Analytics is on-demand, protected, locked, and not loaded at Admin boot", async () => {
  const [component, route, admin] = await Promise.all([
    readFile(new URL("../app/admin/ManagementAnalytics.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/analytics/daily/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(component, /Daily Analytics Report/);
  assert.match(component, /ZingaraDatePicker/);
  assert.match(component, /Generate Report/);
  assert.match(component, /Download Excel/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /analytics:read/);
  assert.match(route, /acquireReportGenerationLock/);
  assert.match(route, /releaseReportGenerationLock/);
  assert.doesNotMatch(admin, /api\/admin\/analytics\/daily/);
});
