import type {
  DemoBooking,
  DemoTable,
  SeatingZoneId,
} from "./zingaraDemo.ts";

const hiddenOperationalMetadata = [
  /^booking import from dineplan\b/i,
  /^final dineplan source\b/i,
  /^floor assignment required\b/i,
  /^guest match\b/i,
  /^imported from dineplan\b/i,
  /^legacy dineplan ref\b/i,
  /^legacy import\b/i,
  /^legacy source table\b/i,
  /^legacy total balance\b/i,
  /^source fingerprint\b/i,
];

const zoneLabels: Partial<Record<SeatingZoneId, string>> = {
  "golden-circle": "Golden Circle",
  "middle-ring": "Middle Ring",
  "royal-balcony": "Royal Balcony",
  "royal-booths": "Private Booths",
};

function isActiveBooking(booking: DemoBooking) {
  return (
    !booking.archivedAt &&
    !["cancelled", "refunded", "completed", "no-show", "waitlisted"].includes(
      booking.status ?? "confirmed",
    )
  );
}

function compareTableNumbers(left: string, right: string) {
  return left.localeCompare(right, "en", { numeric: true });
}

function getZoneLabel(zoneId: SeatingZoneId, fallback?: string) {
  return zoneLabels[zoneId] ?? fallback ?? zoneId;
}

export function sanitizeOperationalReportNotes(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("_x000D_", "\n")
    .split(/\s*\|\s*|\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(
      (part) => !hiddenOperationalMetadata.some((pattern) => pattern.test(part)),
    )
    .filter((part, index, values) => values.indexOf(part) === index)
    .join(" | ");
}

export type BookingGrainReportRow = {
  booking: DemoBooking;
  notes: string;
  tableNumbers: string[];
  tableSummary: string;
  zoneSummary: string;
};

export type OperationalTableReportRow = {
  allocatedPax: number;
  booking?: DemoBooking;
  bookingPax: number;
  capacity: number;
  capacityConfigured: boolean;
  notes: string;
  parentTableNumber?: string;
  state: "available" | "blocked" | "checked-in" | "reserved";
  table: DemoTable;
  tableNumber: string;
  temporary: boolean;
  zoneId: SeatingZoneId;
  zoneTitle: string;
};

function getClaimedTableIds(booking: DemoBooking) {
  const claimIds = (booking.reservationTableClaims ?? [])
    .map((claim) => claim.tableId)
    .filter((tableId): tableId is string => Boolean(tableId));

  if (claimIds.length > 0) {
    return Array.from(new Set(claimIds));
  }

  return booking.tableId && booking.tableId !== "requires-floor-assignment"
    ? [booking.tableId]
    : [];
}

function getExpandedClaimTables(booking: DemoBooking, tablesById: Map<string, DemoTable>) {
  return getClaimedTableIds(booking)
    .flatMap((tableId) => {
      const table = tablesById.get(tableId);

      if (!table) return [];
      if (!table.mergedFrom?.length) return [table];

      const members = table.mergedFrom
        .map((memberId) => tablesById.get(memberId))
        .filter((member): member is DemoTable => Boolean(member));

      return members.length === table.mergedFrom.length ? members : [table];
    })
    .filter(
      (table, index, values) =>
        values.findIndex((candidate) => candidate.id === table.id) === index,
    )
    .sort((left, right) => compareTableNumbers(left.tableNumber, right.tableNumber));
}

function getZonePax(booking: DemoBooking, zoneId: SeatingZoneId) {
  const entitlements = booking.zoneEntitlements ?? [];
  const matchingEntitlement = entitlements.find(
    (entitlement) => entitlement.zoneId === zoneId,
  );

  if (matchingEntitlement) return Math.max(matchingEntitlement.pax, 0);
  return entitlements.length === 0 && booking.zoneId === zoneId
    ? Math.max(booking.partySize, 0)
    : 0;
}

export function buildBookingGrainReportRows(
  bookings: DemoBooking[],
  tables: DemoTable[],
) {
  const tablesById = new Map(tables.map((table) => [table.id, table]));

  return bookings.map((booking) => {
    const assignedTables = getExpandedClaimTables(booking, tablesById);
    const tableNumbers = assignedTables.map((table) => table.tableNumber);
    const zoneSummary = (booking.zoneEntitlements ?? []).length
      ? (booking.zoneEntitlements ?? [])
          .filter((entitlement) => entitlement.pax > 0)
          .map(
            (entitlement) =>
              `${getZoneLabel(entitlement.zoneId)} (${entitlement.pax})`,
          )
          .join(", ")
      : booking.zoneTitle;

    return {
      booking,
      notes: sanitizeOperationalReportNotes(booking.operationalNotes),
      tableNumbers,
      tableSummary:
        tableNumbers.join(", ") || "Requires floor assignment",
      zoneSummary,
    } satisfies BookingGrainReportRow;
  });
}

export function buildOperationalTableReportRows(
  bookings: DemoBooking[],
  tables: DemoTable[],
) {
  const activeBookings = bookings.filter(isActiveBooking);
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  const bookingByClaimId = new Map<string, DemoBooking>();
  const allocatedPaxByBookingAndTable = new Map<string, number>();

  for (const booking of activeBookings) {
    for (const claimId of getClaimedTableIds(booking)) {
      bookingByClaimId.set(claimId, booking);
    }

    const remainingByZone = new Map<SeatingZoneId, number>();
    for (const table of getExpandedClaimTables(booking, tablesById)) {
      const remaining = remainingByZone.has(table.zoneId)
        ? remainingByZone.get(table.zoneId) ?? 0
        : getZonePax(booking, table.zoneId);
      const allocatedPax = Math.min(
        remaining,
        Math.max(table.seatCapacity, 0),
      );

      allocatedPaxByBookingAndTable.set(
        `${booking.reference}:${table.id}`,
        allocatedPax,
      );
      remainingByZone.set(table.zoneId, Math.max(remaining - allocatedPax, 0));
    }
  }

  const rows: OperationalTableReportRow[] = [];
  const emittedTableIds = new Set<string>();

  for (const table of tables
    .filter((candidate) => !candidate.mergedInto)
    .sort((left, right) => compareTableNumbers(left.tableNumber, right.tableNumber))) {
    const booking = bookingByClaimId.get(table.id);
    const operationalTables =
      booking && table.mergedFrom?.length
        ? table.mergedFrom
            .map((memberId) => tablesById.get(memberId))
            .filter((member): member is DemoTable => Boolean(member))
            .sort((left, right) =>
              compareTableNumbers(left.tableNumber, right.tableNumber),
            )
        : [table];
    const completeOperationalTables =
      operationalTables.length === table.mergedFrom?.length
        ? operationalTables
        : [table];
    for (const operationalTable of completeOperationalTables) {
      if (emittedTableIds.has(operationalTable.id)) continue;
      emittedTableIds.add(operationalTable.id);

      const zoneId = operationalTable.zoneId;
      const capacity = Math.max(operationalTable.seatCapacity, 0);
      const allocatedPax = booking
        ? allocatedPaxByBookingAndTable.get(
            `${booking.reference}:${operationalTable.id}`,
          ) ?? 0
        : 0;

      rows.push({
        allocatedPax,
        booking,
        bookingPax: booking?.partySize ?? 0,
        capacity,
        capacityConfigured: operationalTable.capacityConfigured !== false,
        notes: sanitizeOperationalReportNotes(
          booking?.operationalNotes || operationalTable.guestNotes,
        ),
        parentTableNumber:
          operationalTable.id === table.id ? undefined : table.tableNumber,
        state:
          operationalTable.status === "disabled" && !booking
            ? "blocked"
            : booking?.status === "checked-in"
              ? "checked-in"
              : booking
                ? "reserved"
                : "available",
        table: operationalTable,
        tableNumber: operationalTable.tableNumber,
        temporary: operationalTable.physicalTable !== true,
        zoneId,
        zoneTitle: getZoneLabel(zoneId),
      });
    }
  }

  return rows.sort(
    (left, right) =>
      left.zoneTitle.localeCompare(right.zoneTitle) ||
      compareTableNumbers(left.tableNumber, right.tableNumber),
  );
}

export function buildCustomerGrainReportRows(
  bookingRows: BookingGrainReportRow[],
  getBookingTotal: (booking: DemoBooking) => number,
) {
  const customers = new Map<
    string,
    {
      bookingCount: number;
      customer: DemoBooking["customer"];
      favouriteZones: Map<string, number>;
      notes: string[];
      totalSpend: number;
    }
  >();

  for (const row of bookingRows) {
    const booking = row.booking;
    const key = booking.customerId
      ? `customer:${booking.customerId}`
      : `snapshot:${booking.customer.email || booking.customer.phone || booking.customer.name}`.toLowerCase();
    const current = customers.get(key) ?? {
      bookingCount: 0,
      customer: booking.customer,
      favouriteZones: new Map<string, number>(),
      notes: [],
      totalSpend: 0,
    };

    current.bookingCount += 1;
    current.totalSpend += getBookingTotal(booking);
    current.favouriteZones.set(
      row.zoneSummary,
      (current.favouriteZones.get(row.zoneSummary) ?? 0) + 1,
    );
    if (row.notes && !current.notes.includes(row.notes)) current.notes.push(row.notes);
    customers.set(key, current);
  }

  return [...customers.values()].map((customer) => ({
    bookings: customer.bookingCount,
    customer: customer.customer.name,
    email: customer.customer.email,
    favouriteZone:
      [...customer.favouriteZones.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0]?.[0] ?? "",
    notes: customer.notes.join(" | "),
    phone: customer.customer.phone,
    totalSpend: customer.totalSpend,
  }));
}
