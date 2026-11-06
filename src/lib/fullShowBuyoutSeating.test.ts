import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getFullShowBuyoutZoneTables,
  getSelectedTableCapacity,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./fullShowBuyoutSeating.ts";
import type { DemoTable } from "./zingaraDemo.ts";

function table(
  id: string,
  overrides: Partial<DemoTable> = {},
): DemoTable {
  return {
    authoritativeId: id,
    capacityConfigured: true,
    guestNotes: "",
    id,
    physicalTable: true,
    seatCapacity: 6,
    showId: "show-1",
    status: "available",
    tableNumber: id,
    zoneId: "golden-circle",
    ...overrides,
  };
}

test("offers only current-show assignable tables and preserves existing buyout claims", () => {
  const options = getFullShowBuyoutZoneTables({
    bookingReference: "BUYOUT",
    showId: "show-1",
    tables: [
      table("2"),
      table("10"),
      table("claimed", { bookingReference: "BUYOUT", status: "booked" }),
      table("other", { bookingReference: "OTHER", status: "booked" }),
      table("child", { mergedInto: "merged", status: "disabled" }),
      table("unset", { capacityConfigured: false }),
      table("different-show", { showId: "show-2" }),
    ],
    zoneId: "golden-circle",
  });

  assert.deepEqual(
    options.map((item) => item.tableNumber),
    ["2", "10", "claimed"],
  );
});

test("totals only the selected operational table capacities", () => {
  const tables = [table("1", { seatCapacity: 4 }), table("2", { seatCapacity: 8 })];
  assert.equal(getSelectedTableCapacity(tables, ["2"]), 8);
  assert.equal(getSelectedTableCapacity(tables, ["1", "2"]), 12);
});

test("wires the Floor planner to audited buyout allocation and per-zone claims", () => {
  const component = readFileSync(
    new URL("../app/admin/FullShowBuyoutSeatingPlanner.tsx", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261106020000_phase_1_full_show_buyout_seating.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(component, /Plan buyout seating/i);
  assert.match(component, /assignFullShowBuyoutZoneTables/);
  assert.match(component, /selectedCapacity < entitlement\.pax/);
  assert.match(route, /assign-buyout-zone/);
  assert.match(route, /assign_full_show_buyout_zone_tables_atomic/);
  assert.match(migration, /FLOOR_MANAGEMENT_PERMISSION_REQUIRED/);
  assert.match(migration, /TABLE_ALREADY_CLAIMED/);
  assert.match(migration, /BUYOUT_ZONE_TABLE_CAPACITY_INSUFFICIENT/);
  assert.match(migration, /corporate\.buyout\.zone-tables-assigned/);
  assert.doesNotMatch(component, /auto(?:matic)? assign/i);
});
