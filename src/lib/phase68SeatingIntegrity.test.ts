import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20261030235900_phase_68_seating_proximity.sql",
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
