import {
  type SeatingZoneId,
  getVenueZoneSeatCapacity,
  defaultVenueSettings,
  getConfiguredZoneMaxSeats,
  normalizeVenueSettings,
  getZoneSectionLookupTitles,
  seatingZones,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const occupyingBookingStatuses = [
  "new",
  "confirmed",
  "pending_payment",
  "checked_in",
] as const;

function getZoneIdForSection(section: string | null) {
  const normalizedSection = section?.trim().toLowerCase();

  if (!normalizedSection) {
    return null;
  }

  return (
    seatingZones.find((zone) =>
      [zone.id, ...getZoneSectionLookupTitles(zone.id, zone.title)].some(
        (value) => value.toLowerCase() === normalizedSection,
      ),
    )?.id ?? null
  );
}

export async function GET(request: Request) {
  const showId = new URL(request.url).searchParams.get("showId")?.trim();

  if (!showId) {
    return Response.json({ error: "Show ID is required." }, { status: 400 });
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Show availability is temporarily unavailable." },
      { status: 503 },
    );
  }

  const [bookingResult, settingsResult] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("guest_count,section")
      .eq("show_id", showId)
      .is("archived_at", null)
      .in("booking_status", [...occupyingBookingStatuses]),
    serviceClient
      .from("venue_settings")
      .select("settings")
      .eq("venue_key", defaultVenueSettings.venueId)
      .maybeSingle(),
  ]);
  const { data, error } = bookingResult;

  if (error) {
    console.error("[Zingara API] Failed to load show availability", error);

    return Response.json(
      { error: "Show availability could not be loaded." },
      { status: 500 },
    );
  }

  if (settingsResult.error) {
    console.error("[Zingara API] Failed to load venue capacity", settingsResult.error);
    return Response.json({ error: "Show availability could not be loaded." }, { status: 500 });
  }

  const settings = normalizeVenueSettings(
    (settingsResult.data as { settings?: Parameters<typeof normalizeVenueSettings>[0] } | null)?.settings,
  );

  const occupiedSeatsByZone = Object.fromEntries(
    seatingZones.map((zone) => [zone.id, 0]),
  ) as Record<SeatingZoneId, number>;

  for (const row of data ?? []) {
    const zoneId = getZoneIdForSection(row.section);

    if (zoneId) {
      occupiedSeatsByZone[zoneId] += Math.max(
        Math.trunc(Number(row.guest_count) || 0),
        0,
      );
    }
  }

  const remainingSeatsByZone = Object.fromEntries(
    seatingZones.map((zone) => [
      zone.id,
      Math.max(
        getConfiguredZoneMaxSeats(settings, zone) - occupiedSeatsByZone[zone.id],
        0,
      ),
    ]),
  ) as Record<SeatingZoneId, number>;

  return Response.json({ occupiedSeatsByZone, remainingSeatsByZone });
}
