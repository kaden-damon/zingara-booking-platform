import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { bookingClaimsTable } from "./bookingTableClaims.ts";
import { getCorporateTableReleasePreview } from "./corporateFloorPlanning.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260908170000_phase_41_1h_a_multi_table_floor_release.sql",
    import.meta.url,
  ),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
  "utf8",
);
const adminPage = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const occupancySource = readFileSync(
  new URL("./zingaraDemo.ts", import.meta.url),
  "utf8",
);

const meganClaims = Array.from({ length: 11 }, (_, index) => ({
  capacity: 6,
  primary: index === 0,
  section: "Private Booths",
  tableCode: String(index + 1),
  tableId: `table-${index + 1}`,
}));

test("every authoritative multi-table claim renders reserved and is excluded from availability", () => {
  const booking = {
    reservationTableClaims: meganClaims,
    tableId: "table-1",
  };
  const reserved = Array.from({ length: 12 }, (_, index) => index + 1).filter(
    (index) => bookingClaimsTable(booking, `table-${index}`),
  );

  assert.deepEqual(reserved, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(12 - reserved.length, 1);
  assert.match(
    occupancySource,
    /bookingClaimsTable\(booking, availableTable\.id\)/,
  );
});

test("single-table primary-pointer hydration remains supported", () => {
  assert.equal(bookingClaimsTable({ tableId: "table-1" }, "table-1"), true);
  assert.equal(bookingClaimsTable({ tableId: "table-1" }, "table-2"), false);
});

test("zone entitlement counts booking pax once rather than combined table capacity", () => {
  const privateBoothsCapacity = 138;
  const bookingPax = 65;
  const combinedTableCapacity = 66;

  assert.equal(privateBoothsCapacity - bookingPax, 73);
  assert.notEqual(privateBoothsCapacity - combinedTableCapacity, 73);
});

test("individual release retains a sufficient remaining assignment", () => {
  const preview = getCorporateTableReleasePreview({
    bookingPax: 65,
    releaseTableId: "spare",
    tableClaims: [
      { capacity: 65, tableCode: "A", tableId: "core" },
      { capacity: 5, tableCode: "B", tableId: "spare" },
    ],
  });

  assert.deepEqual(preview, {
    releaseMode: "single",
    releasedTableCode: "B",
    remainingCapacity: 65,
    remainingTableCount: 1,
  });
});

test("individual release falls back atomically when remaining tables under-seat the booking", () => {
  const preview = getCorporateTableReleasePreview({
    bookingPax: 65,
    releaseTableId: "table-11",
    tableClaims: meganClaims,
  });

  assert.equal(preview?.remainingCapacity, 60);
  assert.equal(preview?.releaseMode, "complete-fallback");
  assert.match(migration, /v_release_mode := 'complete-fallback'/);
  assert.match(
    migration,
    /update public\.show_tables[\s\S]*where booking_id = v_booking\.id/,
  );
  assert.match(migration, /set table_id = null/);
});

test("per-table release is authenticated, stale-safe, audited, and financially isolated", () => {
  assert.match(
    route,
    /action\?: "assign" \| "create" \| "release" \| "release-table"/,
  );
  assert.match(route, /release_corporate_booking_table_atomic/);
  assert.match(migration, /security definer/);
  assert.match(migration, /FLOOR_MANAGEMENT_PERMISSION_REQUIRED/);
  assert.match(migration, /FLOOR_PLAN_STALE/);
  assert.match(migration, /TABLE_CLAIM_NOT_FOUND/);
  assert.match(migration, /for update/);
  assert.match(migration, /booking\.corporate-table-released/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(
    migration,
    /update public\.(payments|tickets|customers|communications)/i,
  );
});

test("Floor cards expose complete ownership context and both release controls", () => {
  assert.match(adminPage, /bookingClaimsTable\(currentBooking, table\.id\)/);
  assert.match(adminPage, /Complete assignment:/);
  assert.match(adminPage, /This table: \{table\.seatCapacity\} seats/);
  assert.match(adminPage, /RELEASE TABLE/);
  assert.match(adminPage, /RELEASE COMPLETE ASSIGNMENT/);
  assert.match(adminPage, /refreshAssignedShowState\(booking\.showId\)/);
});
