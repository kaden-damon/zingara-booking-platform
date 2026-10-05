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

test("Jacques permanent-table fit ranges match the authoritative catalogue", () => {
  for (const code of ["400", "405", "500", "505"]) {
    assert.deepEqual(range("golden-circle", code), [2, 12]);
  }
  for (const code of ["600", "611"]) {
    assert.deepEqual(range("golden-circle", code), [2, 4]);
  }
  for (const code of ["1", "12", "14", "24"]) {
    assert.deepEqual(range("royal-booths", code), [4, 8]);
  }
  for (const code of ["800", "801", "900", "901"]) {
    assert.deepEqual(range("royal-balcony", code), [2, 10]);
  }
  for (const code of ["200", "213", "300", "313"]) {
    assert.deepEqual(range("middle-ring", code), [2, 8]);
  }
});

test("the complete fit matrix uses inclusive minimum and maximum bounds", () => {
  const cases = [
    { code: "400", invalid: [1, 13], valid: [2, 4, 8, 12], zone: "golden-circle" },
    { code: "600", invalid: [1, 5], valid: [2, 4], zone: "golden-circle" },
    { code: "1", invalid: [3, 9], valid: [4, 6, 8], zone: "royal-booths" },
    { code: "800", invalid: [1, 11], valid: [2, 4, 8, 10], zone: "royal-balcony" },
    { code: "200", invalid: [1, 9], valid: [2, 4, 8], zone: "middle-ring" },
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
