import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  filterEnabledSeatingZones,
  isConfiguredSeatingZoneEnabled,
} from "./seatingZoneLifecycle.ts";

test("zones default enabled for backward-compatible configuration", () => {
  assert.equal(isConfiguredSeatingZoneEnabled({ zonePricing: {} }, "elevated-stage"), true);
});

test("disabled zone is excluded without deleting its authoritative configuration", () => {
  const settings = {
    zonePricing: {
      "elevated-stage": { enabled: false },
      "golden-circle": { enabled: true },
    },
  };
  const zones = [{ id: "elevated-stage" }, { id: "golden-circle" }];

  assert.equal(isConfiguredSeatingZoneEnabled(settings, "elevated-stage"), false);
  assert.equal(
    filterEnabledSeatingZones(settings, zones).some((zone) => zone.id === "elevated-stage"),
    false,
  );
  assert.deepEqual(settings.zonePricing["elevated-stage"], { enabled: false });
});

test("database guard rejects only newly introduced disabled-zone entitlements", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260917120000_phase_41_2p_seating_zone_lifecycle.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /SEATING_ZONE_DISABLED\|%s/);
  assert.match(migration, /not exists[\s\S]*old\.section, old\.zone_entitlements/);
  assert.match(migration, /bookings_seating_zone_lifecycle_guard/);
  assert.match(migration, /corporate_requests_seating_zone_lifecycle_guard/);
  assert.match(migration, /historical_dineplan_import/);
});

test("all new-selection surfaces consume lifecycle-filtered zones", () => {
  const publicBooking = readFileSync(new URL("../app/book/page.tsx", import.meta.url), "utf8");
  const corporate = readFileSync(new URL("../app/corporate/page.tsx", import.meta.url), "utf8");
  const conversion = readFileSync(new URL("../app/admin/CorporateConversionModal.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../app/admin/CorporateZoneEntitlementEditor.tsx", import.meta.url), "utf8");

  assert.match(publicBooking, /enabledSeatingZones\.map/);
  assert.match(corporate, /enabledSeatingZones\.map/);
  assert.match(conversion, /enabledZoneIds\.includes/);
  assert.match(editor, /enabledZoneIds\.includes/);
});
