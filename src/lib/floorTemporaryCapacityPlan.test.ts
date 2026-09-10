import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isOperationalFloorShowStatus } from "./floorShowStatus.ts";

const route = readFileSync(
  new URL("../app/api/admin/floor-capacity-plan/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260910100000_phase_41_1x_sold_out_floor_capacity_plans.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Floor capacity creation permits only active and sold-out live shows", () => {
  assert.equal(isOperationalFloorShowStatus("active"), true);
  assert.equal(isOperationalFloorShowStatus("sold_out"), true);
  assert.equal(isOperationalFloorShowStatus("inactive"), false);
  assert.equal(isOperationalFloorShowStatus("archived"), false);
  assert.equal(isOperationalFloorShowStatus("blackout"), false);
  assert.equal(isOperationalFloorShowStatus("venue_closure"), false);
});

test("route and RPC enforce the same operational show semantics", () => {
  assert.match(route, /isOperationalFloorShowStatus\(result\.show\.status\)/);
  assert.match(migration, /status::text not in \('active', 'sold_out'\)/);
  assert.match(migration, /OPERATIONAL_SHOW_REQUIRED/);
  assert.match(route, /OPERATIONAL_SHOW_REQUIRED\|ACTIVE_SHOW_REQUIRED/);
});

test("temporary planning remains atomic, idempotent, and assignment-free", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FLOOR_PLAN_STALE/);
  assert.match(migration, /count\(\*\) from public\.show_tables/);
  assert.match(migration, /insert into public\.show_tables/);
  assert.match(migration, /'operational'/);
  assert.match(migration, /'show\.floor-temporary-plan-created'/);
  assert.doesNotMatch(
    migration,
    /update public\.(bookings|payments|tickets|customers|communications)/i,
  );
});

test("public capacity and physical-table safeguards remain separate", () => {
  const availabilityRoute = readFileSync(
    new URL("../app/api/shows/availability/route.ts", import.meta.url),
    "utf8",
  );
  const physicalGuard = readFileSync(
    new URL(
      "../../supabase/migrations/20260910101000_phase_41_1x_physical_capacity_accounting.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(availabilityRoute, /getEffectiveOperationalZoneCapacity/);
  assert.match(physicalGuard, /TABLE_ZONE_CAPACITY_EXCEEDED/);
  assert.match(physicalGuard, /new\.is_physical/);
  assert.match(
    physicalGuard,
    /st\.is_physical[\s\S]*st\.is_override[\s\S]*availability_scope::text = 'operational'/,
  );
});
