import assert from "node:assert/strict";
import test from "node:test";

import {
  comparePhysicalTableCodes,
  getPhysicalTableDefinition,
  physicalTableDefinitions,
} from "./physicalTables.ts";

function range(zoneId: Parameters<typeof getPhysicalTableDefinition>[0], code: string) {
  const definition = getPhysicalTableDefinition(zoneId, code);

  assert.ok(definition, `${code} should be an authoritative physical table`);
  return [definition.minimumCapacity, definition.maximumCapacity];
}

test("Richard's permanent-table fit ranges match the approved 74-table master", () => {
  assert.deepEqual(range("golden-circle", "401"), [2, 6]);
  assert.deepEqual(range("golden-circle", "406"), [2, 10]);
  assert.deepEqual(range("golden-circle", "600"), [2, 2]);
  assert.deepEqual(range("golden-circle", "602"), [2, 4]);
  for (const code of ["1", "12", "14", "24"]) {
    assert.deepEqual(range("royal-booths", code), [4, 6]);
  }
  for (const code of ["800", "801", "900", "901"]) {
    assert.deepEqual(range("royal-balcony", code), [2, 8]);
  }
  assert.deepEqual(range("middle-ring", "200"), [2, 4]);
  assert.deepEqual(range("middle-ring", "202"), [2, 8]);
  assert.deepEqual(range("middle-ring", "400"), [2, 10]);
});

test("the complete fit matrix uses inclusive minimum and maximum bounds", () => {
  const cases = [
    { code: "406", invalid: [1, 11], valid: [2, 4, 8, 10], zone: "golden-circle" },
    { code: "600", invalid: [1, 3], valid: [2], zone: "golden-circle" },
    { code: "1", invalid: [3, 7], valid: [4, 6], zone: "royal-booths" },
    { code: "800", invalid: [1, 9], valid: [2, 4, 8], zone: "royal-balcony" },
    { code: "202", invalid: [1, 9], valid: [2, 4, 8], zone: "middle-ring" },
  ] as const;

  for (const entry of cases) {
    const definition = getPhysicalTableDefinition(entry.zone, entry.code);
    assert.ok(definition);
    for (const guests of entry.valid) {
      assert.equal(
        guests >= definition.minimumCapacity && guests <= definition.maximumCapacity,
        true,
        `${entry.code} should fit ${guests}`,
      );
    }
    for (const guests of entry.invalid) {
      assert.equal(
        guests >= definition.minimumCapacity && guests <= definition.maximumCapacity,
        false,
        `${entry.code} should not fit ${guests}`,
      );
    }
  }
});

test("booths use true numeric order and retain the authoritative missing 13", () => {
  const boothCodes = physicalTableDefinitions
    .filter((table) => table.zoneId === "royal-booths")
    .map((table) => table.code)
    .sort(comparePhysicalTableCodes);

  assert.deepEqual(
    boothCodes,
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"],
  );
});

test("natural ordering keeps special labels deterministic", () => {
  assert.deepEqual(
    ["TEMP-10", "TEMP-2", "2", "10"].sort(comparePhysicalTableCodes),
    ["2", "10", "TEMP-2", "TEMP-10"],
  );
});

test("the approved master reconciles to 74 tables and 415 seats", () => {
  assert.equal(physicalTableDefinitions.length, 74);
  assert.deepEqual(
    Object.fromEntries(
      ["golden-circle", "middle-ring", "royal-booths", "royal-balcony"].map((zoneId) => [
        zoneId,
        physicalTableDefinitions
          .filter((table) => table.zoneId === zoneId)
          .reduce((total, table) => total + table.maximumCapacity, 0),
      ]),
    ),
    {
      "golden-circle": 120,
      "middle-ring": 125,
      "royal-balcony": 32,
      "royal-booths": 138,
    },
  );
});
