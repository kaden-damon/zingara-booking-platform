import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildShowCalendarOccupancySummaries,
  type ShowCalendarOccupancyBooking,
} from "@/lib/showCalendarOccupancy";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  managementForecastActiveBookingStatuses,
  type AnalyticsVenue,
} from "@/lib/managementAnalytics";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

const bookingPageSize = 1000;

type BookingRow = {
  archived_at: string | null;
  booking_status: string;
  guest_count: number;
  id: string;
  section: string | null;
  show_id: string;
  zone_entitlements: Array<{
    pax?: number | string;
    zoneId?: string;
  }> | null;
};

type ShowRow = {
  date: string;
  id: string;
  time: string;
  venue: string | null;
};

export type ShowCalendarOccupancyDataset = {
  bookingCount: number;
  month: string;
  showCount: number;
  summaries: ReturnType<typeof buildShowCalendarOccupancySummaries>;
};

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  return monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

function permittedVenues(venueScope: string[], requestedVenue: string) {
  const normalizedScope = normalizeStaffVenueScope(venueScope);
  const allowed = new Set<AnalyticsVenue>(
    normalizedScope.includes("all")
      ? ["cape-town", "johannesburg"]
      : normalizedScope.filter(
          (value): value is AnalyticsVenue =>
            value === "cape-town" || value === "johannesburg",
        ),
  );

  if (requestedVenue === "all") return allowed;

  const requested = normalizeShowLocation(requestedVenue);
  return new Set<AnalyticsVenue>(
    requested && allowed.has(requested) ? [requested] : [],
  );
}

function number(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
}

function toBooking(row: BookingRow): ShowCalendarOccupancyBooking {
  return {
    archivedAt: row.archived_at,
    bookingStatus: row.booking_status,
    guestCount: number(row.guest_count),
    section: row.section,
    showId: row.show_id,
    zoneEntitlements: Array.isArray(row.zone_entitlements)
      ? row.zone_entitlements.map((entitlement) => ({
          pax: number(entitlement.pax),
          zoneId: entitlement.zoneId ?? "",
        }))
      : null,
  };
}

export async function loadShowCalendarOccupancy(
  serviceClient: SupabaseClient,
  venueScope: string[],
  input: { month: string; venue: string },
): Promise<ShowCalendarOccupancyDataset> {
  const venues = permittedVenues(venueScope, input.venue);

  if (venues.size === 0) {
    return {
      bookingCount: 0,
      month: input.month,
      showCount: 0,
      summaries: [],
    };
  }

  const { data: rawShowRows, error: showError } = await serviceClient
    .from("shows")
    .select("id,date,time,venue")
    .gte("date", `${input.month}-01`)
    .lt("date", `${nextMonth(input.month)}-01`)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (showError) throw showError;

  const showRows = ((rawShowRows ?? []) as ShowRow[]).filter((show) => {
    const venue = normalizeShowLocation(show.venue);
    return Boolean(venue && venues.has(venue));
  });
  const showIds = showRows.map((show) => show.id);
  const bookingRows: BookingRow[] = [];

  if (showIds.length > 0) {
    for (let from = 0; ; from += bookingPageSize) {
      const { data, error } = await serviceClient
        .from("bookings")
        .select(
          "id,show_id,guest_count,booking_status,section,zone_entitlements,archived_at",
        )
        .in("show_id", showIds)
        .is("archived_at", null)
        .in("booking_status", [
          ...managementForecastActiveBookingStatuses,
        ])
        .order("id", { ascending: true })
        .range(from, from + bookingPageSize - 1);

      if (error) throw error;

      const page = (data ?? []) as BookingRow[];
      bookingRows.push(...page);
      if (page.length < bookingPageSize) break;
    }
  }

  return {
    bookingCount: bookingRows.length,
    month: input.month,
    showCount: showIds.length,
    summaries: buildShowCalendarOccupancySummaries(
      showIds,
      bookingRows.map(toBooking),
    ),
  };
}
