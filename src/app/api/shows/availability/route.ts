import {
  type SeatingZoneId,
  getVenueZoneSeatCapacity,
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

  const { data, error } = await serviceClient
    .from("bookings")
    .select("guest_count,section")
    .eq("show_id", showId)
    .is("archived_at", null)
    .in("booking_status", [...occupyingBookingStatuses]);

  if (error) {
    console.error("[Zingara API] Failed to load show availability", error);

    return Response.json(
      { error: "Show availability could not be loaded." },
      { status: 500 },
    );
  }

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
        getVenueZoneSeatCapacity(zone.id) - occupiedSeatsByZone[zone.id],
        0,
      ),
    ]),
  ) as Record<SeatingZoneId, number>;

  return Response.json({ occupiedSeatsByZone, remainingSeatsByZone });
}
