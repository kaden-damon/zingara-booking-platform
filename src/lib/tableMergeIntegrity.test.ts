import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("table restore delete guard preserves insert and update validation", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261030120000_phase_62_table_restore_delete_guard.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /if tg_op = 'DELETE' then\s+return old;/);
  assert.match(migration, /TABLE_CAPACITY_NOT_CONFIGURED/);
  assert.match(migration, /TABLE_CAPACITY_REQUIRED/);
  assert.match(migration, /PHYSICAL_TABLE_CAPACITY_OUT_OF_RANGE/);
  assert.match(migration, /LEGACY_PLACEHOLDER_TABLE_NOT_ASSIGNABLE/);
});

test("atomic merge and restore remain scoped to the requested show and zone", () => {
  const mergeMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20260826170000_phase_37_5_physical_table_reallocation_multi_merge.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const restoreMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20260826173000_phase_37_5a_stale_merge_reconciliation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(mergeMigration, /st\.show_id = p_show_id/);
  assert.match(
    mergeMigration,
    /normalize_booking_capacity_zone\(st\.section\) = v_zone/,
  );
  assert.match(restoreMigration, /v_merged_table\.show_id <> p_show_id/);
  assert.match(restoreMigration, /st\.show_id = p_show_id/);
  assert.match(restoreMigration, /st\.section = v_merged_table\.section/);
});
