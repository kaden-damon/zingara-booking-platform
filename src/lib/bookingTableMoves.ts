import type { DemoBooking, DemoTable, SeatingZoneId } from "./zingaraDemo";

const manualMoveZoneOrder: SeatingZoneId[] = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
];

export function isValidMergedOperationalParent(
  table: DemoTable,
  tables: DemoTable[],
) {
  const memberIds = table.mergedFrom ?? [];

  if (
    table.physicalTable === true ||
    table.availabilityScope !== "operational" ||
    !table.authoritativeId ||
    table.capacityConfigured === false ||
    table.mergedInto ||
    memberIds.length < 2 ||
    new Set(memberIds).size !== memberIds.length
  ) {
    return false;
  }

  const members = memberIds.map((memberId) =>
    tables.find((candidate) => candidate.id === memberId),
  );

  return (
    members.every(
      (member) =>
        Boolean(member?.authoritativeId) &&
        member?.showId === table.showId &&
        member?.zoneId === table.zoneId &&
        member?.physicalTable === true &&
        member?.capacityConfigured !== false &&
        member?.status === "disabled" &&
        member?.mergedInto === table.id &&
        !member?.mergedFrom?.length &&
        !member?.bookingReference,
    ) &&
    members.reduce(
      (total, member) => total + (member?.seatCapacity ?? 0),
      0,
    ) === table.seatCapacity
  );
}

export function isTemporaryOperationalTable(table: DemoTable) {
  return (
    table.physicalTable !== true &&
    table.availabilityScope === "operational" &&
    !table.mergedFrom?.length &&
    !table.mergedInto
  );
}

export function isEligibleManualBookingMoveTarget(
  table: DemoTable,
  booking: DemoBooking,
  tables: DemoTable[],
) {
  const isAssignableTable =
    (table.physicalTable === true && !table.mergedFrom?.length) ||
    isTemporaryOperationalTable(table) ||
    isValidMergedOperationalParent(table, tables);

  return (
    table.id !== booking.tableId &&
    table.showId === booking.showId &&
    isAssignableTable &&
    Boolean(table.authoritativeId) &&
    table.capacityConfigured !== false &&
    table.seatCapacity >= booking.partySize &&
    table.status === "available" &&
    !table.bookingReference &&
    !table.mergedInto
  );
}

export function groupManualBookingMoveTargets(tables: DemoTable[]) {
  return manualMoveZoneOrder
    .map((zoneId) => ({
      tables: tables
        .filter((table) => table.zoneId === zoneId)
        .sort(
          (left, right) =>
            left.seatCapacity - right.seatCapacity ||
            left.tableNumber.localeCompare(right.tableNumber, undefined, {
              numeric: true,
            }),
        ),
      zoneId,
    }))
    .filter((group) => group.tables.length > 0);
}

export function getManualBookingMoveTargetKind(table: DemoTable) {
  if (table.mergedFrom?.length) {
    return "Merged";
  }

  if (isTemporaryOperationalTable(table)) {
    return "Temporary";
  }

  return "Physical";
}

export function buildCrossZoneMoveConfirmation(input: {
  bookingName: string;
  currentTable: string;
  currentZone: string;
  targetTable: string;
  targetZone: string;
}) {
  return [
    "CHANGE SEATING ZONE",
    "",
    `${input.bookingName || "This booking"} will move:`,
    "",
    input.currentZone,
    `\u2192 ${input.targetZone}`,
    "",
    "Table:",
    input.currentTable,
    `\u2192 ${input.targetTable}`,
    "",
    "This changes the guest's seating section.",
  ].join("\n");
}
