import type { SeatingZoneId } from "./zingaraDemo";
import {
  classifyCapacityTable,
  resolveZoneCapacityState,
  type CapacityTable,
} from "./capacityModel.ts";

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
  const mapped = {
    ...table,
    id: "candidate",
    isOverride: table.physicalTable !== true,
  } satisfies CapacityTable;
  return classifyCapacityTable(mapped, new Map([[mapped.id, mapped]])) === "temporary";
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
  const resolved = resolveZoneCapacityState({
    baseCapacity: input.baseCapacity,
    bookings: [],
    showId: input.showId,
    tables: input.tables.map((table, index) => ({
      ...table,
      id: `table-${index}`,
      isOverride: table.physicalTable !== true,
    })),
    zoneId: input.zoneId,
  });

  return {
    baseCapacity: resolved.baseCapacity,
    effectiveCapacity: resolved.effectiveOperationalCapacity,
    temporaryCapacity: resolved.temporaryCapacity,
  };
}

export function canApplyTemporaryCapacityMutation(input: {
  activeEntitlementPax: number;
  currentEffectiveCapacity: number;
  resultingEffectiveCapacity: number;
}) {
  const activeEntitlementPax = Math.max(
    Math.trunc(input.activeEntitlementPax),
    0,
  );
  const currentEffectiveCapacity = Math.max(
    Math.trunc(input.currentEffectiveCapacity),
    0,
  );
  const resultingEffectiveCapacity = Math.max(
    Math.trunc(input.resultingEffectiveCapacity),
    0,
  );

  return (
    resultingEffectiveCapacity >= activeEntitlementPax ||
    resultingEffectiveCapacity > currentEffectiveCapacity
  );
}
