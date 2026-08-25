import {
  defaultTables,
  isValidSeatingZoneId,
  type SeatingZoneId,
} from "@/lib/zingaraDemo";

export type VenueTableTemplate = {
  base_status: "available" | "booked" | "disabled";
  capacity: number | null;
  id: string;
  is_physical?: boolean;
  notes: string | null;
  section: string;
  table_code: string;
};

export type BaseShowTableInsert = {
  capacity: number | null;
  capacity_configured: boolean;
  is_physical: boolean;
  merged_from: string[];
  override_notes: string | null;
  section: string;
  show_id: string;
  status: "available" | "disabled";
  table_code: string;
  venue_table_id?: string;
};

const sectionAliases: Record<string, SeatingZoneId> = {
  "elevated stage": "elevated-stage",
  "golden circle": "golden-circle",
  "middle ring": "middle-ring",
  "private booth": "royal-booths",
  "private booths": "royal-booths",
  "royal balcony": "royal-balcony",
  "royal booths": "royal-booths",
};

function normalizeSection(section: string) {
  const normalized = section.trim().toLowerCase();

  return isValidSeatingZoneId(normalized)
    ? normalized
    : sectionAliases[normalized] ?? normalized;
}

function getTableKey(section: string, tableCode: string) {
  return `${normalizeSection(section)}:${tableCode.trim().toLowerCase()}`;
}

export function createBaseShowTableInserts(
  showId: string,
  venueTables: VenueTableTemplate[],
): BaseShowTableInsert[] {
  if (venueTables.length > 0) {
    return venueTables.map((table) => ({
      capacity: table.capacity,
      capacity_configured: table.capacity !== null,
      is_physical: table.is_physical === true,
      merged_from: [],
      override_notes: table.notes,
      section: normalizeSection(table.section),
      show_id: showId,
      status:
        table.capacity === null || table.base_status === "disabled"
          ? ("disabled" as const)
          : ("available" as const),
      table_code: table.table_code,
      venue_table_id: table.id,
    }));
  }

  const venueTablesByKey = new Map(
    venueTables.map((table) => [
      getTableKey(table.section, table.table_code),
      table,
    ]),
  );
  const baseRows = defaultTables.map((table) => {
    const venueTable = venueTablesByKey.get(
      getTableKey(table.zoneId, table.tableNumber),
    );

    if (venueTable) {
      venueTablesByKey.delete(
        getTableKey(table.zoneId, table.tableNumber),
      );
    }

    return {
      capacity: venueTable?.capacity ?? table.seatCapacity,
      capacity_configured: true,
      is_physical: false,
      merged_from: [],
      override_notes: venueTable?.notes ?? table.guestNotes ?? null,
      section: venueTable
        ? normalizeSection(venueTable.section)
        : table.zoneId,
      show_id: showId,
      status:
        (venueTable?.base_status ?? table.status) === "disabled"
          ? ("disabled" as const)
          : ("available" as const),
      table_code: venueTable?.table_code ?? table.tableNumber,
      ...(venueTable ? { venue_table_id: venueTable.id } : {}),
    };
  });
  const additionalRows = [...venueTablesByKey.values()].map((table) => ({
    capacity: table.capacity,
    capacity_configured: table.capacity !== null,
    is_physical: table.is_physical === true,
    merged_from: [],
    override_notes: table.notes,
    section: normalizeSection(table.section),
    show_id: showId,
    status:
      table.base_status === "disabled"
        ? ("disabled" as const)
        : ("available" as const),
    table_code: table.table_code,
    venue_table_id: table.id,
  }));

  return [...baseRows, ...additionalRows];
}
