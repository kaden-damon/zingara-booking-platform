import type { DemoBooking } from "./zingaraDemo";

export const complimentaryPriceSource = "complimentary" as const;
export const complimentaryCategoryRate = 550;
export type ComplimentaryBookingCategory =
  | "standard"
  | "media"
  | "tradex";

export function normalizeComplimentaryBookingCategory(value: unknown) {
  return value === "standard" || value === "media" || value === "tradex"
    ? value
    : null;
}

export function getComplimentaryBookingRate() {
  return 0;
}

export function getComplimentaryInternalValue(guestCount: number) {
  return (
    Math.max(Math.trunc(Number(guestCount) || 0), 0) *
    complimentaryCategoryRate
  );
}

export function isSettledComplimentaryBooking(
  booking: Pick<DemoBooking, "agreedPriceSource">,
) {
  return isComplimentaryBooking(booking);
}

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
  const category = normalizeComplimentaryBookingCategory(
    booking.complimentaryCategory,
  );

  if (!category) {
    throw new Error("A valid complimentary booking category is required.");
  }

  const ratePerGuest = getComplimentaryBookingRate();
  const message = `Dear ${booking.customer.name}, your complimentary Zingara reservation for ${booking.partySize} ${booking.partySize === 1 ? "guest" : "guests"} on ${booking.bookingDate} has been confirmed. Section: ${booking.zoneTitle}. Live ticket: /ticket/${encodeURIComponent(booking.reference)}`;

  return {
    ...booking,
    addonsTotal: 0,
    agreedPriceSource: complimentaryPriceSource,
    amountPaid: 0,
    balanceDue: 0,
    complimentaryCategory: category,
    depositPercentage: 100,
    discountAmount: 0,
    paymentOption: "full",
    paymentStatus: "comp-vip",
    pricePerPerson: ratePerGuest,
    pricingProvenance: {
      agreedPricePerPerson: ratePerGuest,
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
        note: `${category === "standard" ? "Standard" : category === "media" ? "Media" : "Tradex"} complimentary booking created by authorised staff at R0 guest obligation.`,
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
