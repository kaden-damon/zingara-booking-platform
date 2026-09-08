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

function findExistingTableMix(
  requiredSeats: number,
  tables: FloorPlanningTable[],
) {
  const states = new Map<number, FloorPlanningTable[]>([[0, []]]);
  const maximumCapacity = Math.max(
    requiredSeats + Math.max(...tables.map((table) => table.capacity), 0),
    requiredSeats,
  );

  for (const table of tables) {
    for (const [total, selected] of [...states.entries()].sort(
      ([left], [right]) => right - left,
    )) {
      const nextTotal = total + table.capacity;
      if (nextTotal > maximumCapacity) continue;

      const next = [...selected, table];
      const existing = states.get(nextTotal);
      if (!existing || next.length < existing.length) {
        states.set(nextTotal, next);
      }
    }
  }

  return [...states.entries()]
    .filter(([total]) => total >= requiredSeats)
    .sort(
      ([leftTotal, leftTables], [rightTotal, rightTables]) =>
        leftTotal - rightTotal ||
        leftTables.length - rightTables.length ||
        leftTables
          .map((table) => table.tableCode)
          .join("+")
          .localeCompare(
            rightTables.map((table) => table.tableCode).join("+"),
            "en",
            { numeric: true },
          ),
    )[0]?.[1];
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
    .filter(
      (table) =>
        table.capacity > 0 &&
        (table.kind !== "temporary" ||
          allowedTemporaryCapacities.includes(table.capacity)),
    )
    .sort(
      (left, right) =>
        left.capacity - right.capacity ||
        left.tableCode.localeCompare(right.tableCode, "en", { numeric: true }),
    );
  const currentAssignableSeats = availableTables.reduce(
    (total, table) => total + table.capacity,
    0,
  );
  const zoneCapacityInsufficient = input.activeEntitlementPax > input.zoneCapacity;
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
    if (zoneCapacityInsufficient) {
      bookingPlans.push({
        bookingReference: booking.reference,
        existingTableCodes: [],
        isCorporate: booking.isCorporate,
        newCapacities: [],
        pax: booking.pax,
        unresolvedReason: "Zone capacity is insufficient for its active booking entitlement.",
      });
      continue;
    }

    if (!booking.isCorporate) {
      const existingIndex = availableTables.findIndex(
        (table) => table.capacity >= booking.pax,
      );
      if (existingIndex >= 0) {
        const [table] = availableTables.splice(existingIndex, 1);
        bookingPlans.push({
          bookingReference: booking.reference,
          existingTableCodes: [table.tableCode],
          isCorporate: false,
          newCapacities: [],
          pax: booking.pax,
          unresolvedReason: null,
        });
        continue;
      }

      const capacity = allowedTemporaryCapacities.find(
        (candidate) => candidate >= booking.pax,
      );
      rawOperationalShortfall += booking.pax;
      if (!capacity) {
        bookingPlans.push({
          bookingReference: booking.reference,
          existingTableCodes: [],
          isCorporate: false,
          newCapacities: [],
          pax: booking.pax,
          unresolvedReason:
            "No approved single temporary-table capacity can serve this Standard booking.",
        });
        continue;
      }

      plannedCapacities.push(capacity);
      bookingPlans.push({
        bookingReference: booking.reference,
        existingTableCodes: [],
        isCorporate: false,
        newCapacities: [capacity],
        pax: booking.pax,
        unresolvedReason: null,
      });
      continue;
    }

    const existingMix = findExistingTableMix(booking.pax, availableTables);
    if (existingMix) {
      const selected = new Set(existingMix.map((table) => table.id));
      availableTables = availableTables.filter((table) => !selected.has(table.id));
      bookingPlans.push({
        bookingReference: booking.reference,
        existingTableCodes: existingMix.map((table) => table.tableCode),
        isCorporate: true,
        newCapacities: [],
        pax: booking.pax,
        unresolvedReason: null,
      });
      continue;
    }

    const existingCapacity = availableTables.reduce(
      (total, table) => total + table.capacity,
      0,
    );
    const existingTableCodes = availableTables.map((table) => table.tableCode);
    availableTables = [];
    const requiredSeats = Math.max(booking.pax - existingCapacity, 0);
    rawOperationalShortfall += requiredSeats;
    const temporaryMix = findTemporaryCapacityMix(
      requiredSeats,
      allowedTemporaryCapacities,
    );

    if (!temporaryMix) {
      bookingPlans.push({
        bookingReference: booking.reference,
        existingTableCodes,
        isCorporate: true,
        newCapacities: [],
        pax: booking.pax,
        unresolvedReason: "No approved temporary-table capacity mix can satisfy the shortfall.",
      });
      continue;
    }

    plannedCapacities.push(...temporaryMix.capacities);
    bookingPlans.push({
      bookingReference: booking.reference,
      existingTableCodes,
      isCorporate: true,
      newCapacities: temporaryMix.capacities,
      pax: booking.pax,
      unresolvedReason: null,
    });
  }

  const newCapacity = plannedCapacities.reduce(
    (total, capacity) => total + capacity,
    0,
  );

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
