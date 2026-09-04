import type { DemoBooking } from "@/lib/zingaraDemo";

export type BookingPromoFilter = "all" | "none" | string;

export function getPersistedBookingPromoCode(booking: DemoBooking) {
  return booking.promoRedemption?.code.trim().toUpperCase() ?? "";
}

export function getPersistedPromoFilterOptions(bookings: DemoBooking[]) {
  return [...new Set(bookings.map(getPersistedBookingPromoCode).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en-ZA"));
}

export function bookingMatchesPromoFilter(
  booking: DemoBooking,
  filter: BookingPromoFilter,
) {
  const code = getPersistedBookingPromoCode(booking);

  if (filter === "all") {
    return true;
  }

  if (filter === "none") {
    return !code;
  }

  return code === filter.trim().toUpperCase();
}

export function getPersistedPromoDiscountLabel(booking: DemoBooking) {
  const redemption = booking.promoRedemption;

  if (!redemption || redemption.subtotalAmount <= 0) {
    return "Persisted redemption";
  }

  const percentage =
    (redemption.discountAmount / redemption.subtotalAmount) * 100;
  const rounded = Math.round(percentage * 100) / 100;

  return `${rounded.toLocaleString("en-ZA", {
    maximumFractionDigits: 2,
  })}% effective`;
}
