import {
  getConfiguredZoneMaxSeats,
  seatingZones,
  type BookingSource,
  type DemoVenueSettings,
} from "@/lib/zingaraDemo";

export const corporatePartySizeThreshold = 20;

export function getConfiguredVenueGuestCapacity(
  settings: DemoVenueSettings,
) {
  return seatingZones.reduce(
    (total, zone) => total + getConfiguredZoneMaxSeats(settings, zone),
    0,
  );
}

export function isCorporatePartySize(partySize: number) {
  return Number.isFinite(partySize) && partySize >= corporatePartySizeThreshold;
}

export function isCorporateBookingSource(
  source: string | null | undefined,
) {
  return source === "corporate-direct";
}

export function isAuthoritativeCorporateBooking(input: {
  bookingOrigin?: string | null;
  bookingSource?: string | null;
  corporateRequestId?: string | null;
}) {
  return input.bookingOrigin === "corporate" ||
    isCorporateBookingSource(input.bookingSource) ||
    Boolean(input.corporateRequestId);
}

export function enforceCorporateBookingSource(
  partySize: number,
  source: BookingSource | undefined,
): BookingSource {
  return isCorporatePartySize(partySize)
    ? "corporate-direct"
    : source ?? "online";
}
