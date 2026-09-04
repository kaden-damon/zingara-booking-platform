import assert from "node:assert/strict";
import test from "node:test";

import { getFloorInventoryStats } from "./floorInventory";
import type { DemoTable } from "./zingaraDemo";

function table(overrides: Partial<DemoTable>): DemoTable {
  return {
    authoritativeId: crypto.randomUUID(),
    availabilityScope: "operational",
    capacityConfigured: true,
    guestNotes: "",
    id: crypto.randomUUID(),
    mergeable: true,
    seatCapacity: 8,
    showId: "show-1",
    status: "available",
    tableNumber: "300",
    zoneId: "middle-ring",
    ...overrides,
  };
}

test("Floor inventory separates fixed entitlement from assignable table capacity", () => {
  const unconfigured = Array.from({ length: 20 }, (_, index) =>
    table({
      capacityConfigured: false,
      physicalTable: true,
      status: "disabled",
      tableNumber: String(200 + index),
    }),
  );
  const memberCapacities = [8, 8, 8, 8, 8, 8, 8, 4];
  const mergedId = crypto.randomUUID();
  const members = memberCapacities.map((capacity, index) =>
    table({
      mergedInto: mergedId,
      physicalTable: true,
      seatCapacity: capacity,
      status: "disabled",
      tableNumber: String(306 + index),
    }),
  );
  const merged = table({
    bookingReference: "DP-FNZGQC",
    id: mergedId,
    mergedFrom: members.map((member) => member.id),
    physicalTable: false,
    seatCapacity: 60,
    status: "booked",
    tableNumber: "306+307+308+309+310+311+312+313",
  });
  const temporary = table({
    physicalTable: false,
    seatCapacity: 5,
    tableNumber: "314",
  });

  const stats = getFloorInventoryStats([
    ...unconfigured,
    ...members,
    merged,
    temporary,
  ]);

  assert.deepEqual(stats, {
    assignableTableCapacity: 5,
    assignableTableCount: 1,
    configuredPhysicalTableCount: 8,
    mergedOperationalTableCount: 1,
    operationalTableCapacity: 65,
    operationalUnitCount: 2,
    physicalTableCount: 28,
    temporaryOperationalTableCount: 1,
    unconfiguredPhysicalTableCount: 20,
  });
});

test("merged child capacities are not double counted", () => {
  const first = table({ physicalTable: true, tableNumber: "306" });
  const second = table({ physicalTable: true, tableNumber: "307" });
  const mergedId = crypto.randomUUID();
  first.mergedInto = mergedId;
  first.status = "disabled";
  second.mergedInto = mergedId;
  second.status = "disabled";
  const merged = table({
    id: mergedId,
    mergedFrom: [first.id, second.id],
    physicalTable: false,
    seatCapacity: 16,
    tableNumber: "306+307",
  });

  assert.equal(
    getFloorInventoryStats([first, second, merged]).operationalTableCapacity,
    16,
  );
});
