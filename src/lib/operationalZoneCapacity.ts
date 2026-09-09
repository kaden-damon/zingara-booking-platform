import type { SeatingZoneId } from "./zingaraDemo";

export type OperationalCapacityTable = {
  availabilityScope?: string | null;
  capacityConfigured?: boolean;
  mergedFrom?: string[] | null;
  mergedInto?: string | null;
  physicalTable?: boolean;
  seatCapacity?: number | null;
  showId?: string;
  status?: string | null;
  zoneId: SeatingZoneId;
};

export function isAdditionalTemporaryOperationalCapacity(
  table: OperationalCapacityTable,
) {
  return (
    table.physicalTable !== true &&
    table.availabilityScope === "operational" &&
    !table.mergedInto &&
    !(table.mergedFrom?.length ?? 0) &&
    table.status !== "disabled" &&
    table.capacityConfigured !== false &&
    Number.isFinite(Number(table.seatCapacity)) &&
    Number(table.seatCapacity) > 0
  );
}

export function getTemporaryOperationalCapacity(
  tables: OperationalCapacityTable[],
  showId: string,
  zoneId: SeatingZoneId,
) {
  return tables
    .filter(
      (table) =>
        table.showId === showId &&
        table.zoneId === zoneId &&
        isAdditionalTemporaryOperationalCapacity(table),
    )
    .reduce(
      (total, table) => total + Math.max(Math.trunc(Number(table.seatCapacity)), 0),
      0,
    );
}

export function getEffectiveOperationalZoneCapacity(input: {
  baseCapacity: number;
  showId: string;
  tables: OperationalCapacityTable[];
  zoneId: SeatingZoneId;
}) {
  const baseCapacity = Math.max(Math.trunc(input.baseCapacity), 0);
  const temporaryCapacity = getTemporaryOperationalCapacity(
    input.tables,
    input.showId,
    input.zoneId,
  );

  return {
    baseCapacity,
    effectiveCapacity: baseCapacity + temporaryCapacity,
    temporaryCapacity,
  };
}
