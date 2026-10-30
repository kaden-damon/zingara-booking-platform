import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20261030235900_phase_68_seating_proximity.sql",
  import.meta.url,
);
const strictSingleTableMigrationPath = new URL(
  "../../supabase/migrations/20261030235910_phase_68_strict_single_table_assignment.sql",
  import.meta.url,
);

test("Phase 68 changes assignment ordering without mutating bookings or tables", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /try_automatic_table_assignment\(uuid\)/);
  assert.match(sql, /try_hybrid_table_assignment_phase_54_11\(uuid\)/);
  assert.match(sql, /anchor\.sort_order/);
  assert.match(sql, /candidate\.sort_order/);
  assert.match(sql, /PHASE_68_PRIMARY_ASSIGNMENT_PATTERN_NOT_FOUND/);
  assert.match(sql, /PHASE_68_HYBRID_ASSIGNMENT_PATTERN_NOT_FOUND/);
  assert.doesNotMatch(
    sql,
    /\b(insert into|update|delete from)\s+public\.(bookings|show_tables|shows|payments|tickets)\b/i,
  );
});

test("Floor capacity presentation keeps public, operational and physical seats distinct", async () => {
  const page = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

  assert.match(page, /floorCapacityLabels\.publicCapacity/);
  assert.match(page, /floorCapacityLabels\.extraSeating/);
  assert.match(page, /floorCapacityLabels\.totalApproved/);
  assert.match(page, /floorCapacityLabels\.physicalSeats/);
  assert.match(page, /authoritativeSelectedShowId/);
});

test("Phase 68 follow-up makes every automatic database path single-table only", async () => {
  const sql = await readFile(strictSingleTableMigrationPath, "utf8");

  assert.match(sql, /try_automatic_table_assignment\(uuid\)/);
  assert.match(sql, /try_automatic_table_assignment_phase_54_5\(uuid\)/);
  assert.match(sql, /try_hybrid_table_assignment_phase_54_11\(uuid\)/);
  assert.match(sql, /try_phase55_existing_booking_assignment\(uuid\)/);
  assert.match(sql, /AUTOMATIC_MULTI_TABLE_ASSIGNMENT_BLOCKED/);
  assert.match(sql, /cardinality\(v_candidate_ids\) > 1/);
  assert.doesNotMatch(
    sql,
    /\b(insert into|update|delete from)\s+public\.(bookings|show_tables|shows|payments|tickets)\b/i,
  );
});

test("manual split assignment remains service-only, permission checked and audited", async () => {
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/20260909180000_phase_41_1w_standard_multi_table_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const baseSql = await readFile(
    new URL(
      "../../supabase/migrations/20260908160000_phase_41_1h_corporate_multi_table_assignment.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(baseSql, /permission\.key = 'bookings:manage'/);
  assert.match(baseSql, /permission2\.key = 'tables:manage'/);
  assert.match(baseSql, /actor_staff_profile_id/);
  assert.match(baseSql, /insert into public\.audit_events/);
  assert.match(sql, /grant execute[\s\S]*to service_role/);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/);
});
