import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getBookingZoneEntitlements } from "./corporateZoneEntitlements.ts";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("only temporary tables provide reusable operational capacity", async () => {
  const migration = await source(
    "../../supabase/migrations/20261030235920_capacity_integrity_legacy_ratchet.sql",
  );

  assert.match(
    migration,
    /then 'temporary'[\s\S]*where representation_kind = 'temporary'/,
  );
  assert.match(
    migration,
    /least\([\s\S]*legacy_evidence\.seats[\s\S]*booking_totals\.active_entitlement_pax/,
  );
  assert.match(
    migration,
    /temporary_table_capacity \+[\s\S]*protected_legacy_capacity/,
  );
  assert.doesNotMatch(
    migration,
    /update public\.(bookings|show_tables|shows|venue_settings)/i,
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.(bookings|show_tables|shows|venue_settings)/i,
  );
});

test("Admin prechecks consume the authoritative database state", async () => {
  const sourceText = await source("./supabase/bookingCapacity.ts");

  assert.match(sourceText, /rpc\(\s*"booking_capacity_zone_state"/);
  assert.match(sourceText, /effective_operational_capacity/);
  assert.doesNotMatch(sourceText, /from\("show_tables"\)/);
  assert.doesNotMatch(sourceText, /from\("venue_settings"\)/);
});

test("Full Show Buyouts are protected by combined show occupancy", async () => {
  const migration = await source(
    "../../supabase/migrations/20261030235920_capacity_integrity_legacy_ratchet.sql",
  );

  assert.match(migration, /enforce_full_show_buyout_combined_capacity/);
  assert.match(migration, /v_existing_guests \+ new\.guest_count > v_total_capacity/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /ACTIVE_BUYOUT_COMBINED_CAPACITY_REQUIRES_REVIEW/);
});

test("unallocated Full Show Buyouts do not fall back to Middle Ring", async () => {
  assert.deepEqual(
    getBookingZoneEntitlements({
      capacityZoneExcluded: true,
      partySize: 400,
      zoneId: "middle-ring",
    }),
    [],
  );

  const [bookings, reporting, tablePlan] = await Promise.all([
    source("./supabase/bookings.ts"),
    source("./operationalReporting.ts"),
    source("./exports/tablePlan.ts"),
  ]);

  assert.match(bookings, /row\.section\?\.trim\(\)\.toLowerCase\(\) === "full show buyout"/);
  assert.match(reporting, /if \(booking\.capacityZoneExcluded\) return 0/);
  assert.match(tablePlan, /capacityZoneExcluded:[\s\S]*full show buyout/);
});

test("Floor data reuses its existing request for authoritative capacity", async () => {
  const [route, shows, page] = await Promise.all([
    source("../app/api/admin/shows/route.ts"),
    source("./supabase/shows.ts"),
    source("../app/admin/page.tsx"),
  ]);

  assert.match(route, /booking_capacity_zone_states/);
  assert.match(route, /Response\.json\(\{ capacityStates, shows, tables \}\)/);
  assert.match(shows, /capacityStates: payload\.capacityStates \?\? \[\]/);
  assert.match(page, /getAuthoritativeShowZoneCapacity/);
  assert.match(page, /mergeShowZoneCapacityStates/);
});

test("Floor counts hydrated temporary tables using operational table state", async () => {
  const adminPage = await readFile("src/app/admin/page.tsx", "utf8");

  assert.match(
    adminPage,
    /table\.showId === authoritativeSelectedShowId &&\s+isTemporaryOperationalTable\(table\)/,
  );
  assert.doesNotMatch(
    adminPage,
    /selectedShowOverrideCount = tables\.filter\([\s\S]{0,160}table\.showOverride/,
  );
});
