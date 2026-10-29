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

export function getComplimentaryBookingRate(
  category: ComplimentaryBookingCategory,
) {
  return category === "standard" ? 0 : complimentaryCategoryRate;
}

export function isStandardComplimentaryBooking(
  booking: Pick<DemoBooking, "agreedPriceSource" | "complimentaryCategory">,
) {
  return (
    isComplimentaryBooking(booking) &&
    (normalizeComplimentaryBookingCategory(booking.complimentaryCategory) ??
      "standard") === "standard"
  );
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

  const ratePerGuest = getComplimentaryBookingRate(category);
  const totalPrice = ratePerGuest * booking.partySize;
  const isStandard = category === "standard";
  const message = `Dear ${booking.customer.name}, your complimentary Zingara reservation for ${booking.partySize} ${booking.partySize === 1 ? "guest" : "guests"} on ${booking.bookingDate} has been confirmed. Section: ${booking.zoneTitle}. Live ticket: /ticket/${encodeURIComponent(booking.reference)}`;

  return {
    ...booking,
    addonsTotal: 0,
    agreedPriceSource: complimentaryPriceSource,
    amountPaid: 0,
    balanceDue: totalPrice,
    complimentaryCategory: category,
    depositPercentage: 100,
    discountAmount: 0,
    paymentOption: "full",
    paymentStatus: isStandard ? "comp-vip" : "pending-payment",
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
    status: isStandard ? "confirmed" : "pending-payment",
    subtotalPrice: totalPrice,
    ticketIssuedAt: isStandard
      ? booking.ticketIssuedAt ?? createdAt
      : undefined,
    totalPrice,
    lifecycleHistory: [
      {
        createdAt,
        id: `${booking.reference}-complimentary-created`,
        note: isStandard
          ? "Standard complimentary booking created by authorised staff at R0 obligation."
          : `${category === "media" ? "Media" : "Tradex"} complimentary booking created by authorised staff at R${ratePerGuest} per guest; awaiting payment.`,
        toStatus: isStandard ? "confirmed" : "pending-payment",
      },
    ],
    communicationHistory: isStandard ? [
      {
        channel: "email",
        id: `${booking.reference}-complimentary-booking-email`,
        message,
        sentAt: createdAt,
        subject: "Your Zingara complimentary reservation",
        templateId: "email-complimentary-booking",
        trigger: "complimentary-booking",
      },
    ] : [],
  };
}
