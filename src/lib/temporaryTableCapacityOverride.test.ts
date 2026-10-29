import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261029235961_p0_temporary_table_capacity_override.sql",
    import.meta.url,
  ),
  "utf8",
);

test("temporary tables extend operational capacity above the permanent master", () => {
  assert.match(migration, /temporary_table_capacity \+/);
  assert.match(migration, /grandfathered_capacity\.seats as temporary_capacity/);
  assert.match(
    migration,
    /capacity_context\.base_capacity \+ totals\.temporary_capacity/,
  );
});

test("grandfathered commitments do not consume temporary capacity twice", () => {
  assert.match(migration, /phase55_show_zone_capacity_exceptions/);
  assert.match(
    migration,
    /coalesce\(exception_context\.excess_guests, 0\) -[\s\S]*pre_activation_temporary\.seats -[\s\S]*approved_adjustments\.pre_activation_seats/,
  );
  assert.match(migration, /st\.created_at <= exception_context\.activation_timestamp/);
});

test("merged table representations are excluded from temporary uplift", () => {
  assert.match(
    migration,
    /cardinality\(coalesce\(st\.merged_from, '\{\}'::uuid\[\]\)\) = 0[\s\S]*then 'temporary'/,
  );
  assert.match(migration, /then 'merged'/);
  assert.match(
    migration,
    /where representation_kind = 'temporary'/,
  );
});

test("public sellable capacity remains permanent-master capped", () => {
  assert.match(
    migration,
    /capacity_context\.base_capacity - booking_totals\.active_entitlement_pax/,
  );
  assert.doesNotMatch(migration, /update public\.(shows|venue_settings|bookings)/i);
});

test("shared booking guard keeps public and internal capacity boundaries separate", () => {
  const guardMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20260928200000_phase_41_2y_p0_j_guest_reduction_legacy_allocation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const transferMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20261029235959_p0_sold_out_internal_booking_transfers.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(guardMigration, /booking_origin = 'customer_public'/);
  assert.match(guardMigration, /booking_capacity_zone_limit\(v_zone\)/);
  assert.match(guardMigration, /booking_capacity_zone_effective_limit\(new\.show_id, v_zone\)/);
  assert.match(
    transferMigration,
    /status::text not in \('active', 'sold_out'\)/,
  );
});
