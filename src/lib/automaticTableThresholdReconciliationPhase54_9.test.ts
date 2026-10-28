import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Phase 54.9 never creates an override and requires matching resume evidence", async () => {
  const migration = await source(
    "../../supabase/migrations/20261028235930_phase_54_9_threshold_queue_resolution.sql",
  );

  assert.match(migration, /not v_adoption\.threshold_override_active/);
  assert.match(migration, /show\.automatic-table-assignment-resume/);
  assert.match(migration, /audit\.actor_staff_profile_id = v_actor\.id/);
  assert.match(migration, /THRESHOLD_OVERRIDE_AUDIT_REQUIRED/);
  assert.doesNotMatch(migration, /threshold_override_active\s*=\s*true/i);
  assert.doesNotMatch(migration, /pause_threshold_percent\s*=/i);
});

test("Phase 54.9 is bounded, atomic and preserves existing seating", async () => {
  const migration = await source(
    "../../supabase/migrations/20261028235930_phase_54_9_threshold_queue_resolution.sql",
  );

  assert.match(migration, /p_limit > 100/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update of booking skip locked/);
  assert.match(migration, /try_automatic_table_assignment_phase_54_5/);
  assert.match(migration, /show\.threshold-override-queue-reconciled/);
  assert.doesNotMatch(migration, /delete from public\.(bookings|show_tables)/i);
});

test("the existing audited resume action triggers one bounded reconciliation pass", async () => {
  const [migration, route] = await Promise.all([
    source("../../supabase/migrations/20261028235930_phase_54_9_threshold_queue_resolution.sql"),
    source("../app/api/admin/automatic-table-assignment/route.ts"),
  ]);

  assert.match(route, /body\.action === "resume"/);
  assert.match(route, /resume_and_reconcile_threshold_assignment/);
  assert.match(route, /p_limit: 100/);
  assert.match(migration, /control_automatic_table_assignment\([\s\S]*'resume'/);
  assert.match(migration, /reconcile_authorized_threshold_assignment_batch/);
  assert.match(migration, /any failure rolls back both operations/);
});
