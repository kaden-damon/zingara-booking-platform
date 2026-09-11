import {
  type DemoTable,
} from "./zingaraDemo";
import { isLegacyPlaceholderTableCode } from "./physicalTables";
import {
  classifyCapacityTable,
  type CapacityTable,
} from "./capacityModel.ts";

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
  const capacityTables = inventoryTables.map((table) => ({
    ...table,
    bookingReference: table.bookingReference,
    id: table.id,
    isOverride: table.physicalTable !== true,
  })) satisfies CapacityTable[];
  const tablesById = new Map(capacityTables.map((table) => [table.id, table]));
  const represented = capacityTables.map((table) => ({
    representation: classifyCapacityTable(table, tablesById),
    table,
  }));
  const physicalTables = inventoryTables.filter((table) => table.physicalTable === true);
  const temporaryTables = represented
    .filter((row) => row.representation === "temporary")
    .map((row) => row.table);
  const mergedTables = represented
    .filter((row) => row.representation === "merged")
    .map((row) => row.table);
  const operationalUnits = represented
    .filter((row) => ["physical", "temporary", "merged"].includes(row.representation))
    .map((row) => row.table);
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
