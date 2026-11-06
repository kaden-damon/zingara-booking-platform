import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Floor queue exposes all suitable single tables and assigns one click atomically", async () => {
  const [page, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/floor-capacity-plan/route.ts"),
  ]);

  assert.match(page, /findSuitableTableAllocations\(/);
  assert.match(
    page,
    /Table \$\{allocation\.table\.tableNumber\} · \$\{allocation\.table\.seatCapacity\} seats/,
  );
  assert.match(page, /\$\{index === 0 \? " · BEST" : ""\}/);
  assert.match(page, /assignCorporateFloorPlan\(/);
  assert.match(page, /tableIds: \[authoritativeTableId\]/);
  assert.match(page, /floorAssignmentInFlightRef\.current\.has/);
  assert.doesNotMatch(page, /tableAssignmentConfirmation/);
  assert.doesNotMatch(page, /Assign this table\?/);

  assert.match(route, /selectedAvailableTable/);
  assert.match(route, /requestedTableIds\.length !== 1/);
  assert.match(route, /assign_corporate_booking_zone_tables_atomic/);
  assert.match(route, /isExactIdempotentReplay/);
  assert.match(route, /TABLE NO LONGER AVAILABLE/);
  assert.match(route, /FLOOR PLAN CHANGED - REVIEW AGAIN/);
});
