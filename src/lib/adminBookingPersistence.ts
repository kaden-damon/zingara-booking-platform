import type { DemoBooking } from "./zingaraDemo";

export type AdminBookingMutation = {
  after: DemoBooking;
  before?: DemoBooking;
  communicationChanged: boolean;
  customerChanged: boolean;
  paymentChanged: boolean;
  ticketChanged: boolean;
};

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function paymentState(booking: DemoBooking) {
  return {
    amountPaid: booking.amountPaid,
    balanceDue: booking.balanceDue,
    paymentOption: booking.paymentOption,
    paymentStatus: booking.paymentStatus,
    refundNotes: booking.refundNotes,
    refunded:
      booking.status === "refunded" || booking.paymentStatus === "refunded",
  };
}

function ticketState(booking: DemoBooking) {
  return {
    guestTickets: booking.guestTickets,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    ticketCode: booking.ticketCode,
    ticketIssuedAt: booking.ticketIssuedAt,
  };
}

export function planAdminBookingMutations(
  currentBookings: DemoBooking[],
  nextBookings: DemoBooking[],
) {
  const currentByReference = new Map(
    currentBookings.map((booking) => [booking.reference, booking]),
  );

  return nextBookings.flatMap<AdminBookingMutation>((after) => {
    const before = currentByReference.get(after.reference);

    if (before && sameValue(before, after)) {
      return [];
    }

    return [
      {
        after,
        before,
        communicationChanged: Boolean(
          before &&
            !sameValue(before.communicationHistory, after.communicationHistory),
        ),
        customerChanged: Boolean(
          before && !sameValue(before.customer, after.customer),
        ),
        paymentChanged: Boolean(
          before && !sameValue(paymentState(before), paymentState(after)),
        ),
        ticketChanged: Boolean(
          before && !sameValue(ticketState(before), ticketState(after)),
        ),
      },
    ];
  });
}
