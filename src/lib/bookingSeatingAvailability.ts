export type BookingSeatingEligibilityInput = {
  hasExplicitTableAssignment?: boolean;
  isInternalCorporate?: boolean;
  isLimited?: boolean;
  maxGuests: number;
  minGuests: number;
  partySize: number;
  remainingSeats: number;
};

export const standardPrivateBoothGuestLimits = {
  maxGuests: 8,
  minGuests: 4,
} as const;

export function getStandardBookingZoneGuestLimits(
  zoneId: string,
  defaults: { maxGuests: number; minGuests: number },
) {
  return zoneId === "royal-booths"
    ? standardPrivateBoothGuestLimits
    : defaults;
}

export function isStandardBookingZoneGuestCountAllowed(
  zoneId: string,
  partySize: number,
) {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize >= 20) {
    return false;
  }

  if (zoneId !== "royal-booths") return true;

  return (
    partySize >= standardPrivateBoothGuestLimits.minGuests &&
    partySize <= standardPrivateBoothGuestLimits.maxGuests
  );
}

export function getBookingSeatingEligibility({
  hasExplicitTableAssignment = false,
  isInternalCorporate = false,
  isLimited = false,
  maxGuests,
  minGuests,
  partySize,
  remainingSeats,
}: BookingSeatingEligibilityInput) {
  const isGroupSizeAvailable =
    partySize >= minGuests &&
    (isInternalCorporate || partySize <= maxGuests);
  const hasEnoughVenueCapacity = remainingSeats >= partySize;
  const isAvailable = isGroupSizeAvailable && hasEnoughVenueCapacity;
  const requiresFloorAssignment =
    isInternalCorporate && isAvailable && !hasExplicitTableAssignment;

  let availabilityMessage = "Available";

  if (!isGroupSizeAvailable) {
    availabilityMessage = "Not Available For This Group Size";
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
