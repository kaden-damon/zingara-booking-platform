import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialFloorPlan,
  type FloorAllocatorBooking,
  type FloorAllocatorTable,
} from "./floorAllocator";

const showId = "show-1";
const updatedAt = "2026-08-27T12:00:00.000Z";

function booking(
  id: string,
  pax: number,
  zone: FloorAllocatorBooking["zone"],
  tableId: string | null = null,
): FloorAllocatorBooking {
  return {
    id,
    pax,
    reference: `BOOKING-${id}`,
    showId,
    tableId,
    updatedAt,
    zone,
  };
}

function table(
  id: string,
  zone: FloorAllocatorTable["zone"],
  input: Partial<FloorAllocatorTable> = {},
): FloorAllocatorTable {
  return {
    availabilityScope: "public",
    bookingId: null,
    capacity: 6,
    capacityConfigured: true,
    id,
    isOverride: false,
    isPhysical: true,
    maximumCapacity: 6,
    mergeable: true,
    mergedFrom: [],
    mergedParentId: null,
    minimumCapacity: 4,
    showId,
    status: "available",
    tableCode: id,
    updatedAt,
    zone,
    ...input,
  };
}

function plan(bookings: FloorAllocatorBooking[], tables: FloorAllocatorTable[]) {
  return buildInitialFloorPlan({
    bookings,
    generatedAt: updatedAt,
    showId,
    snapshotToken: "snapshot",
    tables,
    zoneCeilings: {
      "golden-circle": 148,
      "middle-ring": 132,
      "royal-balcony": 40,
      "royal-booths": 138,
    },
    zoneTableCeilings: {
      "golden-circle": 24,
      "middle-ring": 26,
      "royal-balcony": 4,
      "royal-booths": 23,
    },
  });
}

test("preserves valid allocations and plans only unresolved bookings", () => {
  const validBooking = booking("valid", 4, "royal-booths", "table-valid");
  const legacyBooking = booking("legacy", 4, "royal-booths", "legacy-table");
  const result = plan(
    [validBooking, legacyBooking],
    [
      table("table-valid", "royal-booths", {
        bookingId: validBooking.id,
        status: "booked",
      }),
      table("legacy-table", "royal-booths", {
        availabilityScope: "public",
        bookingId: legacyBooking.id,
        capacity: 4,
        isPhysical: false,
        tableCode: "B1",
      }),
      table("table-free", "royal-booths"),
    ],
  );

  assert.deepEqual(result.preservedBookingIds, [validBooking.id]);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0]?.bookingId, legacyBooking.id);
  assert.equal(result.allocations[0]?.targetTableId, "table-free");
});

test("proposes approved physical capacity without crossing the zone ceiling", () => {
  const result = plan(
    [booking("gc", 10, "golden-circle")],
    [
      table("400", "golden-circle", {
        capacity: null,
        capacityConfigured: false,
        maximumCapacity: 12,
        minimumCapacity: 8,
        status: "disabled",
      }),
    ],
  );

  assert.deepEqual(
    result.capacityProposals.map(({ capacity, tableId }) => ({ capacity, tableId })),
    [{ capacity: 10, tableId: "400" }],
  );
  assert.equal(result.allocations[0]?.targetTableId, "400");

  const blocked = buildInitialFloorPlan({
    bookings: [booking("over", 4, "golden-circle")],
    generatedAt: updatedAt,
    showId,
    snapshotToken: "snapshot",
    tables: [
      table("occupied", "golden-circle", {
        bookingId: "preserved",
        capacity: 9,
        status: "booked",
      }),
      table("401", "golden-circle", {
        capacity: null,
        capacityConfigured: false,
        maximumCapacity: 12,
        minimumCapacity: 8,
        status: "disabled",
      }),
    ],
    zoneCeilings: {
      "golden-circle": 10,
      "middle-ring": 132,
      "royal-balcony": 40,
      "royal-booths": 138,
    },
    zoneTableCeilings: {
      "golden-circle": 24,
      "middle-ring": 26,
      "royal-balcony": 4,
      "royal-booths": 23,
    },
  });

  assert.equal(blocked.allocations.length, 0);
  assert.equal(blocked.unresolved.length, 1);
});

test("uses existing units first and proposes a flat merge only when required", () => {
  const result = plan(
    [
      booking("small", 4, "royal-booths"),
      booking("large", 10, "royal-booths"),
    ],
    [
      table("1", "royal-booths"),
      table("2", "royal-booths"),
      table("3", "royal-booths"),
    ],
  );

  assert.equal(result.merges.length, 1);
  assert.equal(result.merges[0]?.memberTableIds.length, 2);
  assert.equal(result.allocations.length, 2);
  assert.equal(
    result.allocations.find((allocation) => allocation.bookingId === "large")
      ?.targetType,
    "merged",
  );
});

test("produces the same plan for an unchanged snapshot", () => {
  const bookings = [booking("b", 4, "royal-balcony")];
  const tables = [
    table("800", "royal-balcony", {
      capacity: 10,
      maximumCapacity: 10,
      minimumCapacity: 10,
    }),
  ];

  assert.deepEqual(plan(bookings, tables), plan(bookings, tables));
});

test("limits new physical planning inventory without moving preserved allocations", () => {
  const preserved = booking("preserved", 2, "middle-ring", "table-2");
  const result = buildInitialFloorPlan({
    bookings: [preserved, booking("new-a", 2, "middle-ring"), booking("new-b", 2, "middle-ring")],
    generatedAt: updatedAt,
    showId,
    snapshotToken: "snapshot",
    tables: [
      table("table-1", "middle-ring", { capacity: 2 }),
      table("table-2", "middle-ring", {
        bookingId: preserved.id,
        capacity: 2,
        status: "booked",
      }),
      table("table-3", "middle-ring", { capacity: 2 }),
    ],
    zoneCeilings: {
      "golden-circle": 148,
      "middle-ring": 132,
      "royal-balcony": 40,
      "royal-booths": 138,
    },
    zoneTableCeilings: {
      "golden-circle": 24,
      "middle-ring": 2,
      "royal-balcony": 4,
      "royal-booths": 23,
    },
  });

  assert.deepEqual(result.preservedBookingIds, [preserved.id]);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.unresolved.length, 1);
});
