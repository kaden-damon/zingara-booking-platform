import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type SeatingZoneId,
  getZoneSectionLookupTitles,
  seatingZones,
} from "@/lib/zingaraDemo";
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

type BookingCapacityStateRow = {
  active_entitlement_pax: number;
  base_capacity: number;
  effective_operational_capacity: number;
  temporary_capacity: number;
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

  const { data: stateData, error: stateError } = await supabase.rpc(
    "booking_capacity_zone_state",
    {
      p_excluded_table_id: null,
      p_show_id: input.showId,
      p_zone: zoneId,
    },
  );

  if (stateError) {
    throw stateError;
  }

  const state = (
    Array.isArray(stateData) ? stateData[0] : stateData
  ) as BookingCapacityStateRow | null;

  if (!state) {
    throw new Error("Authoritative capacity state is unavailable.");
  }

  const currentBookingEntitlement =
    sameEntitlementBucket && existingOccupies && existing
      ? getBookingZonePax(
          {
            partySize: Math.max(Number(existing.guest_count) || 0, 0),
            status: "confirmed",
            zoneEntitlements: Array.isArray(existing.zone_entitlements)
              ? existing.zone_entitlements
              : null,
            zoneId,
          },
          zoneId,
        )
      : 0;
  const existingEntitlement = Math.max(
    Number(state.active_entitlement_pax) - currentBookingEntitlement,
    0,
  );
  const baseCapacity = Math.max(Number(state.base_capacity) || 0, 0);
  const temporaryCapacity = Math.max(
    Number(state.temporary_capacity) || 0,
    0,
  );
  const capacity = input.capacityScope === "base"
    ? baseCapacity
    : Math.max(Number(state.effective_operational_capacity) || 0, 0);
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
