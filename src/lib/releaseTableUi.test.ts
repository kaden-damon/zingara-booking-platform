import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminPage = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
  "utf8",
);
const baseReleaseMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260908170000_phase_41_1h_a_multi_table_floor_release.sql",
    import.meta.url,
  ),
  "utf8",
);
const releaseMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260909160000_phase_41_1u_release_table_ui.sql",
    import.meta.url,
  ),
  "utf8",
);

test("assigned Standard and Corporate operational claims render Release Table", () => {
  const releaseControl = adminPage.slice(
    adminPage.indexOf("{isAllocatedTableClaim && ("),
    adminPage.indexOf("{table.mergedFrom?.length && (", adminPage.indexOf("{isAllocatedTableClaim && (")),
  );

  assert.match(releaseControl, /releaseOperationalTable/);
  assert.match(releaseControl, /RELEASE TABLE/);
  assert.doesNotMatch(releaseControl, /source === "corporate-direct"/);
});

test("confirmation distinguishes one-table release and preserves active temporary tables", () => {
  assert.match(
    adminPage,
    /The booking will remain active and return to the Floor Assignment queue/,
  );
  assert.match(adminPage, /will remain \$\{isTemporaryTable \? "active and " : ""\}available/);
  assert.match(adminPage, /This table is part of a \$\{tableIds\.length\}-table assignment/);
});

test("release remains atomic, stale-safe, scoped, audited, and mutation-isolated", () => {
  assert.match(route, /release_corporate_booking_table_atomic/);
  assert.match(baseReleaseMigration, /FLOOR_MANAGEMENT_PERMISSION_REQUIRED/);
  assert.match(baseReleaseMigration, /SHOW_OUTSIDE_STAFF_SCOPE/);
  assert.match(baseReleaseMigration, /FLOOR_PLAN_STALE/);
  assert.match(baseReleaseMigration, /TABLE_CLAIM_NOT_FOUND/);
  assert.match(baseReleaseMigration, /for update/);
  assert.match(baseReleaseMigration, /set booking_id = null/);
  assert.match(baseReleaseMigration, /set table_id = null/);
  assert.doesNotMatch(
    baseReleaseMigration,
    /update public\.(payments|tickets|customers|communications)/i,
  );
});

test("the existing service-role pathway now accepts active Standard assignments", () => {
  assert.match(releaseMigration, /Expected Corporate-only table release guard/);
  assert.match(releaseMigration, /booking\.table-released/);
  assert.match(releaseMigration, /grant execute[\s\S]*to service_role/);
  assert.match(releaseMigration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(
    releaseMigration,
    /update public\.(bookings|show_tables|payments|tickets|customers|communications)/i,
  );
});

test("Disable and Move to Table remain separate controls", () => {
  assert.match(adminPage, /Move to table/);
  assert.match(adminPage, /toggleDisabled\(table\)/);
  assert.match(adminPage, /\? "Enable"\s+: "Disable"/);
});
