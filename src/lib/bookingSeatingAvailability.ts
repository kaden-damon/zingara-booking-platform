import { defaultPrivateBoothBookingLimits } from "./seatingBookingLimits";

export type BookingSeatingEligibilityInput = {
  hasExplicitTableAssignment?: boolean;
  isInternalCorporate?: boolean;
  isLimited?: boolean;
  isPublicSalesOpen?: boolean;
  maxGuests: number;
  minGuests: number;
  partySize: number;
  remainingSeats: number;
  supportsMultiTableFulfilment?: boolean;
};

export const multiTableBookingZoneIds = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] as const;

export function supportsMultiTableBookingFulfilment(zoneId: string) {
  return (multiTableBookingZoneIds as readonly string[]).includes(zoneId);
}

export const standardPrivateBoothGuestLimits = defaultPrivateBoothBookingLimits;

export const standardBookingMinimumGuests = 1;

export function getStandardBookingZoneGuestLimits(
  zoneId: string,
  defaults: { maxGuests: number; minGuests: number },
) {
  return zoneId === "royal-booths"
    ? standardPrivateBoothGuestLimits
    : { ...defaults, minGuests: standardBookingMinimumGuests };
}

export function isStandardBookingZoneGuestCountAllowed(
  zoneId: string,
  partySize: number,
  limits?: { minGuests: number; maxGuests: number },
) {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize >= 20) {
    return false;
  }

  if (limits) return partySize >= limits.minGuests && partySize <= limits.maxGuests;
  return (
    zoneId !== "royal-booths" ||
    (partySize >= standardPrivateBoothGuestLimits.minGuests && partySize <= standardPrivateBoothGuestLimits.maxGuests)
  );
}

export function getBookingSeatingEligibility({
  hasExplicitTableAssignment = false,
  isInternalCorporate = false,
  isLimited = false,
  isPublicSalesOpen = true,
  maxGuests,
  minGuests,
  partySize,
  remainingSeats,
  supportsMultiTableFulfilment = false,
}: BookingSeatingEligibilityInput) {
  const isGroupSizeAvailable =
    partySize >= minGuests &&
    (isInternalCorporate || supportsMultiTableFulfilment || partySize <= maxGuests);
  const hasEnoughVenueCapacity = remainingSeats >= partySize;
  const isAvailable =
    isGroupSizeAvailable && hasEnoughVenueCapacity && isPublicSalesOpen;
  const requiresFloorAssignment =
    isInternalCorporate && isAvailable && !hasExplicitTableAssignment;

  let availabilityMessage = "Available";

  if (!isGroupSizeAvailable) {
    availabilityMessage = "Not Available For This Group Size";
  } else if (!isPublicSalesOpen) {
    availabilityMessage = "Sold Out";
  } else if (!hasEnoughVenueCapacity) {
    availabilityMessage = "Not Enough Seats Available";
  } else if (requiresFloorAssignment) {
    availabilityMessage = "Available - Floor Assignment Required";
  } else if (isLimited) {
    availabilityMessage = "Limited";
  }

  return {
    availabilityMessage,
    hasEnoughVenueCapacity,
    isAvailable,
    isGroupSizeAvailable,
    requiresFloorAssignment,
  };
}
