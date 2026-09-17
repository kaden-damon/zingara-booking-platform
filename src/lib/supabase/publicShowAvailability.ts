import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type SeatingZoneId,
  defaultVenueSettings,
  getConfiguredZoneMaxSeats,
  getEnabledSeatingZones,
  getZoneSectionLookupTitles,
  normalizeVenueSettings,
  seatingZones,
} from "@/lib/zingaraDemo";
import { resolveZoneCapacityState } from "@/lib/capacityModel";

const occupyingBookingStatuses = [
  "new",
  "confirmed",
  "pending_payment",
  "checked_in",
] as const;

function getZoneIdForSection(section: string | null) {
  const normalizedSection = section?.trim().toLowerCase();
  if (!normalizedSection) return null;

  return (
    seatingZones.find((zone) =>
      [zone.id, ...getZoneSectionLookupTitles(zone.id, zone.title)].some(
        (value) => value.toLowerCase() === normalizedSection,
      ),
    )?.id ?? null
  );
}

export async function loadPublicShowAvailability(
  serviceClient: SupabaseClient,
  showId: string,
) {
  const [bookingResult, settingsResult, salesResult] = await Promise.all([
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
    serviceClient
      .from("show_zone_sales_controls")
      .select("zone_id,public_sales_open,reason,changed_at,updated_at")
      .eq("show_id", showId),
  ]);

  if (bookingResult.error) throw bookingResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (salesResult.error) throw salesResult.error;

  const settings = normalizeVenueSettings(
    (settingsResult.data as {
      settings?: Parameters<typeof normalizeVenueSettings>[0];
    } | null)?.settings,
  );
  const enabledZones = getEnabledSeatingZones(settings);
  const capacityBookings = (bookingResult.data ?? []).flatMap((row) => {
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
  const controlsByZone = new Map(
    (salesResult.data ?? []).map((row) => [row.zone_id, row]),
  );
  const occupiedSeatsByZone = Object.fromEntries(
    enabledZones.map((zone) => [
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
    enabledZones.map((zone) => [
      zone.id,
      Math.max(
        getConfiguredZoneMaxSeats(settings, zone) - occupiedSeatsByZone[zone.id],
        0,
      ),
    ]),
  ) as Record<SeatingZoneId, number>;
  const publicSalesOpenByZone = Object.fromEntries(
    enabledZones.map((zone) => [
      zone.id,
      controlsByZone.get(zone.id)?.public_sales_open !== false,
    ]),
  ) as Record<SeatingZoneId, boolean>;

  return {
    controls: enabledZones
      .filter((zone) => getConfiguredZoneMaxSeats(settings, zone) > 0)
      .map((zone) => {
      const control = controlsByZone.get(zone.id);
      return {
        changedAt: control?.changed_at ?? null,
        publicSalesOpen: control?.public_sales_open !== false,
        reason: control?.reason ?? null,
        updatedAt: control?.updated_at ?? null,
        zoneId: zone.id,
        zoneTitle: zone.title,
        };
      }),
    occupiedSeatsByZone,
    publicSalesOpenByZone,
    remainingSeatsByZone,
  };
}

export async function isPublicZoneSalesOpen(
  serviceClient: SupabaseClient,
  showId: string,
  zoneId: SeatingZoneId,
) {
  const { data, error } = await serviceClient
    .from("show_zone_sales_controls")
    .select("public_sales_open")
    .eq("show_id", showId)
    .eq("zone_id", zoneId)
    .maybeSingle();

  if (error) throw error;
  return data?.public_sales_open !== false;
}
