import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 59.1 removes chargeable COMP repricing without weakening reconciliation guards", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20261029235964_phase_59_1_comp_cashup_only.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /v_reprice_chargeable_comp/);
  assert.match(migration, /COMP_CATEGORY_FINANCIAL_BASIS_REQUIRED/);
  assert.match(migration, /replace\([\s\S]*v_added_guests > 0 or v_reprice_chargeable_comp[\s\S]*v_added_guests > 0/s);
  assert.match(migration, /public\.booking_table_claims_fit_guest_count/);
  assert.doesNotMatch(migration, /update public\.bookings/i);
});
