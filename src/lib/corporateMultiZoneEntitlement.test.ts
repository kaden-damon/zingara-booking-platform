import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getBookingZoneEntitlements,
  parseCorporateZoneEntitlements,
  validateCorporateZoneEntitlements,
} from "./corporateZoneEntitlements.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Tarsus 132 Golden Circle plus 106 Middle Ring is one 238-pax entitlement", () => {
  const split = [
    { pax: "132", zoneId: "golden-circle" },
    { pax: "106", zoneId: "middle-ring" },
  ];
  assert.equal(validateCorporateZoneEntitlements(split, 238), null);
  assert.deepEqual(parseCorporateZoneEntitlements(split, 238), [
    { pax: 132, zoneId: "golden-circle" },
    { pax: 106, zoneId: "middle-ring" },
  ]);
  assert.equal(
    getBookingZoneEntitlements({
      partySize: 238,
      zoneEntitlements: parseCorporateZoneEntitlements(split, 238)!,
      zoneId: "golden-circle",
    }).reduce((sum, entitlement) => sum + entitlement.pax, 0),
    238,
  );
});

test("under, over, duplicate, empty, and invalid zone allocations fail closed", () => {
  assert.match(validateCorporateZoneEntitlements([{ pax: "131", zoneId: "golden-circle" }, { pax: "106", zoneId: "middle-ring" }], 238)!, /equal 238/);
  assert.match(validateCorporateZoneEntitlements([{ pax: "133", zoneId: "golden-circle" }, { pax: "106", zoneId: "middle-ring" }], 238)!, /equal 238/);
  assert.match(validateCorporateZoneEntitlements([{ pax: "132", zoneId: "golden-circle" }, { pax: "106", zoneId: "golden-circle" }], 238)!, /only once/);
  assert.match(validateCorporateZoneEntitlements([{ pax: "0", zoneId: "golden-circle" }], 0)!, /positive whole/);
  assert.match(validateCorporateZoneEntitlements([{ pax: "238", zoneId: "unknown" }], 238)!, /valid seating zone/);
});

test("single-zone Corporate and Standard bookings retain legacy semantics", () => {
  assert.deepEqual(getBookingZoneEntitlements({ partySize: 22, zoneId: "golden-circle" }), [
    { pax: 22, zoneId: "golden-circle" },
  ]);
});

test("database validates split, locks capacity, commits atomically, and denies untrusted callers", async () => {
  const migration = await source("../../supabase/migrations/20260909110000_phase_41_1p_multi_zone_corporate_entitlements.sql");
  assert.match(migration, /sum\(\(item ->> 'pax'\)::integer\).*p_guest_count/s);
  assert.match(migration, /count\(distinct public\.normalize_booking_capacity_zone/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /reserve_corporate_multi_zone_entitlement/);
  assert.match(migration, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(migration, /CORPORATE_MULTI_ZONE_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /revoke all on function public\.reserve_corporate_multi_zone_entitlement[\s\S]*anon, authenticated/);
});

test("Floor planning and assignment remain zone-bound while booking pax stays singular", async () => {
  const [floorRoute, migration, page, editor] = await Promise.all([
    source("../app/api/admin/floor-capacity-plan/route.ts"),
    source("../../supabase/migrations/20260909110000_phase_41_1p_multi_zone_corporate_entitlements.sql"),
    source("../app/admin/page.tsx"),
    source("../app/admin/CorporateZoneEntitlementEditor.tsx"),
  ]);
  assert.match(floorRoute, /zone_entitlements/);
  assert.match(floorRoute, /entitlement\.pax/);
  assert.match(floorRoute, /assign_corporate_booking_zone_tables_atomic/);
  assert.match(migration, /CROSS_ZONE_TABLE_ASSIGNMENT/);
  assert.match(migration, /v_combined_capacity<v_entitlement_pax/);
  assert.match(editor, /totalPax/);
  assert.match(page, /CorporateZoneEntitlementEditor/);
  assert.doesNotMatch(page, /Post-booking split editing is not available/);
});

test("multi-zone conversion preserves one booking, payment, ticket, and silent side effects", async () => {
  const [bookingRoute, conversionRoute] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source("../app/api/admin/corporate-requests/convert/route.ts"),
  ]);
  assert.match(bookingRoute, /reserve_corporate_multi_zone_entitlement/);
  assert.match(bookingRoute, /zoneEntitlements: undefined/);
  assert.match(conversionRoute, /booking\.zoneEntitlements\?\.length/);
  assert.doesNotMatch(conversionRoute, /payfast|communications/i);
});
