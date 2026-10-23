export type RefundReadinessBooking = {
  amount_paid: number | null;
  booking_reference: string;
  booking_status: string;
  id: string;
  payment_status: string;
};

export type RefundReadinessPayment = {
  amount: number | null;
  booking_id: string;
};

export type RefundReadinessHistory = {
  booking_id: string;
  refund_status: string;
};

export function buildRefundEligibilityRows(input: {
  bookings: RefundReadinessBooking[];
  payments: RefundReadinessPayment[];
  readinessReason: string;
  ready: boolean;
  refunds: RefundReadinessHistory[];
}) {
  const paymentsByBookingId = new Map<string, RefundReadinessPayment[]>();

  for (const payment of input.payments) {
    const bookingPayments = paymentsByBookingId.get(payment.booking_id) ?? [];
    bookingPayments.push(payment);
    paymentsByBookingId.set(payment.booking_id, bookingPayments);
  }
  const refundByBookingId = new Map(
    input.refunds.map((refund) => [refund.booking_id, refund.refund_status]),
  );

  return input.bookings.map((booking) => {
    const bookingPayments = paymentsByBookingId.get(booking.id) ?? [];
    const providerPaymentTotal = bookingPayments.reduce(
      (total, payment) => total + Number(payment.amount ?? 0),
      0,
    );
    const fullRefundSupported =
      bookingPayments.length === 1 &&
      Math.abs(providerPaymentTotal - Number(booking.amount_paid ?? 0)) <= 0.01;
    const refundStatus = refundByBookingId.get(booking.id);
    const alreadyRefunded =
      booking.booking_status === "refunded" ||
      booking.payment_status === "refunded";
    const complimentary = booking.payment_status === "comp_vip";
    const eligible =
      input.ready &&
      !alreadyRefunded &&
      !complimentary &&
      !refundStatus &&
      providerPaymentTotal > 0 &&
      fullRefundSupported;
    const reason = !input.ready
      ? input.readinessReason
      : alreadyRefunded
        ? "This booking is already marked as refunded."
        : complimentary
          ? "Complimentary bookings cannot be refunded through PayFast."
          : refundStatus === "processing"
            ? "A refund is already processing for this booking."
            : refundStatus === "accepted"
              ? "This booking is already marked as refunded."
              : refundStatus === "reconciliation_required"
                ? "This refund has an unknown provider outcome and requires reconciliation before another attempt."
                : providerPaymentTotal <= 0
                  ? "Refund amount is not valid for this payment."
                  : !fullRefundSupported
                    ? "This booking requires a multi-transaction refund workflow, which is not supported yet."
                    : "";

    return {
      bookingReference: booking.booking_reference,
      eligible,
      reason: reason || null,
    };
  });
}
