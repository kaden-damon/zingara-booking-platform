import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261028230000_phase_54_5_seating_reconciliation_queue.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Phase 54.5 preserves existing assignments and operational table decisions", () => {
  assert.match(migration, /table_row\.booking_id is null/);
  assert.match(migration, /not table_row\.is_override/);
  assert.match(migration, /table_row\.merged_parent_id is null/);
  assert.match(
    migration,
    /coalesce\(cardinality\(table_row\.merged_from\), 0\) = 0/,
  );
  assert.doesNotMatch(migration, /delete from public\.(bookings|show_tables)/i);
});

test("Phase 54.5 keeps threshold, Buyout and multi-zone cases fail-closed", () => {
  assert.match(migration, /v_occupancy_percent >= v_threshold/);
  assert.match(migration, /public\.corporate_buyouts/);
  assert.match(migration, /jsonb_array_length\(booking\.zone_entitlements\) <= 1/);
  assert.match(migration, /SHOW_NOT_ACTIVE/);
});

test("Phase 54.5 assignment is bounded, locked and audited", () => {
  assert.match(migration, /p_limit > 100/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update of table_row skip locked/);
  assert.match(migration, /BACKLOG_BEST_FIT_ASSIGNED/);
  assert.match(migration, /booking\.table-backlog-reconciled/);
  assert.doesNotMatch(migration, /\brollback\s*;/i);
});

test("approved master-only tables remain protected by exact identity checks", () => {
  assert.match(
    migration,
    /approved\.table_code = st\.table_code[\s\S]*approved\.zone_id =[\s\S]*normalize_booking_capacity_zone\(st\.section\)[\s\S]*approved\.maximum_guests = st\.capacity/,
  );
  assert.match(migration, /then least\(2, st\.capacity\) else st\.capacity end/);
  assert.doesNotMatch(migration, /coalesce\(vt\.minimum_capacity, 1\)/);
});

test("automatic assignment cannot underfill a physical table", () => {
  assert.match(migration, /resolve_approved_table_minimum_occupancy/);
  assert.match(migration, /v_candidate_minimum[\s\S]*<= v_booking\.guest_count/);
  assert.match(migration, /MINIMUM_OCCUPANCY_REVIEW_REQUIRED/);
  assert.match(
    migration,
    /perform public\.try_automatic_table_assignment_phase_54_5\(new\.id\)/,
  );
});

test("Phase 54.5 activates only shows with complete booking coverage", () => {
  const activation = migration.slice(
    migration.indexOf("create temporary table phase_54_5_activation"),
  );
  assert.match(activation, /sum\(table_row\.capacity\)/);
  assert.match(activation, /< booking\.guest_count/);
  assert.match(activation, /\) = 74/);
  assert.match(activation, /validate_show_physical_layout_eligibility/);
});
