import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type SeatingZoneId,
  getVenueZoneSeatCapacity,
  defaultVenueSettings,
  getConfiguredZoneMaxSeats,
  normalizeVenueSettings,
  getZoneSectionLookupTitles,
  seatingZones,
} from "@/lib/zingaraDemo";
import { getEffectiveOperationalZoneCapacity } from "@/lib/operationalZoneCapacity";
import { getBookingZonePax } from "@/lib/capacityModel";

const capacityErrorPrefix = "ZONE_CAPACITY_EXCEEDED";
const occupyingBookingStatuses = [
  "new",
  "confirmed",
  "pending_payment",
  "checked_in",
] as const;

type ExistingBookingRow = {
  archived_at: string | null;
  booking_status: string;
  guest_count: number;
  id: string;
  section: string | null;
  show_id: string;
  zone_entitlements?: Array<{ pax: number; zoneId: SeatingZoneId }> | null;
};

export type BookingCapacityInput = {
  bookingReference: string;
  bookingStatus: string;
  capacityScope?: "base" | "operational";
  guestCount: number;
  section: string;
  showId: string;
};

function normalizeBookingZone(section: string): SeatingZoneId | null {
  const normalized = section.trim().toLowerCase();

  return (
    seatingZones.find(
      (zone) =>
        zone.id === normalized ||
        getZoneSectionLookupTitles(zone.id, zone.title).some(
          (title) => title.toLowerCase() === normalized,
        ),
    )?.id ?? null
  );
}

function isOccupyingStatus(status: string) {
  return occupyingBookingStatuses.includes(
    status as (typeof occupyingBookingStatuses)[number],
  );
}

export function isBookingCapacityError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return message.includes(capacityErrorPrefix);
}

export async function validateBookingCapacityIncrease(
  supabase: SupabaseClient,
  input: BookingCapacityInput,
) {
  const zoneId = normalizeBookingZone(input.section);

  if (!zoneId || zoneId === "elevated-stage") {
    return { allowed: true as const };
  }

  const { data: existingData, error: existingError } = await supabase
    .from("bookings")
    .select("id,show_id,section,guest_count,booking_status,archived_at,zone_entitlements")
    .eq("booking_reference", input.bookingReference)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const existing = existingData as ExistingBookingRow | null;
  const existingZoneId = existing?.section
    ? normalizeBookingZone(existing.section)
    : null;
  const nextGuestCount = Math.max(Math.trunc(Number(input.guestCount) || 0), 0);
  const nextOccupies = isOccupyingStatus(input.bookingStatus);
  const existingOccupies = Boolean(
    existing &&
      !existing.archived_at &&
      isOccupyingStatus(existing.booking_status),
  );
  const sameEntitlementBucket = Boolean(
    existing && existing.show_id === input.showId && existingZoneId === zoneId,
  );

  if (
    !nextOccupies ||
    (sameEntitlementBucket &&
      existingOccupies &&
      nextGuestCount <= Math.max(Number(existing?.guest_count) || 0, 0))
  ) {
    return { allowed: true as const };
  }

  let query = supabase
    .from("bookings")
    .select("id,guest_count,section,zone_entitlements")
    .eq("show_id", input.showId)
    .is("archived_at", null)
    .in("booking_status", [...occupyingBookingStatuses]);

  if (existing?.id) {
    query = query.neq("id", existing.id);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const existingEntitlement = (data ?? []).reduce((total, row) => {
    const rowZoneId = normalizeBookingZone(String(row.section ?? ""));
    if (!rowZoneId) return total;

    return total + getBookingZonePax({
      partySize: Math.max(Number(row.guest_count) || 0, 0),
      status: "confirmed",
      zoneEntitlements: Array.isArray(row.zone_entitlements)
        ? row.zone_entitlements as Array<{ pax: number; zoneId: SeatingZoneId }>
        : null,
      zoneId: rowZoneId,
    }, zoneId);
  }, 0);
  const { data: settingsData, error: settingsError } = await supabase
    .from("venue_settings")
    .select("settings")
    .eq("venue_key", defaultVenueSettings.venueId)
    .maybeSingle();

  if (settingsError) {
    throw settingsError;
  }

  const settings = normalizeVenueSettings(
    (settingsData as { settings?: Parameters<typeof normalizeVenueSettings>[0] } | null)?.settings,
  );
  const zone = seatingZones.find((candidate) => candidate.id === zoneId);
  const baseCapacity = zone
    ? getConfiguredZoneMaxSeats(settings, zone)
    : getVenueZoneSeatCapacity(zoneId);
  let temporaryCapacity = 0;

  if (input.capacityScope !== "base") {
    const { data: temporaryTables, error: temporaryTablesError } = await supabase
      .from("show_tables")
      .select("show_id,section,capacity,capacity_configured,status,is_physical,is_override,availability_scope,merged_from,merged_parent_id")
      .eq("show_id", input.showId)
      .eq("is_physical", false)
      .eq("is_override", true)
      .eq("availability_scope", "operational")
      .is("merged_parent_id", null);

    if (temporaryTablesError) {
      throw temporaryTablesError;
    }

    temporaryCapacity = getEffectiveOperationalZoneCapacity({
      baseCapacity,
      showId: input.showId,
      tables: (temporaryTables ?? []).map((table) => ({
        availabilityScope: table.availability_scope,
        capacityConfigured: table.capacity_configured,
        mergedFrom: table.merged_from,
        mergedInto: table.merged_parent_id,
        physicalTable: table.is_physical,
        seatCapacity: table.capacity,
        showId: table.show_id,
        status: table.status,
        zoneId: normalizeBookingZone(String(table.section ?? "")) ?? "elevated-stage",
      })),
      zoneId,
    }).temporaryCapacity;
  }

  const capacity = baseCapacity + temporaryCapacity;
  const resultingEntitlement = existingEntitlement + nextGuestCount;

  if (resultingEntitlement <= capacity) {
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    baseCapacity,
    capacity,
    existingEntitlement,
    overBy: resultingEntitlement - capacity,
    resultingEntitlement,
    temporaryCapacity,
    zoneId,
  };
}

export function getBookingCapacityConflictResponse(
  result: Exclude<
    Awaited<ReturnType<typeof validateBookingCapacityIncrease>>,
    { allowed: true }
  >,
) {
  const zone = seatingZones.find((candidate) => candidate.id === result.zoneId);

  return Response.json(
    {
      capacity: result.capacity,
      baseCapacity: result.baseCapacity,
      error: `${zone?.title ?? "This seating zone"} cannot accept additional guests because the venue capacity would be exceeded.`,
      existingEntitlement: result.existingEntitlement,
      resultingEntitlement: result.resultingEntitlement,
      temporaryCapacity: result.temporaryCapacity,
    },
    { status: 409 },
  );
}
