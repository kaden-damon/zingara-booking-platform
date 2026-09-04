import {
  type DemoTable,
  isValidMergedOperationalTable,
} from "./zingaraDemo";
import { isLegacyPlaceholderTableCode } from "./physicalTables";

export function isLegacyFloorPlaceholder(table: DemoTable) {
  return (
    table.physicalTable !== true &&
    table.availabilityScope !== "operational" &&
    isLegacyPlaceholderTableCode(table.zoneId, table.tableNumber)
  );
}

export function isFloorInventoryTable(table: DemoTable) {
  return table.physicalTable === true || !isLegacyFloorPlaceholder(table);
}

export function getFloorInventoryStats(tables: DemoTable[]) {
  const inventoryTables = tables.filter(isFloorInventoryTable);
  const physicalTables = inventoryTables.filter(
    (table) => table.physicalTable === true,
  );
  const temporaryTables = inventoryTables.filter(
    (table) =>
      table.physicalTable !== true &&
      table.availabilityScope === "operational" &&
      !table.mergedFrom?.length,
  );
  const mergedTables = inventoryTables.filter((table) =>
    isValidMergedOperationalTable(table, inventoryTables),
  );
  const operationalUnits = [
    ...physicalTables.filter(
      (table) =>
        table.capacityConfigured !== false &&
        table.status !== "disabled" &&
        !table.mergedInto,
    ),
    ...temporaryTables.filter(
      (table) =>
        table.capacityConfigured !== false &&
        table.status !== "disabled" &&
        !table.mergedInto,
    ),
    ...mergedTables.filter(
      (table) => table.status !== "disabled" && !table.mergedInto,
    ),
  ];
  const assignableUnits = operationalUnits.filter(
    (table) => table.status === "available" && !table.bookingReference,
  );

  return {
    assignableTableCapacity: assignableUnits.reduce(
      (total, table) => total + table.seatCapacity,
      0,
    ),
    assignableTableCount: assignableUnits.length,
    configuredPhysicalTableCount: physicalTables.filter(
      (table) => table.capacityConfigured !== false,
    ).length,
    mergedOperationalTableCount: mergedTables.length,
    operationalTableCapacity: operationalUnits.reduce(
      (total, table) => total + table.seatCapacity,
      0,
    ),
    operationalUnitCount: operationalUnits.length,
    physicalTableCount: physicalTables.length,
    temporaryOperationalTableCount: temporaryTables.length,
    unconfiguredPhysicalTableCount: physicalTables.filter(
      (table) => table.capacityConfigured === false,
    ).length,
  };
}
