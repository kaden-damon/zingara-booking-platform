import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSource = () => readFile(
  new URL(
    "../../supabase/migrations/20261028235958_phase_54_12_box_office_assignment_approval.sql",
    import.meta.url,
  ),
  "utf8",
);
const routeSource = () => readFile(
  new URL("../app/api/admin/automatic-table-assignment/route.ts", import.meta.url),
  "utf8",
);
const panelSource = () => readFile(
  new URL("../app/admin/AutomaticTableAssignmentPanel.tsx", import.meta.url),
  "utf8",
);

test("resume requires management permissions, venue scope and a reason", async () => {
  const migration = await migrationSource();
  assert.match(migration, /permission\.key = 'bookings:manage'/);
  assert.match(migration, /permission\.key = 'tables:manage'/);
  assert.match(migration, /SHOW_OUTSIDE_STAFF_SCOPE/);
  assert.match(migration, /OVERRIDE_REASON_REQUIRED/);
  assert.match(migration, /actor_staff_profile_id/);
});

test("one approval creates a durable bounded idempotent queue", async () => {
  const migration = await migrationSource();
  assert.match(migration, /automatic_table_assignment_resume_jobs/);
  assert.match(migration, /unique \(show_id, assignment_revision\)/);
  assert.match(migration, /unique \(job_id, booking_id\)/);
  assert.match(migration, /p_limit > 50/);
  assert.match(migration, /for update of item skip locked/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("resume reuses hybrid safety and never manufactures approval during migration", async () => {
  const migration = await migrationSource();
  assert.match(migration, /try_hybrid_table_assignment_phase_54_11/);
  assert.match(migration, /assignment_state = 'enabled'/);
  assert.match(migration, /threshold_override_active = true/);
  assert.match(migration, /show\.automatic-table-assignment-/);
  const seed = migration.slice(
    migration.indexOf("insert into public.show_physical_seating_layouts"),
    migration.indexOf("create or replace function public.get_box_office"),
  );
  assert.match(seed, /threshold_override_active/);
  assert.match(seed, /false, 1, now\(\)/);
});

test("migration preserves layouts and financial data", async () => {
  const migration = await migrationSource();
  assert.doesNotMatch(migration, /delete from public\.(bookings|show_tables)/i);
  assert.doesNotMatch(migration, /update public\.(payments|tickets)/i);
  assert.doesNotMatch(migration, /update public\.shows\s+set/i);
});

test("the existing route continues approved jobs after responding", async () => {
  const route = await routeSource();
  assert.match(route, /import \{ after \} from "next\/server"/);
  assert.match(route, /resume_hybrid_assignment_phase_54_12/);
  assert.match(route, /process_hybrid_assignment_resume_job_phase_54_12/);
  assert.match(route, /p_limit: 25/);
  assert.match(route, /batch < 20/);
});

test("the Table Plan panel shows approval facts without background polling", async () => {
  const panel = await panelSource();
  assert.match(panel, /Resume Auto Assignment/);
  assert.match(panel, /availableTableUnits/);
  assert.match(panel, /awaitingAssignmentCount/);
  assert.match(panel, /\["pending", "processing"\]/);
  assert.match(panel, /Tables Assigned/);
  assert.match(panel, /Refresh/);
  assert.doesNotMatch(panel, /setInterval|setTimeout/);
});
