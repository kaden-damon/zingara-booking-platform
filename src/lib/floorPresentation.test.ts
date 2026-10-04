import assert from "node:assert/strict";
import test from "node:test";

import {
  floorCapacityHelp,
  floorCapacityLabels,
  formatFloorSeatCount,
  getAssignmentSafetyCopy,
  getTableFitLabel,
} from "./floorPresentation.ts";

test("Floor labels keep public, approved, and physical seating distinct", () => {
  assert.equal(floorCapacityLabels.publicCapacity, "Public seats");
  assert.equal(floorCapacityLabels.extraSeating, "Extra seating");
  assert.equal(floorCapacityLabels.totalApproved, "Total approved seating");
  assert.equal(floorCapacityLabels.physicalSeats, "Table seats set up");
  assert.match(floorCapacityHelp.extraSeating, /Does not increase website availability/);
  assert.match(floorCapacityHelp.physicalSeats, /do not create booking capacity/i);
});

test("table fit and coordinated assignment use plain operational wording", () => {
  assert.equal(formatFloorSeatCount(1, "public seat", "left"), "1 public seat left");
  assert.equal(formatFloorSeatCount(3, "public seat", "left"), "3 public seats left");
  assert.equal(getTableFitLabel(4, 6), "Fits 4-6 guests");
  assert.deepEqual(getAssignmentSafetyCopy(), {
    detail: "If one is no longer available, nothing changes.",
    title: "Tables are assigned together.",
  });
});
