import {
  isValidMergedOperationalTable,
  type DemoBooking,
  type DemoTable,
  type SeatingZoneId,
} from "./zingaraDemo";

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
  return isValidMergedOperationalTable(table, tables);
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

export function getManualBookingMoveZoneCapacity(input: {
  bookingPax: number;
  currentBookingPaxInTargetZone: number;
  currentShowPaxInTargetZone: number;
  targetZoneCapacity: number;
  targetZoneIsCurrentZone: boolean;
}) {
  const currentBookingPaxInTargetZone = Math.max(
    Math.trunc(input.currentBookingPaxInTargetZone),
    0,
  );
  const currentShowPaxInTargetZone = Math.max(
    Math.trunc(input.currentShowPaxInTargetZone),
    0,
  );
  const nextBookingPaxInTargetZone = input.targetZoneIsCurrentZone
    ? currentBookingPaxInTargetZone
    : Math.max(Math.trunc(input.bookingPax), 0);
  const bookedPaxExcludingBooking = Math.max(
    currentShowPaxInTargetZone - currentBookingPaxInTargetZone,
    0,
  );
  const resultingPax = bookedPaxExcludingBooking + nextBookingPaxInTargetZone;

  return {
    availablePax: Math.max(
      Math.trunc(input.targetZoneCapacity) - bookedPaxExcludingBooking,
      0,
    ),
    eligible: resultingPax <= input.targetZoneCapacity,
    resultingPax,
  };
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
  guestCount: number;
  showLabel: string;
  targetTable: string;
  targetZone: string;
}) {
  return [
    `MOVE ${input.bookingName || "THIS BOOKING"}?`.toUpperCase(),
    "",
    `${input.guestCount} guests`,
    "",
    "Current:",
    `${input.currentZone} \u00b7 ${input.currentTable}`,
    "",
    "New:",
    `${input.targetZone} \u00b7 Table ${input.targetTable}`,
    "",
    "Show:",
    input.showLabel,
    "",
    "Financials:",
    "No change",
  ].join("\n");
}
