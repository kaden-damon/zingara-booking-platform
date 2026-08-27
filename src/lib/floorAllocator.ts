export const floorAllocatorZones = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] as const;

export type FloorAllocatorZone = (typeof floorAllocatorZones)[number];

export type FloorAllocatorBooking = {
  id: string;
  pax: number;
  reference: string;
  showId: string;
  tableId: string | null;
  updatedAt: string;
  zone: FloorAllocatorZone;
};

export type FloorAllocatorTable = {
  availabilityScope: string;
  bookingId: string | null;
  capacity: number | null;
  capacityConfigured: boolean;
  id: string;
  isOverride: boolean;
  isPhysical: boolean;
  maximumCapacity: number | null;
  mergeable: boolean;
  mergedFrom: string[];
  mergedParentId: string | null;
  minimumCapacity: number | null;
  showId: string;
  status: string;
  tableCode: string;
  updatedAt: string;
  zone: FloorAllocatorZone;
};

export type FloorCapacityProposal = {
  capacity: number;
  expectedUpdatedAt: string;
  tableCode: string;
  tableId: string;
  zone: FloorAllocatorZone;
};

export type FloorMergeProposal = {
  capacity: number;
  id: string;
  memberTableCodes: string[];
  memberTableIds: string[];
  zone: FloorAllocatorZone;
};

export type FloorAllocationProposal = {
  bookingId: string;
  bookingReference: string;
  currentAssignment: string;
  expectedBookingUpdatedAt: string;
  expectedPreviousTableId: string | null;
  pax: number;
  targetCapacity: number;
  targetLabel: string;
  targetMergeId: string | null;
  targetTableId: string | null;
  targetType: "merged" | "physical" | "temporary";
  unusedSeats: number;
  zone: FloorAllocatorZone;
};

export type FloorUnresolvedException = {
  bookingReference: string;
  currentAssignment: string;
  pax: number;
  reason: string;
  zone: FloorAllocatorZone | null;
};

export type InitialFloorPlan = {
  allocations: FloorAllocationProposal[];
  capacityProposals: FloorCapacityProposal[];
  generatedAt: string;
  merges: FloorMergeProposal[];
  preservedBookingIds: string[];
  showId: string;
  snapshot: {
    bookings: Array<{
      id: string;
      tableId: string | null;
      updatedAt: string;
    }>;
    tables: Array<{
      bookingId: string | null;
      capacity: number | null;
      capacityConfigured: boolean;
      id: string;
      status: string;
      updatedAt: string;
    }>;
  };
  snapshotToken: string;
  summary: {
    autoAllocatable: number;
    capacityChanges: number;
    merges: number;
    preservedAllocations: number;
    unresolvedBookings: number;
    unresolvedExceptions: number;
  };
  unresolved: FloorUnresolvedException[];
};

type MutableTable = FloorAllocatorTable & {
  plannedCapacity: number | null;
};

type PlannerInput = {
  bookings: FloorAllocatorBooking[];
  generatedAt?: string;
  showId: string;
  snapshotToken: string;
  tables: FloorAllocatorTable[];
  zoneCeilings: Record<FloorAllocatorZone, number>;
  zoneTableCeilings: Record<FloorAllocatorZone, number>;
};

function isLegacyPlaceholder(
  zone: FloorAllocatorZone,
  tableCode: string,
) {
  if (zone === "golden-circle") {
    return /^GC\d+$/i.test(tableCode);
  }

  if (zone === "middle-ring") {
    return /^MR\d+$/i.test(tableCode);
  }

  if (zone === "royal-booths") {
    return /^B\d+$/i.test(tableCode);
  }

  return /^RB\d+$/i.test(tableCode);
}

function isFlatTemporary(table: FloorAllocatorTable) {
  return (
    !table.isPhysical &&
    table.isOverride &&
    table.availabilityScope === "operational" &&
    !table.mergedParentId &&
    table.mergedFrom.length === 0
  );
}

function isValidMergedParent(
  table: FloorAllocatorTable,
  tablesById: Map<string, FloorAllocatorTable>,
) {
  if (
    table.isPhysical ||
    !table.isOverride ||
    table.availabilityScope !== "operational" ||
    table.mergedParentId ||
    table.mergedFrom.length < 2 ||
    new Set(table.mergedFrom).size !== table.mergedFrom.length ||
    !table.capacityConfigured ||
    table.capacity === null
  ) {
    return false;
  }

  const members = table.mergedFrom
    .map((memberId) => tablesById.get(memberId))
    .filter((member): member is FloorAllocatorTable => Boolean(member));

  return (
    members.length === table.mergedFrom.length &&
    members.every(
      (member) =>
        member.showId === table.showId &&
        member.zone === table.zone &&
        member.isPhysical &&
        member.capacityConfigured &&
        member.capacity !== null &&
        member.status === "disabled" &&
        !member.bookingId &&
        member.mergedParentId === table.id &&
        member.mergedFrom.length === 0,
    ) &&
    members.reduce((total, member) => total + Number(member.capacity), 0) ===
      table.capacity
  );
}

function isValidOperationalUnit(
  table: FloorAllocatorTable,
  tablesById: Map<string, FloorAllocatorTable>,
) {
  return (
    (table.isPhysical &&
      !table.mergedParentId &&
      table.mergedFrom.length === 0) ||
    isFlatTemporary(table) ||
    isValidMergedParent(table, tablesById)
  );
}

function isValidAllocation(
  booking: FloorAllocatorBooking,
  table: FloorAllocatorTable | undefined,
  tablesById: Map<string, FloorAllocatorTable>,
) {
  return Boolean(
    table &&
      table.showId === booking.showId &&
      table.zone === booking.zone &&
      table.capacityConfigured &&
      table.capacity !== null &&
      table.capacity >= booking.pax &&
      table.status === "booked" &&
      table.bookingId === booking.id &&
      isValidOperationalUnit(table, tablesById),
  );
}

function getCurrentAssignment(
  booking: FloorAllocatorBooking,
  table: FloorAllocatorTable | undefined,
) {
  if (!booking.tableId) {
    return "Unallocated";
  }

  if (!table) {
    return "Missing or stale table";
  }

  if (isLegacyPlaceholder(booking.zone, table.tableCode)) {
    return `Legacy table ${table.tableCode}`;
  }

  return `Invalid table ${table.tableCode}`;
}

function compareTableCodes(left: MutableTable, right: MutableTable) {
  return (
    left.tableCode.localeCompare(right.tableCode, "en", { numeric: true }) ||
    left.id.localeCompare(right.id)
  );
}

function getTableCapacity(table: MutableTable) {
  return table.plannedCapacity ?? table.capacity ?? 0;
}

function getUnitType(table: MutableTable): FloorAllocationProposal["targetType"] {
  if (table.isPhysical) {
    return "physical";
  }

  return table.mergedFrom.length > 0 ? "merged" : "temporary";
}

function chooseMergeMembers(
  availableTables: MutableTable[],
  pax: number,
  remainingCapacityBudget: number,
) {
  const candidates = availableTables
    .filter(
      (table) =>
        table.isPhysical &&
        table.mergeable &&
        !table.mergedParentId &&
        table.mergedFrom.length === 0,
    )
    .sort(compareTableCodes);
  const states = new Map<
    string,
    { addedCapacity: number; capacity: number; members: MutableTable[] }
  >();
  states.set("0:0", { addedCapacity: 0, capacity: 0, members: [] });

  for (const table of candidates) {
    const minimum = table.capacityConfigured
      ? Number(table.capacity)
      : Number(table.minimumCapacity ?? 0);
    const maximum = table.capacityConfigured
      ? Number(table.capacity)
      : Number(table.maximumCapacity ?? 0);

    if (minimum <= 0 || maximum < minimum) {
      continue;
    }

    for (const state of [...states.values()]) {
      const members = [...state.members, table];
      const baseCapacity = state.capacity + minimum;
      const maximumCapacity =
        state.members.reduce(
          (total, member) =>
            total +
            (member.capacityConfigured
              ? Number(member.capacity)
              : Number(member.maximumCapacity ?? 0)),
          0,
        ) + maximum;
      const requiredCapacity = Math.max(baseCapacity, pax);

      if (members.length < 2 || requiredCapacity > maximumCapacity) {
        states.set(`${members.length}:${maximumCapacity}`, {
          addedCapacity:
            state.addedCapacity + (table.capacityConfigured ? 0 : minimum),
          capacity: baseCapacity,
          members,
        });
        continue;
      }

      const addedCapacity = members.reduce(
        (total, member) =>
          total + (member.capacityConfigured ? 0 : Number(member.minimumCapacity)),
        0,
      );
      const extraNeeded = requiredCapacity - baseCapacity;

      if (addedCapacity + extraNeeded > remainingCapacityBudget) {
        continue;
      }

      states.set(`${members.length}:${requiredCapacity}`, {
        addedCapacity: addedCapacity + extraNeeded,
        capacity: requiredCapacity,
        members,
      });
    }
  }

  return [...states.values()]
    .filter((state) => state.members.length >= 2 && state.capacity >= pax)
    .sort(
      (left, right) =>
        left.members.length - right.members.length ||
        left.capacity - right.capacity ||
        left.addedCapacity - right.addedCapacity ||
        left.members
          .map((member) => member.tableCode)
          .join("+")
          .localeCompare(
            right.members.map((member) => member.tableCode).join("+"),
            "en",
            { numeric: true },
          ),
    )[0];
}

export function buildInitialFloorPlan(input: PlannerInput): InitialFloorPlan {
  const tablesById = new Map(input.tables.map((table) => [table.id, table]));
  const preservedBookingIds = input.bookings
    .filter((booking) =>
      isValidAllocation(
        booking,
        booking.tableId ? tablesById.get(booking.tableId) : undefined,
        tablesById,
      ),
    )
    .map((booking) => booking.id)
    .sort();
  const preservedSet = new Set(preservedBookingIds);
  const referencedTableIds = new Set(
    input.bookings.flatMap((booking) =>
      booking.tableId ? [booking.tableId] : [],
    ),
  );
  const unresolvedBookings = input.bookings.filter(
    (booking) => !preservedSet.has(booking.id),
  );
  const capacityProposals: FloorCapacityProposal[] = [];
  const merges: FloorMergeProposal[] = [];
  const allocations: FloorAllocationProposal[] = [];
  const unresolved: FloorUnresolvedException[] = [];

  for (const zone of floorAllocatorZones) {
    const zoneBookings = unresolvedBookings.filter(
      (booking) => booking.zone === zone,
    );
    const zoneDemand = input.bookings
      .filter((booking) => booking.zone === zone)
      .reduce((total, booking) => total + booking.pax, 0);
    const zoneTables = input.tables.filter((table) => table.zone === zone);
    const zoneTableMap = new Map(zoneTables.map((table) => [table.id, table]));
    const requiredPhysicalIds = new Set(
      zoneTables.flatMap((table) => {
        if (table.isPhysical && referencedTableIds.has(table.id)) return [table.id];
        if (!table.isPhysical && table.mergedFrom.length > 0) return table.mergedFrom;
        return [];
      }),
    );
    const allowedPhysicalIds = new Set(requiredPhysicalIds);
    const orderedPhysicalTables = zoneTables
      .filter((table) => table.isPhysical)
      .sort((left, right) =>
        left.tableCode.localeCompare(right.tableCode, "en", { numeric: true }) ||
        left.id.localeCompare(right.id),
      );
    const physicalPlanningLimit = Math.max(
      input.zoneTableCeilings[zone],
      requiredPhysicalIds.size,
    );

    for (const table of orderedPhysicalTables) {
      if (allowedPhysicalIds.size >= physicalPlanningLimit) break;
      allowedPhysicalIds.add(table.id);
    }
    const activeCapacity = zoneTables.reduce((total, table) => {
      if (
        table.status === "disabled" ||
        !table.capacityConfigured ||
        table.capacity === null ||
        table.mergedParentId ||
        !isValidOperationalUnit(table, zoneTableMap)
      ) {
        return total;
      }

      return total + table.capacity;
    }, 0);
    let remainingCapacityBudget = Math.max(
      input.zoneCeilings[zone] - activeCapacity,
      0,
    );
    let availableTables: MutableTable[] = zoneTables
      .filter(
        (table) =>
          !table.bookingId &&
          !referencedTableIds.has(table.id) &&
          !table.mergedParentId &&
          table.mergedFrom.length === 0 &&
          (!table.isPhysical || allowedPhysicalIds.has(table.id)) &&
          ((table.capacityConfigured &&
            table.capacity !== null &&
            table.status === "available" &&
            table.isPhysical) ||
            (table.capacityConfigured &&
              table.capacity !== null &&
              table.status === "available" &&
              isFlatTemporary(table)) ||
            (!table.capacityConfigured &&
              table.capacity === null &&
              table.status === "disabled" &&
              table.isPhysical &&
              table.minimumCapacity !== null &&
              table.maximumCapacity !== null)),
      )
      .map((table) => ({ ...table, plannedCapacity: null }));
    const existingMergedParents: MutableTable[] = zoneTables
      .filter(
        (table) =>
          table.status === "available" &&
          !table.bookingId &&
          !referencedTableIds.has(table.id) &&
          isValidMergedParent(table, zoneTableMap),
      )
      .map((table) => ({ ...table, plannedCapacity: table.capacity }));
    availableTables = [...availableTables, ...existingMergedParents];

    const optionCount = (booking: FloorAllocatorBooking) => {
      const individualOptions = availableTables.filter((table) => {
        if (table.capacityConfigured) {
          return getTableCapacity(table) >= booking.pax;
        }

        return Number(table.maximumCapacity) >= booking.pax;
      }).length;
      const mergeOption = chooseMergeMembers(
        availableTables,
        booking.pax,
        remainingCapacityBudget,
      );
      return individualOptions + (mergeOption ? 1 : 0);
    };

    const orderedBookings = [...zoneBookings].sort(
      (left, right) =>
        optionCount(left) - optionCount(right) ||
        right.pax - left.pax ||
        left.reference.localeCompare(right.reference),
    );

    for (const booking of orderedBookings) {
      const currentTable = booking.tableId
        ? tablesById.get(booking.tableId)
        : undefined;
      const currentAssignment = getCurrentAssignment(booking, currentTable);
      const individualCandidates = availableTables
        .map((table) => {
          const proposedCapacity = table.capacityConfigured
            ? getTableCapacity(table)
            : Math.max(Number(table.minimumCapacity), booking.pax);
          const canConfigure =
            table.capacityConfigured ||
            (proposedCapacity <= Number(table.maximumCapacity) &&
              proposedCapacity <= remainingCapacityBudget);

          return { canConfigure, proposedCapacity, table };
        })
        .filter(
          (candidate) =>
            candidate.canConfigure && candidate.proposedCapacity >= booking.pax,
        )
        .sort(
          (left, right) =>
            Number(right.table.capacityConfigured) -
              Number(left.table.capacityConfigured) ||
            left.proposedCapacity - right.proposedCapacity ||
            compareTableCodes(left.table, right.table),
        );
      const individual = individualCandidates[0];

      if (individual) {
        const { proposedCapacity, table } = individual;

        if (!table.capacityConfigured) {
          table.plannedCapacity = proposedCapacity;
          remainingCapacityBudget -= proposedCapacity;
          capacityProposals.push({
            capacity: proposedCapacity,
            expectedUpdatedAt: table.updatedAt,
            tableCode: table.tableCode,
            tableId: table.id,
            zone,
          });
        }

        allocations.push({
          bookingId: booking.id,
          bookingReference: booking.reference,
          currentAssignment,
          expectedBookingUpdatedAt: booking.updatedAt,
          expectedPreviousTableId: booking.tableId,
          pax: booking.pax,
          targetCapacity: proposedCapacity,
          targetLabel: table.tableCode,
          targetMergeId: null,
          targetTableId: table.id,
          targetType: getUnitType(table),
          unusedSeats: proposedCapacity - booking.pax,
          zone,
        });
        availableTables = availableTables.filter(
          (candidate) => candidate.id !== table.id,
        );
        continue;
      }

      const merge = chooseMergeMembers(
        availableTables,
        booking.pax,
        remainingCapacityBudget,
      );

      if (!merge) {
        unresolved.push({
          bookingReference: booking.reference,
          currentAssignment,
          pax: booking.pax,
          reason:
            zoneDemand > input.zoneCeilings[zone]
              ? `Confirmed ${zone} demand is ${zoneDemand}/${input.zoneCeilings[zone]}; excess demand remains for manual resolution.`
              : `No safe table or flat merge fits within the ${input.zoneCeilings[zone]}-seat ceiling.`,
          zone,
        });
        continue;
      }

      let mergeCapacity = 0;
      let extraNeeded = Math.max(
        booking.pax -
          merge.members.reduce(
            (total, member) =>
              total +
              (member.capacityConfigured
                ? Number(member.capacity)
                : Number(member.minimumCapacity)),
            0,
          ),
        0,
      );

      for (const member of merge.members) {
        if (member.capacityConfigured) {
          mergeCapacity += Number(member.capacity);
          continue;
        }

        const minimum = Number(member.minimumCapacity);
        const extra = Math.min(
          extraNeeded,
          Number(member.maximumCapacity) - minimum,
        );
        const capacity = minimum + extra;
        extraNeeded -= extra;
        mergeCapacity += capacity;
        remainingCapacityBudget -= capacity;
        member.plannedCapacity = capacity;
        capacityProposals.push({
          capacity,
          expectedUpdatedAt: member.updatedAt,
          tableCode: member.tableCode,
          tableId: member.id,
          zone,
        });
      }

      const mergeId = `merge:${booking.id}`;
      const memberIds = new Set(merge.members.map((member) => member.id));
      const memberTableCodes = merge.members.map((member) => member.tableCode);
      merges.push({
        capacity: mergeCapacity,
        id: mergeId,
        memberTableCodes,
        memberTableIds: [...memberIds],
        zone,
      });
      allocations.push({
        bookingId: booking.id,
        bookingReference: booking.reference,
        currentAssignment,
        expectedBookingUpdatedAt: booking.updatedAt,
        expectedPreviousTableId: booking.tableId,
        pax: booking.pax,
        targetCapacity: mergeCapacity,
        targetLabel: memberTableCodes.join("+"),
        targetMergeId: mergeId,
        targetTableId: null,
        targetType: "merged",
        unusedSeats: mergeCapacity - booking.pax,
        zone,
      });
      availableTables = availableTables.filter(
        (candidate) => !memberIds.has(candidate.id),
      );
    }
  }

  return {
    allocations,
    capacityProposals,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    merges,
    preservedBookingIds,
    showId: input.showId,
    snapshot: {
      bookings: input.bookings
        .map((booking) => ({
          id: booking.id,
          tableId: booking.tableId,
          updatedAt: booking.updatedAt,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      tables: input.tables
        .map((table) => ({
          bookingId: table.bookingId,
          capacity: table.capacity,
          capacityConfigured: table.capacityConfigured,
          id: table.id,
          status: table.status,
          updatedAt: table.updatedAt,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
    snapshotToken: input.snapshotToken,
    summary: {
      autoAllocatable: allocations.length,
      capacityChanges: capacityProposals.length,
      merges: merges.length,
      preservedAllocations: preservedBookingIds.length,
      unresolvedBookings: unresolvedBookings.length,
      unresolvedExceptions: unresolved.length,
    },
    unresolved,
  };
}
