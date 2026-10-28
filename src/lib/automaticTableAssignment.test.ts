import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("automatic assignment is dormant until both venue and show gates are enabled", async () => {
  const migration = await source("../../supabase/migrations/20261028160000_phase_54_2_automatic_table_assignment.sql");

  assert.match(migration, /assignment_state text not null default 'disabled'/);
  assert.match(migration, /if not coalesce\(v_settings\.automatic_assignment_enabled, false\)/);
  assert.match(migration, /v_adoption\.adoption_status <> 'adopted'/);
  assert.match(migration, /create constraint trigger bookings_automatic_table_assignment[\s\S]*deferrable initially deferred/);
  assert.doesNotMatch(migration, /after insert or update on public\.bookings/);
});

test("approved permanent capacities populate only when unset and never overwrite configured arrangements", async () => {
  const migration = await source("../../supabase/migrations/20261028160000_phase_54_2_automatic_table_assignment.sql");

  assert.match(migration, /capacity = approved\.maximum_guests/);
  assert.match(migration, /and \(not table_row\.capacity_configured or table_row\.capacity is null\)/);
  assert.match(migration, /and table_row\.booking_id is null/);
  assert.match(migration, /when v_configured_mismatch_count > 0 then 'CONFIGURED_CAPACITY_CONFLICT'/);
  assert.match(migration, /when v_unsafe_assigned_count > 0 then 'ASSIGNED_TABLE_CAPACITY_REVIEW_REQUIRED'/);
});

test("assignment remains zone-bound, best-fit, atomic and fail-safe", async () => {
  const migration = await source("../../supabase/migrations/20261028160000_phase_54_2_automatic_table_assignment.sql");
  const assignment = migration.slice(migration.indexOf("create or replace function public.try_automatic_table_assignment"));

  assert.match(assignment, /pg_advisory_xact_lock/);
  assert.match(assignment, /approved\.zone_id = v_zone/);
  assert.match(assignment, /for update of table_row skip locked/);
  assert.match(assignment, /order by[\s\S]*approved\.maximum_guests/);
  assert.match(assignment, /get diagnostics v_candidate_count = row_count/);
  assert.match(assignment, /if v_candidate_count <> cardinality\(v_candidate_ids\)/);
  assert.match(assignment, /exception when others then[\s\S]*ATOMIC_ASSIGNMENT_CONFLICT/);
  assert.match(assignment, /exception when others then[\s\S]*FAIL_SAFE/);
});

test("buyouts, multi-zone bookings and the threshold crossing route to manual assignment", async () => {
  const migration = await source("../../supabase/migrations/20261028160000_phase_54_2_automatic_table_assignment.sql");

  assert.match(migration, /BUYOUT_MANUAL_PLANNING/);
  assert.match(migration, /MULTI_ZONE_MANUAL_PLANNING/);
  assert.match(migration, /v_occupancy_percent >= v_threshold/);
  assert.ok(
    migration.indexOf("v_occupancy_percent >= v_threshold") <
      migration.indexOf("while v_candidate_capacity < v_booking.guest_count"),
    "threshold must pause before selecting a table set",
  );
  assert.match(migration, /THRESHOLD_PAUSED/);
});

test("Table Plan controls and notifications are bounded and permission protected", async () => {
  const [route, panel, workflow, push] = await Promise.all([
    source("../app/api/admin/automatic-table-assignment/route.ts"),
    source("../app/admin/AutomaticTableAssignmentPanel.tsx"),
    source("./workflows/automaticTableAssignmentNotifications.ts"),
    source("./supabase/staffPush.ts"),
  ]);

  assert.match(route, /permissions\.includes\("bookings:manage"\)/);
  assert.match(route, /permissions\.includes\("tables:manage"\)/);
  assert.match(route, /permissions\.includes\("settings:manage"\)/);
  assert.match(panel, /Automatic Assignment/);
  assert.doesNotMatch(panel, /setInterval|setTimeout/);
  assert.match(workflow, /p_limit: 10/);
  assert.match(workflow, /notificationId: `automatic-table-assignment-\$\{event\.id\}`/);
  assert.match(push, /"floor-assignment-paused"/);
});
