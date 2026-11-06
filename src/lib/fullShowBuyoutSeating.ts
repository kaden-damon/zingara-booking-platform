import type { DemoTable, SeatingZoneId } from "./zingaraDemo.ts";

export function getFullShowBuyoutZoneTables(input: {
  bookingReference: string;
  showId: string;
  tables: DemoTable[];
  zoneId: SeatingZoneId;
}) {
  return input.tables
    .filter(
      (table) =>
        table.showId === input.showId &&
        table.zoneId === input.zoneId &&
        (table.physicalTable === true || table.availabilityScope === "operational") &&
        table.capacityConfigured !== false &&
        !table.mergedInto &&
        Boolean(table.authoritativeId) &&
        ((table.status === "available" && !table.bookingReference) ||
          table.bookingReference === input.bookingReference),
    )
    .sort((left, right) =>
      left.tableNumber.localeCompare(right.tableNumber, "en", { numeric: true }),
    );
}

export function getSelectedTableCapacity(
  tables: DemoTable[],
  selectedTableIds: string[],
) {
  const selected = new Set(selectedTableIds);
  return tables.reduce(
    (total, table) =>
      selected.has(table.authoritativeId ?? table.id)
        ? total + Math.max(table.seatCapacity, 0)
        : total,
    0,
  );
}
