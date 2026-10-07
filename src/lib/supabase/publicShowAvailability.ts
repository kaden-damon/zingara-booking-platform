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
import {
  isShowPubliclyBookable,
  publicShowUnavailableMessage,
} from "@/lib/publicShowSales";

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

export type PublicShowAvailability = {
  controls: Array<{
    changedAt: string | null;
    publicSalesOpen: boolean;
    reason: string | null;
    updatedAt: string | null;
    zoneId: SeatingZoneId;
    zoneTitle: string;
  }>;
  occupiedSeatsByZone: Record<SeatingZoneId, number>;
  publicSalesOpenByZone: Record<SeatingZoneId, boolean>;
  remainingSeatsByZone: Record<SeatingZoneId, number>;
  showPubliclyBookable: boolean;
};

type ShowAvailabilityOptions = {
  capacityScope?: "base" | "operational";
};

export async function loadPublicShowAvailability(
  serviceClient: SupabaseClient,
  showId: string,
  options: ShowAvailabilityOptions = {},
): Promise<PublicShowAvailability> {
  const results = await loadPublicShowAvailabilityBatch(
    serviceClient,
    [showId],
    options,
  );
  return results.get(showId) ?? {
    controls: [],
    occupiedSeatsByZone: {} as Record<SeatingZoneId, number>,
    publicSalesOpenByZone: {} as Record<SeatingZoneId, boolean>,
    remainingSeatsByZone: {} as Record<SeatingZoneId, number>,
    showPubliclyBookable: false,
  };
}

export async function loadPublicShowAvailabilityBatch(
  serviceClient: SupabaseClient,
  showIds: string[],
  options: ShowAvailabilityOptions = {},
): Promise<Map<string, PublicShowAvailability>> {
  const uniqueShowIds = [...new Set(showIds)].filter(Boolean);
  if (uniqueShowIds.length === 0) {
    return new Map<string, PublicShowAvailability>();
  }

  const operationalTablesPromise = options.capacityScope === "operational"
    ? serviceClient
        .from("show_tables")
        .select("id,show_id,section,capacity,capacity_configured,status,is_physical,is_override,availability_scope,merged_from,merged_parent_id,booking_id")
        .in("show_id", uniqueShowIds)
        .eq("is_physical", false)
        .eq("is_override", true)
        .eq("availability_scope", "operational")
        .is("merged_parent_id", null)
    : Promise.resolve({ data: [], error: null });
  const [
    bookingResult,
    settingsResult,
    salesResult,
    showsResult,
    operationalTablesResult,
    buyoutsResult,
  ] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("show_id,guest_count,section,zone_entitlements")
      .in("show_id", uniqueShowIds)
      .is("archived_at", null)
      .in("booking_status", [...occupyingBookingStatuses]),
    serviceClient
      .from("venue_settings")
      .select("settings")
      .eq("venue_key", defaultVenueSettings.venueId)
      .maybeSingle(),
    serviceClient
      .from("show_zone_sales_controls")
      .select("show_id,zone_id,public_sales_open,reason,changed_at,updated_at")
      .in("show_id", uniqueShowIds),
    serviceClient
      .from("shows")
      .select("id,status")
      .in("id", uniqueShowIds),
    operationalTablesPromise,
    serviceClient
      .from("corporate_buyouts")
      .select("show_id")
      .in("show_id", uniqueShowIds)
      .in("state", ["provisional", "awaiting_payment", "fully_paid", "confirmed"]),
  ]);

  if (bookingResult.error) throw bookingResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (salesResult.error) throw salesResult.error;
  if (showsResult.error) throw showsResult.error;
  if (operationalTablesResult.error) throw operationalTablesResult.error;
  if (buyoutsResult.error) throw buyoutsResult.error;

  const settings = normalizeVenueSettings(
    (settingsResult.data as {
      settings?: Parameters<typeof normalizeVenueSettings>[0];
    } | null)?.settings,
  );
  const enabledZones = getEnabledSeatingZones(settings);
  const showStatuses = new Map(
    (showsResult.data ?? []).map((show) => [show.id, show.status]),
  );
  const buyoutShowIds = new Set(
    (buyoutsResult.data ?? []).map((buyout) => buyout.show_id),
  );
  const results = new Map<string, PublicShowAvailability>();
  for (const showId of uniqueShowIds) {
    const hasFullShowBuyout = buyoutShowIds.has(showId);
    const showPubliclyBookable =
      isShowPubliclyBookable(showStatuses.get(showId)) && !hasFullShowBuyout;
    const capacityBookings = (bookingResult.data ?? []).flatMap((row) => {
      if (row.show_id !== showId) return [];
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
      (salesResult.data ?? [])
        .filter((row) => row.show_id === showId)
        .map((row) => [row.zone_id, row]),
    );
    const capacityTables = (operationalTablesResult.data ?? []).flatMap((table) => {
      if (table.show_id !== showId) return [];
      const zoneId = getZoneIdForSection(table.section);
      if (!zoneId) return [];
      return [{
        availabilityScope: table.availability_scope,
        bookingReference: table.booking_id,
        capacityConfigured: table.capacity_configured,
        id: table.id,
        isOverride: table.is_override,
        mergedFrom: table.merged_from,
        mergedInto: table.merged_parent_id,
        physicalTable: table.is_physical,
        seatCapacity: table.capacity,
        showId: table.show_id,
        status: table.status,
        zoneId,
      }];
    });
    const capacityStateByZone = new Map(enabledZones.map((zone) => [
      zone.id,
      resolveZoneCapacityState({
        baseCapacity: getConfiguredZoneMaxSeats(settings, zone),
        bookings: capacityBookings,
        showId,
        tables: capacityTables,
        zoneId: zone.id,
      }),
    ]));
    const occupiedSeatsByZone = Object.fromEntries(enabledZones.map((zone) => [
      zone.id,
      capacityStateByZone.get(zone.id)?.activeEntitlementPax ?? 0,
    ])) as Record<SeatingZoneId, number>;
    const remainingSeatsByZone = Object.fromEntries(enabledZones.map((zone) => [
      zone.id,
      options.capacityScope === "operational"
        ? capacityStateByZone.get(zone.id)?.operationalRemaining ?? 0
        : capacityStateByZone.get(zone.id)?.baseSellableRemaining ?? 0,
    ])) as Record<SeatingZoneId, number>;
    const publicSalesOpenByZone = Object.fromEntries(enabledZones.map((zone) => [
      zone.id,
      showPubliclyBookable &&
        controlsByZone.get(zone.id)?.public_sales_open !== false,
    ])) as Record<SeatingZoneId, boolean>;

    results.set(showId, {
      controls: enabledZones
        .filter((zone) => getConfiguredZoneMaxSeats(settings, zone) > 0)
        .map((zone) => {
          const control = controlsByZone.get(zone.id);
          return {
            changedAt: control?.changed_at ?? null,
            publicSalesOpen:
              showPubliclyBookable && control?.public_sales_open !== false,
            reason: showPubliclyBookable
              ? control?.reason ?? null
              : hasFullShowBuyout
                ? "This performance is reserved for a Full Show Buyout."
                : publicShowUnavailableMessage,
            updatedAt: control?.updated_at ?? null,
            zoneId: zone.id,
            zoneTitle: zone.title,
          };
        }),
      occupiedSeatsByZone,
      publicSalesOpenByZone,
      remainingSeatsByZone,
      showPubliclyBookable,
    });
  }

  return results;
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
