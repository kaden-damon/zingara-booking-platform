import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublicBookingCutoff } from "@/lib/bookingDeadlines";
import { isPublicBookingOpen } from "@/lib/publicBookingSales";
import { type SeatingZoneId, normalizeShowLocation } from "@/lib/zingaraDemo";
import { loadPublicShowAvailabilityBatch } from "@/lib/supabase/publicShowAvailability";
import { loadServerVenueSettings } from "@/lib/supabase/serverVenueSettings";
import {
  TWO_SEATER_BOOKING_LIMIT,
  type TwoSeaterAlternativeShow,
  twoSeaterOccupyingStatuses,
} from "@/lib/twoSeaterBookingLimit";

const showMetadataPrefix = "__zingara_show_meta__:";
const alternativeCandidateLimit = 18;
const alternativeResultLimit = 5;

type CurrentShow = {
  date: string;
  id: string;
  venue: string;
};

function getPublicShowId(show: { id: string; notes: string | null }) {
  if (!show.notes?.startsWith(showMetadataPrefix)) return show.id;

  try {
    const metadata = JSON.parse(
      show.notes.slice(showMetadataPrefix.length),
    ) as { legacyId?: string };
    return metadata.legacyId || show.id;
  } catch {
    return show.id;
  }
}

export async function loadTwoSeaterAlternativeShows(
  client: SupabaseClient,
  input: {
    currentShow: CurrentShow;
    zoneId: SeatingZoneId;
  },
): Promise<TwoSeaterAlternativeShow[]> {
  const location = normalizeShowLocation(input.currentShow.venue);
  if (!location) return [];

  const [{ data: candidates, error: showError }, settings] = await Promise.all([
    client
      .from("shows")
      .select("id,name,date,time,venue,notes,status")
      .eq("venue", input.currentShow.venue)
      .eq("status", "active")
      .gte("date", input.currentShow.date)
      .neq("id", input.currentShow.id)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(alternativeCandidateLimit),
    loadServerVenueSettings(client),
  ]);

  if (showError) throw showError;
  if (!candidates?.length) return [];
  if (!isPublicBookingOpen(settings, location)) return [];

  const showIds = candidates.map((show) => show.id);
  const [availabilityByShow, twoSeaterResult] = await Promise.all([
    loadPublicShowAvailabilityBatch(client, showIds),
    client
      .from("bookings")
      .select("show_id")
      .in("show_id", showIds)
      .eq("guest_count", 2)
      .is("archived_at", null)
      .in("booking_status", [...twoSeaterOccupyingStatuses]),
  ]);

  if (twoSeaterResult.error) throw twoSeaterResult.error;

  const counts = new Map<string, number>();
  for (const booking of twoSeaterResult.data ?? []) {
    counts.set(booking.show_id, (counts.get(booking.show_id) ?? 0) + 1);
  }

  return candidates.flatMap((show): TwoSeaterAlternativeShow[] => {
    const availability = availabilityByShow.get(show.id);
    const cutoff = getPublicBookingCutoff({
      date: show.date,
      location,
      settings,
    });
    const hasRequestedZone =
      availability?.publicSalesOpenByZone[input.zoneId] === true &&
      (availability.remainingSeatsByZone[input.zoneId] ?? 0) >= 2;

    if (
      cutoff.closed ||
      !availability?.showPubliclyBookable ||
      !hasRequestedZone ||
      (counts.get(show.id) ?? 0) >= TWO_SEATER_BOOKING_LIMIT
    ) {
      return [];
    }

    return [{
      date: show.date,
      id: getPublicShowId(show),
      label: show.name,
      location,
      time: show.time.slice(0, 5),
    }];
  }).slice(0, alternativeResultLimit);
}
