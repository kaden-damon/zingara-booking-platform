import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminRoute = readFileSync(
  new URL("../app/api/admin/bookings/route.ts", import.meta.url),
  "utf8",
);
const adminPage = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const assignmentMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260909170000_phase_41_1h_f_unassigned_cross_zone_assignment.sql",
    import.meta.url,
  ),
  "utf8",
);
const unassignedMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260904180000_phase_39_69_merged_floor_assignment.sql",
    import.meta.url,
  ),
  "utf8",
);
const capacitySource = readFileSync(
  new URL("./supabase/bookingCapacity.ts", import.meta.url),
  "utf8",
);

test("the shared Admin route accepts a null source table explicitly", () => {
  const mappingHandler = adminRoute.slice(
    adminRoute.indexOf("async function persistPhysicalTableMapping"),
    adminRoute.indexOf("async function persistCorporateZoneTransfer"),
  );

  assert.doesNotMatch(
    mappingHandler,
    /if \(!booking\.table_id\)[\s\S]{0,200}does not currently have a table/,
  );
  assert.match(mappingHandler, /const sourceTableQuery = booking\.table_id/);
  assert.match(mappingHandler, /Promise\.resolve\(\{ data: null, error: null \}\)/);
  assert.match(mappingHandler, /p_expected_previous_table_id: booking\.table_id/);
});

test("unassigned same-zone and cross-zone moves use the existing atomic assignment validator", () => {
  assert.match(assignmentMigration, /if v_booking\.table_id is null then/);
  assert.match(
    assignmentMigration,
    /public\.assign_unallocated_booking_table_atomic\(\s*p_booking_id,\s*p_target_table_id/s,
  );
  assert.match(unassignedMigration, /v_target\.show_id <> v_booking\.show_id/);
  assert.match(unassignedMigration, /v_target\.capacity < v_booking\.guest_count/);
  assert.match(unassignedMigration, /v_target\.status::text <> 'available'/);
  assert.match(unassignedMigration, /v_target\.booking_id is not null/);
  assert.match(unassignedMigration, /update public\.show_tables[\s\S]*set booking_id = v_booking\.id/);
  assert.match(unassignedMigration, /update public\.bookings[\s\S]*set table_id = v_target\.id/);
});

test("cross-zone assignment moves one entitlement without changing total pax", () => {
  assert.match(
    assignmentMigration,
    /set section = v_target_booking_section,[\s\S]*zone_entitlements = case/,
  );
  assert.match(
    assignmentMigration,
    /jsonb_build_object\([\s\S]*'zoneId', v_target_zone,[\s\S]*'pax', v_booking\.guest_count/,
  );
  assert.doesNotMatch(assignmentMigration, /set guest_count\s*=/);
  assert.match(capacitySource, /getEffectiveOperationalZoneCapacity/);
  assert.match(capacitySource, /query = query\.neq\("id", existing\.id\)/);
});

test("assigned reallocation and Release Table pathways remain intact", () => {
  assert.match(
    assignmentMigration,
    /else\s+v_mapping_result := public\.map_booking_physical_table_atomic\(/s,
  );
  assert.match(adminPage, /releaseOperationalTable/);
  assert.match(adminPage, /RELEASE TABLE/);
  assert.match(adminPage, /selectedShowFloorAssignmentBookings/);
});

test("multi-zone Corporate bookings remain on their dedicated Floor pathway", () => {
  assert.match(adminRoute, /booking\.zone_entitlements\.length > 1/);
  assert.match(adminRoute, /Use the Corporate multi-zone Floor workflow/);
  assert.match(assignmentMigration, /MULTI_ZONE_CORPORATE_WORKFLOW_REQUIRED/);
});

test("assignment is identity and finance isolated", () => {
  const updateStatements = assignmentMigration.match(
    /update public\.[a-z_]+[\s\S]*?;/gi,
  ) ?? [];

  assert.doesNotMatch(
    assignmentMigration,
    /update public\.(payments|tickets|customers|communications)/i,
  );
  for (const statement of updateStatements) {
    assert.doesNotMatch(
      statement,
      /\b(guest_count|total_amount|amount_paid|balance_outstanding|payment_status)\s*=/i,
    );
  }
  assert.match(
    adminRoute,
    /if \(booking\.table_id && booking\.table_id !== typedTargetTable\.id\)/,
  );
});

test("the atomic operation remains service-role only", () => {
  assert.match(assignmentMigration, /security definer/);
  assert.match(assignmentMigration, /for update/);
  assert.match(assignmentMigration, /BOOKING_TABLE_ASSIGNMENT_CHANGED/);
  assert.match(assignmentMigration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(assignmentMigration, /grant execute[\s\S]*to service_role/);
});
