import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseCorporateZoneEntitlementEdit,
  validateCorporateZoneEntitlements,
} from "./corporateZoneEntitlements.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("single-zone Corporate allocation can become Allison's exact 36 PB plus 10 MR split", () => {
  assert.deepEqual(
    parseCorporateZoneEntitlementEdit(
      [
        { pax: "36", zoneId: "royal-booths" },
        { pax: "10", zoneId: "middle-ring" },
      ],
      46,
    ),
    [
      { pax: 36, zoneId: "royal-booths" },
      { pax: 10, zoneId: "middle-ring" },
    ],
  );
});

test("under, over, duplicate, and invalid allocations fail closed while zero-pax rows are removed", () => {
  assert.match(validateCorporateZoneEntitlements([{ pax: "45", zoneId: "royal-booths" }], 46)!, /equal 46/);
  assert.match(validateCorporateZoneEntitlements([{ pax: "47", zoneId: "royal-booths" }], 46)!, /equal 46/);
  assert.match(validateCorporateZoneEntitlements([
    { pax: "36", zoneId: "royal-booths" },
    { pax: "10", zoneId: "royal-booths" },
  ], 46)!, /only once/);
  assert.deepEqual(parseCorporateZoneEntitlementEdit([
    { pax: "46", zoneId: "royal-booths" },
    { pax: "0", zoneId: "middle-ring" },
  ], 46), [{ pax: 46, zoneId: "royal-booths" }]);
});

test("Booking Details uses a local multi-zone editor and leaves Standard booking movement unchanged", async () => {
  const [component, page] = await Promise.all([
    source("../app/admin/CorporateZoneEntitlementEditor.tsx"),
    source("../app/admin/page.tsx"),
  ]);
  assert.match(component, /useState<CorporateZoneEntitlementDraft\[\]>\(initialDraft\)/);
  assert.match(component, /Allocated \{allocatedPax\} \/ \{totalPax\}/);
  assert.match(component, /Remaining \{totalPax - allocatedPax\}/);
  assert.match(component, /SAVE SEATING ALLOCATION/);
  assert.match(component, /inFlightRef\.current/);
  assert.match(component, /A zone with assigned tables cannot be removed/);
  assert.match(page, /isCorporateBooking \? \(\s*<CorporateZoneEntitlementEditor/s);
  assert.match(page, /<BookingMoveTargetOptions tables=\{moveTables\}/);
});

test("protected route enforces permission, venue scope, stale state, and useful operational errors", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  assert.match(route, /update-corporate-zone-entitlements/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /bookings:manage/);
  assert.match(route, /outside your assigned location/);
  assert.match(route, /CORPORATE_ZONE_ENTITLEMENTS_STALE/);
  assert.match(route, /does not currently have enough operational capacity/);
  assert.match(route, /Existing table assignments are not compatible/);
});

test("database save is one atomic entitlement update with zone capacity and table-claim guards", async () => {
  const migration = await source("../../supabase/migrations/20260911120000_phase_41_2e_edit_corporate_zone_entitlements.sql");
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /booking_capacity_zone_effective_limit/);
  assert.match(migration, /b\.id <> v_booking\.id/);
  assert.match(migration, /CORPORATE_ZONE_TABLE_CONFLICT/);
  assert.match(migration, /CORPORATE_ZONE_PRIMARY_TABLE_INVALID/);
  assert.match(migration, /set section = v_primary_section,\s*zone_entitlements = v_normalized/s);
  assert.doesNotMatch(migration, /update public\.show_tables set/);
});

test("save is idempotent, audit-only-on-change, and service-role controlled", async () => {
  const migration = await source("../../supabase/migrations/20260911120000_phase_41_2e_edit_corporate_zone_entitlements.sql");
  const idempotentIndex = migration.indexOf("'idempotent',true");
  const updateIndex = migration.indexOf("update public.bookings");
  const auditIndex = migration.indexOf("insert into public.audit_events");
  assert.ok(idempotentIndex > 0 && idempotentIndex < updateIndex);
  assert.ok(updateIndex < auditIndex);
  assert.match(migration, /booking\.corporate-zone-entitlements-updated/);
  assert.match(migration, /revoke all on function[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});

test("the transaction cannot reprice or mutate payments, tickets, QR, Wallet, or table claims", async () => {
  const migration = await source("../../supabase/migrations/20260911120000_phase_41_2e_edit_corporate_zone_entitlements.sql");
  const update = migration.slice(migration.indexOf("update public.bookings"), migration.indexOf("insert into public.audit_events"));
  assert.doesNotMatch(update, /total_amount|amount_paid|balance_outstanding|service_fee|subtotal_amount|discount_amount/);
  assert.doesNotMatch(migration, /update public\.(payments|tickets|show_tables|customers|communications)/);
  assert.doesNotMatch(migration, /serial|barcode|qr|payfast/i);
});

test("existing booking-grain reporting keeps pax and financials singular", async () => {
  const reporting = await source("./operationalReporting.ts");
  assert.match(reporting, /buildBookingGrainReportRows/);
  assert.match(reporting, /booking\.partySize/);
  assert.match(reporting, /zoneEntitlements/);
  assert.doesNotMatch(
    await source("../../supabase/migrations/20260911120000_phase_41_2e_edit_corporate_zone_entitlements.sql"),
    /insert into public\.bookings/,
  );
});
