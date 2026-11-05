import { isManagementForecastActiveBooking } from "./managementAnalytics.ts";

export type ShowCalendarFinancialBooking = {
  amountPaid: number;
  archivedAt: string | null;
  balanceOutstanding: number;
  bookingStatus: string;
  id: string;
  showId: string;
};

export type ShowCalendarFinancialPayment = {
  amount: number;
  bookingId: string;
  paymentStatus: string;
  paymentType: string;
};

export type ShowCalendarFinancialRefund = {
  bookingId: string;
  refundAmount: number;
  refundStatus: string;
};

export type ShowCalendarFinancialSummary = {
  credit: null;
  depositCount: number;
  depositTotal: number;
  paid: number;
  refunded: number;
  showId: string;
  unpaid: number;
};

const money = (value: number) =>
  Number.isFinite(value) ? Math.max(value, 0) : 0;

export function buildShowCalendarFinancialSummaries(
  showIds: string[],
  bookings: ShowCalendarFinancialBooking[],
  payments: ShowCalendarFinancialPayment[],
  refunds: ShowCalendarFinancialRefund[],
): ShowCalendarFinancialSummary[] {
  const summaries = new Map<string, ShowCalendarFinancialSummary>();
  const bookingsById = new Map(
    bookings.map((booking) => [booking.id, booking]),
  );

  for (const showId of new Set(showIds)) {
    summaries.set(showId, {
      credit: null,
      depositCount: 0,
      depositTotal: 0,
      paid: 0,
      refunded: 0,
      showId,
      unpaid: 0,
    });
  }

  for (const booking of bookings) {
    if (!isManagementForecastActiveBooking(booking)) continue;

    const summary = summaries.get(booking.showId);
    if (!summary) continue;

    summary.paid += money(booking.amountPaid);
    summary.unpaid += money(booking.balanceOutstanding);
  }

  for (const payment of payments) {
    const booking = bookingsById.get(payment.bookingId);
    if (
      !booking ||
      !isManagementForecastActiveBooking(booking) ||
      payment.paymentType !== "deposit" ||
      payment.paymentStatus !== "deposit_paid"
    ) {
      continue;
    }

    const summary = summaries.get(booking.showId);
    if (!summary) continue;

    summary.depositCount += 1;
    summary.depositTotal += money(payment.amount);
  }

  for (const refund of refunds) {
    if (refund.refundStatus !== "accepted") continue;

    const booking = bookingsById.get(refund.bookingId);
    const summary = booking ? summaries.get(booking.showId) : undefined;
    if (!summary) continue;

    summary.refunded += money(refund.refundAmount);
  }

  return [...summaries.values()];
}
