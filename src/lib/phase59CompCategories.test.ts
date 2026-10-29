import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 59 guest-count migration preserves guards and reprices only structured chargeable comps", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20261029235963_phase_59_comp_booking_categories.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /complimentaryCategory.*media.*tradex/s);
  assert.match(migration, /pricingProvenance,source.*complimentary/s);
  assert.match(migration, /p_guest_count \* v_unit_amount/);
  assert.match(migration, /COMP_CATEGORY_REDUCTION_FINANCIAL_REVIEW_REQUIRED/);
  assert.match(migration, /public\.booking_table_claims_fit_guest_count/);
  assert.match(migration, /v_added_guests > 0 or v_reprice_chargeable_comp/);
  assert.doesNotMatch(migration, /update public\.bookings[\s\S]*where complimentaryCategory/i);
});
