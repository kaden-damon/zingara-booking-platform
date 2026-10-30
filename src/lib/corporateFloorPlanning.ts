import type { SeatingZoneId } from "./zingaraDemo";

export const corporateFloorZones = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] as const satisfies readonly SeatingZoneId[];

export type CorporateFloorZone = (typeof corporateFloorZones)[number];

export type CorporateZoneAvailability = {
  bookedPaxExcludingBooking: number;
  eligible: boolean;
  remainingPax: number;
  zoneCapacity: number;
  zoneId: CorporateFloorZone;
};

export type FloorPlanningBooking = {
  id: string;
  isCorporate: boolean;
  pax: number;
  reference: string;
};

export type FloorPlanningTable = {
  capacity: number;
  id: string;
  kind: "merged" | "physical" | "temporary";
  minimumOccupancy?: number;
  sortOrder?: number;
  tableCode: string;
};

export type TemporaryCapacityMix = {
  capacities: number[];
  totalCapacity: number;
  unusedSeats: number;
};

export type FloorBookingPlan = {
  bookingReference: string;
  existingTableCodes: string[];
  existingTableIds: string[];
  isCorporate: boolean;
  newCapacities: number[];
  pax: number;
  unresolvedReason: string | null;
};

export type ZoneFloorCapacityPlan = {
  activeEntitlementPax: number;
  allowedTemporaryCapacities: number[];
  bookingPlans: FloorBookingPlan[];
  capacityRequiredPhysicalTables: number;
  claimedReservedCapacity: number;
  currentAssignableSeats: number;
  newCapacity: number;
  netAssignableCapacity: number;
  operationalShortfall: number;
  queuedBookings: number;
  queuedPax: number;
  suggestedTables: Array<{ capacity: number; count: number }>;
  unusedSeats: number;
  zoneCapacity: number;
  zoneCapacityInsufficient: boolean;
  zoneId: CorporateFloorZone;
};

export function getCorporateZoneAvailability(input: {
  activeBookings: Array<{
    bookingId: string;
    pax: number;
    zoneId: SeatingZoneId;
  }>;
  bookingId: string;
  bookingPax: number;
  zoneCapacities: Record<CorporateFloorZone, number>;
}) {
  return corporateFloorZones.map((zoneId) => {
    const bookedPaxExcludingBooking = input.activeBookings
      .filter(
        (booking) =>
          booking.bookingId !== input.bookingId && booking.zoneId === zoneId,
      )
      .reduce((total, booking) => total + Math.max(booking.pax, 0), 0);
    const zoneCapacity = input.zoneCapacities[zoneId];
    const remainingPax = Math.max(zoneCapacity - bookedPaxExcludingBooking, 0);

    return {
      bookedPaxExcludingBooking,
      eligible: bookedPaxExcludingBooking + input.bookingPax <= zoneCapacity,
      remainingPax,
      zoneCapacity,
      zoneId,
    } satisfies CorporateZoneAvailability;
  });
}

function compareNumberArrays(left: number[], right: number[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }

  return left.length - right.length;
}

export function findTemporaryCapacityMix(
  requiredSeats: number,
  allowedCapacities: number[],
): TemporaryCapacityMix | null {
  if (requiredSeats <= 0) {
    return { capacities: [], totalCapacity: 0, unusedSeats: 0 };
  }

  const capacities = Array.from(
    new Set(
      allowedCapacities
        .map((capacity) => Math.trunc(capacity))
        .filter((capacity) => capacity > 0),
    ),
  ).sort((left, right) => right - left);

  if (capacities.length === 0) return null;

  const maximum = capacities[0];
  const limit = requiredSeats + maximum - 1;
  const best = new Map<number, number[]>([[0, []]]);

  for (let total = 0; total <= limit; total += 1) {
    const current = best.get(total);
    if (!current) continue;

    for (const capacity of capacities) {
      const nextTotal = total + capacity;
      if (nextTotal > limit) continue;

      const next = [...current, capacity].sort((left, right) => right - left);
      const existing = best.get(nextTotal);
      if (
        !existing ||
        next.length < existing.length ||
        (next.length === existing.length && compareNumberArrays(next, existing) < 0)
      ) {
        best.set(nextTotal, next);
      }
    }
  }

  for (let total = requiredSeats; total <= limit; total += 1) {
    const result = best.get(total);
    if (result) {
      return {
        capacities: result,
        totalCapacity: total,
        unusedSeats: total - requiredSeats,
      };
    }
  }

  return null;
}

function findExistingSingleTable(
  requiredSeats: number,
  tables: FloorPlanningTable[],
) {
  return tables
    .filter(
      (table) =>
        table.capacity >= requiredSeats &&
        Math.max(table.minimumOccupancy ?? 1, 1) <= requiredSeats,
    )
    .sort(
      (left, right) =>
        left.capacity - right.capacity ||
        left.tableCode.localeCompare(right.tableCode, "en", { numeric: true }),
    )[0];
}

function countCapacities(capacities: number[]) {
  const counts = new Map<number, number>();
  capacities.forEach((capacity) =>
    counts.set(capacity, (counts.get(capacity) ?? 0) + 1),
  );
  return [...counts.entries()]
    .map(([capacity, count]) => ({ capacity, count }))
    .sort((left, right) => right.capacity - left.capacity);
}

export function buildZoneFloorCapacityPlan(input: {
  activeEntitlementPax: number;
  allowedTemporaryCapacities: number[];
  availableTables: FloorPlanningTable[];
  capacityRequiredPhysicalTables: number;
  claimedReservedCapacity: number;
  queuedBookings: FloorPlanningBooking[];
  zoneCapacity: number;
  zoneId: CorporateFloorZone;
}): ZoneFloorCapacityPlan {
  const allowedTemporaryCapacities = Array.from(
    new Set(input.allowedTemporaryCapacities.filter((capacity) => capacity > 0)),
  ).sort((left, right) => left - right);
  let availableTables = input.availableTables
    .filter((table) => table.capacity > 0)
    .sort(
      (left, right) =>
        left.capacity - right.capacity ||
        left.tableCode.localeCompare(right.tableCode, "en", { numeric: true }),
    );
  const currentAssignableSeats = availableTables.reduce(
    (total, table) => total + table.capacity,
    0,
  );
  const bookingPlans: FloorBookingPlan[] = [];
  const plannedCapacities: number[] = [];
  let rawOperationalShortfall = 0;

  const orderedBookings = [...input.queuedBookings].sort(
    (left, right) =>
      Number(left.isCorporate) - Number(right.isCorporate) ||
      right.pax - left.pax ||
      left.reference.localeCompare(right.reference),
  );

  for (const booking of orderedBookings) {
    const existingTable = findExistingSingleTable(
      booking.pax,
      availableTables,
    );
    if (existingTable) {
      availableTables = availableTables.filter(
        (table) => table.id !== existingTable.id,
      );
      bookingPlans.push({
        bookingReference: booking.reference,
        existingTableCodes: [existingTable.tableCode],
        existingTableIds: [existingTable.id],
        isCorporate: booking.isCorporate,
        newCapacities: [],
        pax: booking.pax,
        unresolvedReason: null,
      });
      continue;
    }

    rawOperationalShortfall += booking.pax;
    const temporaryCapacity = allowedTemporaryCapacities.find(
      (capacity) => capacity >= booking.pax,
    );

    if (!temporaryCapacity) {
      bookingPlans.push({
        bookingReference: booking.reference,
        existingTableCodes: [],
        existingTableIds: [],
        isCorporate: booking.isCorporate,
        newCapacities: [],
        pax: booking.pax,
        unresolvedReason:
          "No single available operational table can seat the complete booking. Manual Box Office resolution is required.",
      });
      continue;
    }

    plannedCapacities.push(temporaryCapacity);
    bookingPlans.push({
      bookingReference: booking.reference,
      existingTableCodes: [],
      existingTableIds: [],
      isCorporate: booking.isCorporate,
      newCapacities: [temporaryCapacity],
      pax: booking.pax,
      unresolvedReason: `No existing single table fits. Create one reviewed ${temporaryCapacity}-seat temporary table and assign it manually.`,
    });
  }

  const newCapacity = plannedCapacities.reduce(
    (total, capacity) => total + capacity,
    0,
  );
  const zoneCapacityInsufficient =
    input.activeEntitlementPax > input.zoneCapacity + newCapacity;

  return {
    activeEntitlementPax: input.activeEntitlementPax,
    allowedTemporaryCapacities,
    bookingPlans,
    capacityRequiredPhysicalTables: input.capacityRequiredPhysicalTables,
    claimedReservedCapacity: input.claimedReservedCapacity,
    currentAssignableSeats,
    netAssignableCapacity: currentAssignableSeats,
    newCapacity,
    operationalShortfall: rawOperationalShortfall,
    queuedBookings: input.queuedBookings.length,
    queuedPax: input.queuedBookings.reduce(
      (total, booking) => total + booking.pax,
      0,
    ),
    suggestedTables: countCapacities(plannedCapacities),
    unusedSeats: Math.max(newCapacity - rawOperationalShortfall, 0),
    zoneCapacity: input.zoneCapacity,
    zoneCapacityInsufficient,
    zoneId: input.zoneId,
  };
}

export function getCorporateTableReleasePreview(input: {
  bookingPax: number;
  releaseTableId: string;
  tableClaims: Array<{
    capacity: number;
    tableCode: string;
    tableId?: string;
  }>;
}) {
  const releasedClaim = input.tableClaims.find(
    (claim) => claim.tableId === input.releaseTableId,
  );
  if (!releasedClaim) return null;

  const remainingClaims = input.tableClaims.filter(
    (claim) => claim.tableId !== input.releaseTableId,
  );
  const remainingCapacity = remainingClaims.reduce(
    (total, claim) => total + Math.max(Number(claim.capacity) || 0, 0),
    0,
  );

  return {
    releaseMode:
      remainingClaims.length > 0 && remainingCapacity >= input.bookingPax
        ? ("single" as const)
        : ("complete-fallback" as const),
    releasedTableCode: releasedClaim.tableCode,
    remainingCapacity,
    remainingTableCount: remainingClaims.length,
  };
}
