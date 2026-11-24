export const bookingLimitZoneIds = [
  "golden-circle", "middle-ring", "royal-booths", "royal-balcony",
] as const;
export type BookingLimitZone = (typeof bookingLimitZoneIds)[number];
export type BookingLimitVenue = "cape-town" | "johannesburg";
export type SeatingBookingLimit = { minGuests: number; maxGuests: number };
export type SeatingBookingLimits = Record<BookingLimitVenue, Record<BookingLimitZone, SeatingBookingLimit>>;
export const defaultPrivateBoothBookingLimits = { minGuests: 6, maxGuests: 8 } as const;

const bookingLimitEditors = new Set([
  "e8598359-54a0-4e1f-a635-1ec8ae02cb78",
  "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188",
]);

export function canEditSeatingBookingLimits(staff: { id?: string | null; active?: boolean } | null | undefined) {
  return Boolean(staff?.active && staff.id && bookingLimitEditors.has(staff.id));
}

export function canEditFloorCapacitySession(session: { staffProfileId?: string | null } | null | undefined) {
  return canEditSeatingBookingLimits({ id: session?.staffProfileId, active: Boolean(session) });
}

export const floorCapacityAccessMessage = "Only Kaden Damon and Fatima MB may change seating capacity.";

export function getSeatingBookingLimit(
  settings: { bookingLimits?: SeatingBookingLimits } | null | undefined,
  venue: string | null | undefined,
  zone: string,
): SeatingBookingLimit {
  const location = venue === "johannesburg" ? "johannesburg" : "cape-town";
  return settings?.bookingLimits?.[location]?.[zone as BookingLimitZone] ??
    (zone === "royal-booths" ? defaultPrivateBoothBookingLimits : { minGuests: 1, maxGuests: 19 });
}

export function validateSeatingBookingLimit(zone: string, value: SeatingBookingLimit) {
  return bookingLimitZoneIds.includes(zone as BookingLimitZone) &&
    Number.isInteger(value?.minGuests) && Number.isInteger(value?.maxGuests) &&
    value.minGuests >= 1 && value.minGuests <= value.maxGuests &&
    value.maxGuests <= (zone === "royal-booths" ? 8 : 19);
}
