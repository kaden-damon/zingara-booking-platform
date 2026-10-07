import {
  getManagementForecastZoneGuests,
  isManagementForecastActiveBooking,
  type ManagementForecastZoneGuests,
} from "./managementAnalytics.ts";

export type ShowCalendarOccupancyBooking = {
  archivedAt: string | null;
  bookingStatus: string;
  guestCount: number;
  section: string | null;
  showId: string;
  zoneEntitlements?: Array<{
    pax: number;
    zoneId: string;
  }> | null;
};

export type ShowCalendarOccupancySummary = {
  showId: string;
  zoneGuests: ManagementForecastZoneGuests;
};

const emptyZoneGuests = (): ManagementForecastZoneGuests => ({
  gc: 0,
  mr: 0,
  pb: 0,
  rb: 0,
});

export function buildShowCalendarOccupancySummaries(
  showIds: string[],
  bookings: ShowCalendarOccupancyBooking[],
): ShowCalendarOccupancySummary[] {
  const bookingsByShow = new Map<string, ShowCalendarOccupancyBooking[]>();

  for (const booking of bookings) {
    if (!isManagementForecastActiveBooking(booking)) continue;

    bookingsByShow.set(booking.showId, [
      ...(bookingsByShow.get(booking.showId) ?? []),
      booking,
    ]);
  }

  return [...new Set(showIds)].map((showId) => ({
    showId,
    zoneGuests: bookingsByShow.has(showId)
      ? getManagementForecastZoneGuests(bookingsByShow.get(showId) ?? [])
      : emptyZoneGuests(),
  }));
}
