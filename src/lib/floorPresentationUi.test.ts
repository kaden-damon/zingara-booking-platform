import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);

test("Floor uses the plain-language presentation without changing handlers", () => {
  assert.match(page, /Staff-only extra/);
  assert.match(page, /No table fits this group/);
  assert.match(page, /getAssignmentSafetyCopy/);
  assert.match(page, /REMOVE TABLE ASSIGNMENT/);
  assert.match(page, /getTableFitLabel/);
  assert.match(page, /planSelectedFloorCapacity/);
  assert.match(page, /confirmCorporateTableAssignment/);
  assert.match(page, /releaseOperationalTable/);
});

test("ordinary Floor summaries do not present forensic capacity labels", () => {
  const floorSection = page.slice(
    page.indexOf('activeOperationsTab === "floor"'),
    page.indexOf('activeAdminTab === "settings"'),
  );

  assert.doesNotMatch(floorSection, />\s*Active Entitlement\s*</);
  assert.doesNotMatch(floorSection, />\s*Operational Shortfall\s*</);
  assert.doesNotMatch(floorSection, />\s*Assignable Seats\s*</);
  assert.doesNotMatch(floorSection, /Assignment is atomic/);
});

test("Floor responsive layouts stack before tablet widths", () => {
  assert.match(page, /grid-cols-1 gap-3 sm:grid-cols-2/);
  assert.match(page, /flex flex-col gap-3 sm:flex-row/);
  assert.match(page, /min-w-max shrink-0 whitespace-nowrap/);
  assert.match(page, /min-h-11/);
});
