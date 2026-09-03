import type { DemoBooking } from "./zingaraDemo";

export const complimentaryPriceSource = "complimentary" as const;

export function isComplimentaryBooking(
  booking: Pick<DemoBooking, "agreedPriceSource">,
) {
  return booking.agreedPriceSource === complimentaryPriceSource;
}

export function applyAuthoritativeComplimentaryBooking(input: {
  booking: DemoBooking;
  staffProfileId: string;
  createdAt?: string;
}): DemoBooking {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const { booking, staffProfileId } = input;
  const message = `Dear ${booking.customer.name}, your complimentary Zingara reservation for ${booking.partySize} guests on ${booking.bookingDate} has been confirmed. Section: ${booking.zoneTitle}. Live ticket: /ticket/${encodeURIComponent(booking.reference)}`;

  return {
    ...booking,
    addonsTotal: 0,
    agreedPriceSource: complimentaryPriceSource,
    amountPaid: 0,
    balanceDue: 0,
    depositPercentage: 100,
    discountAmount: 0,
    paymentOption: "full",
    paymentStatus: "comp-vip",
    pricePerPerson: 0,
    pricingProvenance: {
      agreedPricePerPerson: 0,
      authorizedByStaffId: staffProfileId,
      depositPerPerson: 0,
      paymentModel: "full",
      source: complimentaryPriceSource,
    },
    promoCode: undefined,
    promoCodeId: undefined,
    promoLabel: undefined,
    promoLocation: undefined,
    serviceFeeAmount: 0,
    status: "confirmed",
    subtotalPrice: 0,
    ticketIssuedAt: booking.ticketIssuedAt ?? createdAt,
    totalPrice: 0,
    lifecycleHistory: [
      {
        createdAt,
        id: `${booking.reference}-complimentary-created`,
        note: "Complimentary booking created by authorised staff at R0 obligation.",
        toStatus: "confirmed",
      },
    ],
    communicationHistory: [
      {
        channel: "email",
        id: `${booking.reference}-complimentary-booking-email`,
        message,
        sentAt: createdAt,
        subject: "Your Zingara complimentary reservation",
        templateId: "email-complimentary-booking",
        trigger: "complimentary-booking",
      },
    ],
  };
}
