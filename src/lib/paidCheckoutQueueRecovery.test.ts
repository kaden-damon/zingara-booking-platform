import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildZoneFloorCapacityPlan, getCorporateZoneAvailability } from "./corporateFloorPlanning.ts";

const sql = readFileSync("supabase/migrations/20261123180000_authorised_paid_checkout_queue_recovery.sql", "utf8");

test("paid checkout recovery is restricted to the expressly authorised identity and payment", () => {
  assert.match(sql, /old\.id = '903ca00a-0e97-4a4a-a102-d13a17dcc619'/);
  assert.match(sql, /old\.booking_reference = 'ZNG-X94SUT'/);
  assert.match(sql, /p\.provider_transaction_id = '341736879' and p\.amount = 6160/);
  assert.match(sql, /transaction_id' = txid_current\(\)::text/);
  assert.match(sql, /BOOKING_REVISION_CHANGED/);
  assert.match(sql, /BOOKING_EDIT_LOCK_ACTIVE/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /grant execute.*to service_role/);
  assert.doesNotMatch(sql, /disable trigger|session_replication_role|update public\.payments|insert into public\.communications/i);
});

test("four restored guests remain demand, not extra approved or sellable seats", () => {
  const plan = buildZoneFloorCapacityPlan({
    activeEntitlementPax: 153, zoneCapacity: 149, zoneId: "golden-circle",
    allowedTemporaryCapacities: [], availableTables: [], capacityRequiredPhysicalTables: 0,
    claimedReservedCapacity: 149,
    queuedBookings: [{ id: "recovery", reference: "ZNG-X94SUT", pax: 4, isCorporate: false }],
  });
  assert.equal(plan.activeEntitlementPax, 153);
  assert.equal(plan.zoneCapacity, 149);
  assert.equal(plan.queuedPax, 4);
  assert.equal(plan.zoneCapacityInsufficient, true);
  const availability = getCorporateZoneAvailability({
    activeBookings: [{ bookingId: "committed", pax: 153, zoneId: "golden-circle" }],
    bookingId: "new-booking", bookingPax: 1,
    zoneCapacities: { "golden-circle": 149, "middle-ring": 133, "royal-booths": 138, "royal-balcony": 40 },
  }).find((zone) => zone.zoneId === "golden-circle");
  assert.equal(availability?.eligible, false);
});

test("recovery does not change the existing ordinary capacity enforcement body", () => {
  const prior = readFileSync("supabase/migrations/20260928200000_phase_41_2y_p0_j_guest_reduction_legacy_allocation.sql", "utf8");
  const oldBody = prior.slice(prior.indexOf("  if new.archived_at is not null"), prior.indexOf("create or replace function public.reconcile_imported_booking_financials_atomic"));
  const newBody = sql.slice(sql.indexOf("  if new.archived_at is not null"), sql.indexOf("create or replace function public.recover_authorised_paid_checkout_queue_atomic"));
  const normalize = (value: string) => value.replace(/--[^\n]*/g, "").replace(/\s+/g, "");
  assert.equal(normalize(newBody), normalize(oldBody));
});
