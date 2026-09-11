import type { SeatingZoneId } from "./zingaraDemo.ts";

export const activeCapacityBookingStatuses = new Set([
  "new",
  "confirmed",
  "pending",
  "pending-payment",
  "pending_payment",
  "checked-in",
  "checked_in",
]);

export type CapacityBooking = {
  archivedAt?: string | null;
  partySize: number;
  status?: string | null;
  tableClaims?: Array<{ zoneId: SeatingZoneId }>;
  zoneEntitlements?: Array<{ pax: number; zoneId: SeatingZoneId }> | null;
  zoneId: SeatingZoneId;
};

export type CapacityTable = {
  availabilityScope?: string | null;
  bookingReference?: string | null;
  capacityConfigured?: boolean;
  id: string;
  isOverride?: boolean;
  mergedFrom?: string[] | null;
  mergedInto?: string | null;
  physicalTable?: boolean;
  seatCapacity?: number | null;
  showId?: string;
  status?: string | null;
  zoneId: SeatingZoneId;
};

export type CapacityTableRepresentation =
  | "capacity-required"
  | "excluded-disabled"
  | "excluded-legacy"
  | "excluded-linked-child"
  | "merged"
  | "physical"
  | "temporary";

function positiveCapacity(table: CapacityTable) {
  const capacity = Math.trunc(Number(table.seatCapacity) || 0);
  return table.capacityConfigured !== false && capacity > 0 ? capacity : 0;
}

export function isValidCapacityMergedParent(
  table: CapacityTable,
  tablesById: Map<string, CapacityTable>,
) {
  const memberIds = table.mergedFrom ?? [];
  if (
    table.physicalTable === true ||
    table.isOverride !== true ||
    table.availabilityScope !== "operational" ||
    table.mergedInto ||
    memberIds.length < 2 ||
    new Set(memberIds).size !== memberIds.length ||
    table.status === "disabled" ||
    positiveCapacity(table) === 0
  ) {
    return false;
  }

  const members = memberIds
    .map((memberId) => tablesById.get(memberId))
    .filter((member): member is CapacityTable => Boolean(member));

  return (
    members.length === memberIds.length &&
    members.every(
      (member) =>
        member.showId === table.showId &&
        member.zoneId === table.zoneId &&
        member.physicalTable === true &&
        member.status === "disabled" &&
        member.mergedInto === table.id &&
        !(member.mergedFrom?.length ?? 0) &&
        !member.bookingReference &&
        positiveCapacity(member) > 0,
    ) &&
    members.reduce((total, member) => total + positiveCapacity(member), 0) ===
      positiveCapacity(table)
  );
}

export function classifyCapacityTable(
  table: CapacityTable,
  tablesById: Map<string, CapacityTable>,
): CapacityTableRepresentation {
  if (table.physicalTable === true && table.capacityConfigured === false) {
    return "capacity-required";
  }
  if (table.mergedInto) return "excluded-linked-child";
  if (
    table.physicalTable !== true &&
    (table.isOverride !== true || table.availabilityScope !== "operational")
  ) {
    return "excluded-legacy";
  }
  if (table.status === "disabled") return "excluded-disabled";
  if (
    table.physicalTable === true &&
    !(table.mergedFrom?.length ?? 0) &&
    positiveCapacity(table) > 0
  ) {
    return "physical";
  }
  if (isValidCapacityMergedParent(table, tablesById)) return "merged";
  if (
    table.physicalTable !== true &&
    table.isOverride === true &&
    table.availabilityScope === "operational" &&
    !(table.mergedFrom?.length ?? 0) &&
    positiveCapacity(table) > 0
  ) {
    return "temporary";
  }
  return "excluded-legacy";
}

export function getBookingZonePax(
  booking: CapacityBooking,
  zoneId: SeatingZoneId,
) {
  if (booking.zoneEntitlements?.length) {
    return booking.zoneEntitlements
      .filter((entitlement) => entitlement.zoneId === zoneId)
      .reduce(
        (total, entitlement) =>
          total + Math.max(Math.trunc(Number(entitlement.pax) || 0), 0),
        0,
      );
  }

  return booking.zoneId === zoneId
    ? Math.max(Math.trunc(Number(booking.partySize) || 0), 0)
    : 0;
}

export function isActiveCapacityBooking(booking: CapacityBooking) {
  return (
    !booking.archivedAt &&
    activeCapacityBookingStatuses.has(booking.status ?? "confirmed")
  );
}

export function resolveZoneCapacityState(input: {
  baseCapacity: number;
  bookings: CapacityBooking[];
  showId: string;
  tables: CapacityTable[];
  zoneId: SeatingZoneId;
}) {
  const baseCapacity = Math.max(Math.trunc(Number(input.baseCapacity) || 0), 0);
  const zoneTables = input.tables.filter(
    (table) => table.showId === input.showId && table.zoneId === input.zoneId,
  );
  const tablesById = new Map(zoneTables.map((table) => [table.id, table]));
  const represented = zoneTables.map((table) => ({
    capacity: positiveCapacity(table),
    representation: classifyCapacityTable(table, tablesById),
    table,
  }));
  const temporaryCapacity = represented
    .filter((row) => row.representation === "temporary")
    .reduce((total, row) => total + row.capacity, 0);
  const representedPhysicalCapacity = represented
    .filter(
      (row) =>
        row.representation === "physical" || row.representation === "merged",
    )
    .reduce((total, row) => total + row.capacity, 0);
  const operationalUnits = represented.filter((row) =>
    ["physical", "merged", "temporary"].includes(row.representation),
  );
  const effectiveOperationalCapacity = baseCapacity + temporaryCapacity;
  const activeEntitlementPax = input.bookings
    .filter(isActiveCapacityBooking)
    .reduce(
      (total, booking) =>
        total + getBookingZonePax(booking, input.zoneId),
      0,
    );
  const assignedEntitlementPax = input.bookings
    .filter(isActiveCapacityBooking)
    .filter((booking) =>
      booking.tableClaims?.some((claim) => claim.zoneId === input.zoneId),
    )
    .reduce(
      (total, booking) =>
        total + getBookingZonePax(booking, input.zoneId),
      0,
    );
  const reservedTableCapacity = operationalUnits
    .filter(
      (row) => row.table.status === "booked" || row.table.bookingReference,
    )
    .reduce((total, row) => total + row.capacity, 0);
  const assignableCapacity = operationalUnits
    .filter(
      (row) => row.table.status === "available" && !row.table.bookingReference,
    )
    .reduce((total, row) => total + row.capacity, 0);

  return {
    activeEntitlementPax,
    assignedEntitlementPax,
    assignableCapacity,
    baseCapacity,
    baseSellableRemaining: Math.max(baseCapacity - activeEntitlementPax, 0),
    capacityRequiredCount: represented.filter(
      (row) => row.representation === "capacity-required",
    ).length,
    effectiveOperationalCapacity,
    operationalRemaining: Math.max(
      effectiveOperationalCapacity - activeEntitlementPax,
      0,
    ),
    overOperationalCapacity: Math.max(
      activeEntitlementPax - effectiveOperationalCapacity,
      0,
    ),
    representedPhysicalCapacity,
    representationHeadroom: Math.max(
      effectiveOperationalCapacity - representedPhysicalCapacity,
      0,
    ),
    reservedTableCapacity,
    rows: represented,
    temporaryCapacity,
  };
}

export type ZoneCapacityState = ReturnType<typeof resolveZoneCapacityState>;

export function previewPhysicalRepresentationMutation(input: {
  currentTableCapacity?: number;
  nextTableCapacity: number;
  state: Pick<
    ZoneCapacityState,
    "effectiveOperationalCapacity" | "representedPhysicalCapacity"
  >;
}) {
  const currentTableCapacity = Math.max(
    Math.trunc(Number(input.currentTableCapacity) || 0),
    0,
  );
  const nextTableCapacity = Math.max(
    Math.trunc(Number(input.nextTableCapacity) || 0),
    0,
  );
  const projectedPhysicalRepresentation =
    input.state.representedPhysicalCapacity -
    currentTableCapacity +
    nextTableCapacity;

  return {
    allowed:
      projectedPhysicalRepresentation <= input.state.effectiveOperationalCapacity,
    effectiveOperationalCapacity: input.state.effectiveOperationalCapacity,
    projectedPhysicalRepresentation,
    representedPhysicalCapacity: input.state.representedPhysicalCapacity,
  };
}
