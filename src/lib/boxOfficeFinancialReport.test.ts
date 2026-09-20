import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildBoxOfficeFinancialReport,
  getLastWeekend,
  getSastDateRange,
  type BoxOfficeBookingRow,
} from "./boxOfficeFinancialReport.ts";

const periodStart = "2026-09-05T08:00:00+02:00";

function booking(
  index: number,
  overrides: Partial<BoxOfficeBookingRow> = {},
): BoxOfficeBookingRow {
  return {
    addonsTotal: 0,
    amountPaid: 0,
    archivedAt: null,
    balanceOutstanding: 0,
    bookingOrigin: "customer_public",
    bookingReference: `ZNG-FIXTURE-${index}`,
    bookingSource: "online",
    bookingStatus: "confirmed",
    paymentStatus: "pending_payment",
    corporateRequestId: null,
    createdAt: periodStart,
    customerId: `customer-${index}`,
    customerName: `Guest ${index}`,
    discountAmount: 0,
    guestCount: 0,
    id: `booking-${index}`,
    location: "johannesburg",
    serviceFee: 0,
    showId: "show-jhb",
    subtotalAmount: 0,
    totalAmount: 0,
    ...overrides,
  };
}

function weekendFixture(): Parameters<typeof buildBoxOfficeFinancialReport>[0] {
  const bookings = Array.from({ length: 47 }, (_, index) => booking(index + 1));
  bookings[0] = booking(1, {
    amountPaid: 169_380,
    balanceOutstanding: 168_033,
    guestCount: 218,
    subtotalAmount: 337_413,
    totalAmount: 337_413,
  });
  bookings.push(
    booking(48, { bookingReference: "ZNG-XKRPMC", bookingStatus: "cancelled", guestCount: 4, totalAmount: 6_160 }),
    booking(49, { bookingReference: "ZNG-LW7E8B", bookingStatus: "cancelled", guestCount: 4, totalAmount: 6_160 }),
  );
  const legacy = booking(50, {
    amountPaid: 87_300,
    bookingOrigin: "data_import",
    bookingReference: "DP-WYXCPC",
    bookingSource: "corporate-direct",
    corporateRequestId: "legacy-corporate",
    createdAt: "2026-05-28T11:15:51Z",
    guestCount: 40,
    id: "booking-dp",
    totalAmount: 87_300,
  });
  return {
    audits: [{
      afterValues: { amount_paid: 87_300 },
      beforeValues: { amount_paid: 0 },
      createdAt: "2026-09-05T10:52:01Z",
      entityReference: "DP-WYXCPC",
      id: "audit-dp",
      reason: "Paid (R22,000.00) on 25/06/2026\npaid (R65,300.00) on 05/09/2026",
    }],
    bookings: [...bookings, legacy],
    filters: { bookingType: "all" as const, from: "2026-09-05", location: "all" as const, to: "2026-09-06" },
    payments: [
      {
        amount: 179_100, bookingId: "booking-1", createdAt: periodStart, id: "payfast",
        method: "payfast", paymentStatus: "fully_paid", paymentType: "full_payment",
        processedAt: periodStart, providerGrossAmount: 179_540, providerTransactionId: "provider-1", transactionFeeAmount: 440,
      },
      {
        amount: 87_300, bookingId: "booking-dp", createdAt: "2026-08-28T00:01:04Z", id: "manual-dp",
        method: "platform", paymentStatus: "fully_paid", paymentType: "full_payment",
        processedAt: "2026-09-05T10:52:14Z", providerGrossAmount: 0, providerTransactionId: null, transactionFeeAmount: 0,
      },
      {
        amount: 30_600, bookingId: "booking-2", createdAt: periodStart, id: "pending",
        method: "platform", paymentStatus: "pending_payment", paymentType: "full_payment",
        processedAt: periodStart, providerGrossAmount: 0, providerTransactionId: null, transactionFeeAmount: 0,
      },
    ],
    refunds: [],
  };
}

test("SAST boundaries cover the complete selected dates", () => {
  assert.deepEqual(getSastDateRange("2026-09-05", "2026-09-06"), {
    start: "2026-09-04T22:00:00.000Z",
    endExclusive: "2026-09-06T22:00:00.000Z",
  });
  assert.throws(() => getSastDateRange("2026-09-06", "2026-09-05"), /valid reporting date range/);
});

test("5–6 September regression reproduces the verified accounting baseline", () => {
  const report = buildBoxOfficeFinancialReport(weekendFixture());
  assert.deepEqual(report.sales, {
    amountPaid: 169_380,
    bookingValue: 337_413,
    bookings: 47,
    guests: 218,
    outstanding: 168_033,
  });
  assert.deepEqual(report.cash, {
    bookingAppliedReceipts: 244_400,
    bookingFees: 440,
    grossCashReceived: 244_840,
    netReceipts: 244_840,
    refunds: 0,
    transactionFees: 440,
  });
  assert.equal(report.revenue.bookingFees, 10);
  assert.equal(report.locations.johannesburg.cashReceived, 244_840);
  assert.equal(report.locations["cape-town"].cashReceived, 0);
  assert.equal(report.paymentMethods.find((row) => row.label === "PayFast / Online")?.amount, 179_540);
  assert.equal(report.paymentMethods.find((row) => row.label === "Manual / Method Not Recorded")?.amount, 65_300);
});

test("DP-WYXCPC contributes only the dated R65,300 increment", () => {
  const report = buildBoxOfficeFinancialReport(weekendFixture());
  const receipt = report.receipts.find((row) => row.bookingReference === "DP-WYXCPC");
  assert.equal(receipt?.amount, 65_300);
  assert.notEqual(receipt?.amount, 87_300);
  assert.equal(receipt?.requiresReview, true);
});

test("manual cumulative payment rows use the immutable audited increment", () => {
  const fixture = weekendFixture();
  fixture.audits[0].reason = "Payment received by manual reconciliation.";
  fixture.audits[0].beforeValues = { amount_paid: 22_000 };
  fixture.audits[0].afterValues = { amount_paid: 87_300 };
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(
    report.receipts.find((row) => row.bookingReference === "DP-WYXCPC")?.amount,
    65_300,
  );
});

test("audit-only manual receipts are included without creating payment rows", () => {
  const fixture = weekendFixture();
  fixture.payments = fixture.payments.filter((payment) => payment.id !== "manual-dp");
  fixture.audits[0].reason = "EFT payment received.";
  fixture.audits[0].beforeValues = { amount_paid: 22_000 };
  fixture.audits[0].afterValues = { amount_paid: 87_300, payment_status: "fully_paid" };
  const report = buildBoxOfficeFinancialReport(fixture);
  const receipt = report.receipts.find((row) => row.bookingReference === "DP-WYXCPC");
  assert.equal(receipt?.amount, 65_300);
  assert.equal(receipt?.method, "EFT / Manual");
});

test("payment rows and matching audit evidence are not double-counted", () => {
  const report = buildBoxOfficeFinancialReport(weekendFixture());
  assert.equal(
    report.receipts.filter((row) => row.bookingReference === "DP-WYXCPC").length,
    1,
  );
  assert.equal(report.cash.bookingAppliedReceipts, 244_400);
});

test("provider receipts are not duplicated by financial reconciliation audit evidence", () => {
  const fixture = weekendFixture();
  fixture.bookings[0].amountPaid = 179_100;
  fixture.bookings[0].totalAmount = 179_100;
  fixture.audits = [{
    afterValues: { amount_paid: 179_100, payment_status: "fully_paid" },
    beforeValues: { amount_paid: 0 },
    createdAt: periodStart,
    entityReference: "ZNG-FIXTURE-1",
    id: "provider-allocation-audit",
    reason: "Payment aggregate reconciled after provider processing.",
  }];
  fixture.payments = [fixture.payments[0]];
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.receipts.length, 1);
  assert.equal(report.cash.bookingAppliedReceipts, 179_100);
  assert.equal(report.cash.transactionFees, 440);
  assert.equal(report.cash.grossCashReceived, 179_540);
});

test("a correction audit reduces an audit-only receipt instead of creating extra cash", () => {
  const fixture = weekendFixture();
  const manualBooking = fixture.bookings.find((row) => row.id === "booking-dp");
  assert.ok(manualBooking);
  manualBooking.amountPaid = 41_310;
  manualBooking.totalAmount = 41_310;
  fixture.payments = fixture.payments.filter((payment) => payment.id !== "manual-dp");
  fixture.audits = [
    { afterValues: { amount_paid: 45_900 }, beforeValues: { amount_paid: 0 }, createdAt: "2026-09-05T08:00:00Z", entityReference: "DP-WYXCPC", id: "audit-set", reason: "Invoice paid in full." },
    { afterValues: { amount_paid: 41_310 }, beforeValues: { amount_paid: 45_900 }, createdAt: "2026-09-05T08:05:00Z", entityReference: "DP-WYXCPC", id: "audit-correct", reason: "Corrected paid total." },
  ];
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.receipts.find((row) => row.bookingReference === "DP-WYXCPC")?.amount, 41_310);
});

test("archived and cancelled bookings retain historical successful cash", () => {
  const fixture = weekendFixture();
  fixture.bookings[0].archivedAt = "2026-09-07T00:00:00Z";
  fixture.bookings[0].bookingStatus = "cancelled";
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.sales.bookings, 46);
  assert.equal(report.receipts.some((row) => row.id === "payfast"), true);
});

test("outstanding is obligation less applied paid rather than a stale persisted balance", () => {
  const fixture = weekendFixture();
  fixture.bookings[0].totalAmount = 100_000;
  fixture.bookings[0].amountPaid = 20_000;
  fixture.bookings[0].balanceOutstanding = 0;
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.sales.outstanding, 80_000);
  assert.equal(report.bookings[0].balanceOutstanding, 0);
});

test("a UTC timestamp after 22:00 belongs to the next SAST reporting day", () => {
  const fixture = weekendFixture();
  fixture.filters = { ...fixture.filters, from: "2026-09-02", to: "2026-09-02" };
  fixture.payments[0].processedAt = "2026-09-01T22:30:00Z";
  fixture.payments[0].createdAt = "2026-09-01T22:30:00Z";
  fixture.payments = [fixture.payments[0]];
  fixture.audits = [];
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.receipts.length, 1);
  fixture.filters = { ...fixture.filters, from: "2026-09-01", to: "2026-09-01" };
  assert.equal(buildBoxOfficeFinancialReport(fixture).receipts.length, 0);
});

test("1-16 September completed-period reconciliation preserves each accounting concept", () => {
  const provider = booking(101, {
    amountPaid: 5_739_209.25,
    createdAt: "2026-09-01T08:00:00+02:00",
    id: "provider-period",
    subtotalAmount: 5_739_209.25,
    totalAmount: 5_739_209.25,
  });
  const nonProvider = booking(102, {
    amountPaid: 5_170_274,
    createdAt: "2026-09-01T08:00:00+02:00",
    id: "manual-period",
    subtotalAmount: 5_170_274,
    totalAmount: 5_170_274,
  });
  const report = buildBoxOfficeFinancialReport({
    audits: [{
      afterValues: { amount_paid: 4_400, payment_status: "fully_paid" },
      beforeValues: { amount_paid: 0 },
      createdAt: "2026-09-06T09:00:00+02:00",
      entityReference: nonProvider.bookingReference,
      id: "claudia-audit-only",
      reason: "EFT payment received.",
    }],
    bookings: [provider, nonProvider],
    filters: { bookingType: "all", from: "2026-09-01", location: "all", to: "2026-09-16" },
    payments: [
      {
        amount: 5_739_209.25,
        bookingId: provider.id,
        createdAt: "2026-09-10T08:00:00+02:00",
        id: "provider-period-payment",
        method: "payfast",
        paymentStatus: "fully_paid",
        paymentType: "full_payment",
        processedAt: "2026-09-10T08:01:00+02:00",
        providerGrossAmount: 5_748_799.25,
        providerTransactionId: "provider-period-reference",
        transactionFeeAmount: 9_590,
      },
      {
        amount: 5_165_874,
        bookingId: nonProvider.id,
        createdAt: "2026-09-05T08:00:00+02:00",
        id: "manual-period-payment",
        method: "eft",
        paymentStatus: "fully_paid",
        paymentType: "full_payment",
        processedAt: "2026-09-05T08:01:00+02:00",
        providerGrossAmount: 0,
        providerTransactionId: null,
        transactionFeeAmount: 0,
      },
    ],
    refunds: [],
  });
  assert.equal(report.cash.bookingAppliedReceipts, 10_909_483.25);
  assert.equal(report.cash.transactionFees, 9_590);
  assert.equal(report.cash.grossCashReceived, 10_919_073.25);
  assert.equal(
    report.paymentMethods.find((row) => row.label === "PayFast / Online")?.amount,
    5_748_799.25,
  );
  assert.equal(
    report.paymentMethods.find((row) => row.label === "EFT / Manual")?.amount,
    5_170_274,
  );
});

test("location and booking-type filters apply to sales and cash", () => {
  const fixture = weekendFixture();
  fixture.bookings[0].bookingOrigin = "corporate";
  fixture.bookings[0].corporateRequestId = "corp";
  const corporate = buildBoxOfficeFinancialReport({ ...fixture, filters: { ...fixture.filters, bookingType: "corporate" } });
  assert.equal(corporate.sales.bookings, 1);
  const capeTown = buildBoxOfficeFinancialReport({ ...fixture, filters: { ...fixture.filters, location: "cape-town" } });
  assert.equal(capeTown.sales.bookings, 0);
  assert.equal(capeTown.cash.grossCashReceived, 0);
});

test("refunds reduce net receipts without changing gross cash", () => {
  const fixture = weekendFixture();
  fixture.refunds.push({ bookingId: "booking-1", bookingReference: "ZNG-FIXTURE-1", completedAt: periodStart, createdAt: periodStart, id: "refund", refundAmount: 1_000, refundStatus: "accepted" });
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.cash.grossCashReceived, 244_840);
  assert.equal(report.cash.refunds, 1_000);
  assert.equal(report.cash.netReceipts, 243_840);
});

test("provider decomposition mismatch raises a reconciliation warning", () => {
  const fixture = weekendFixture();
  fixture.payments[0].providerGrossAmount += 1;
  const report = buildBoxOfficeFinancialReport(fixture);
  assert.equal(report.reconciliation.warning, true);
  assert.equal(report.reconciliation.difference, 1);
});

test("pending, failed, cancelled holds and unpaid links cannot become receipts", () => {
  const report = buildBoxOfficeFinancialReport(weekendFixture());
  assert.equal(report.receipts.some((row) => row.id === "pending"), false);
  assert.equal(report.bookings.some((row) => row.bookingReference === "ZNG-XKRPMC"), false);
  assert.equal(report.bookings.some((row) => row.bookingReference === "ZNG-LW7E8B"), false);
});

test("last weekend is the immediately preceding Saturday and Sunday", () => {
  assert.deepEqual(getLastWeekend(new Date("2026-09-08T10:00:00+02:00")), {
    from: "2026-09-05",
    to: "2026-09-06",
  });
});

test("route is authenticated, scoped, bounded and read-only", async () => {
  const [route, panel] = await Promise.all([
    readFile(new URL("../app/api/admin/financial-reports/box-office/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/BoxOfficeFinancialReport.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /analytics:read/);
  assert.match(route, /venue_scope/);
  assert.match(route, /gte\("created_at", range\.start\)\.lt\("created_at", range\.endExclusive\)/);
  assert.match(route, /eq\("action", "booking\.financial-reconciliation"\)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|PayFast|sendCommunication/);
  assert.match(panel, /sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(panel, /overflow-x-auto/);
  assert.match(panel, /<details/);
  assert.doesNotMatch(panel, /Export|Download|CSV|XLSX/);
});
