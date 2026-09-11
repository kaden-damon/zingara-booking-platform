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
import { runPublicPaymentHoldCleanup } from "@/lib/workflows/publicPaymentHolds";
import { resolveZoneCapacityState } from "@/lib/capacityModel";

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

  try {
    await runPublicPaymentHoldCleanup(serviceClient);
  } catch (error) {
    console.error("[Zingara API] Public payment hold cleanup failed", error);
  }

  const [bookingResult, settingsResult] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("guest_count,section,zone_entitlements")
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

  const capacityBookings = (data ?? []).flatMap((row) => {
    const zoneId = getZoneIdForSection(row.section);
    if (!zoneId) return [];

    return [{
      partySize: Math.max(Math.trunc(Number(row.guest_count) || 0), 0),
      status: "confirmed",
      zoneEntitlements: Array.isArray(row.zone_entitlements)
        ? row.zone_entitlements as Array<{ pax: number; zoneId: SeatingZoneId }>
        : null,
      zoneId,
    }];
  });

  const occupiedSeatsByZone = Object.fromEntries(
    seatingZones.map((zone) => [
      zone.id,
      resolveZoneCapacityState({
        baseCapacity: getConfiguredZoneMaxSeats(settings, zone),
        bookings: capacityBookings,
        showId,
        tables: [],
        zoneId: zone.id,
      }).activeEntitlementPax,
    ]),
  ) as Record<SeatingZoneId, number>;

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
