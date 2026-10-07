import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateCorporateBuyoutCommercials,
  isActiveCorporateBuyoutState,
  validateCorporateBuyoutGuestTerms,
} from "./corporateBuyouts.ts";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

const packages = [
  [590000, 73750, 88500, 752250],
  [655600, 81950, 98340, 835890],
  [742500, 92812.5, 111375, 946687.5],
] as const;

test("the three fixed packages reconcile exactly", () => {
  for (const [base, gratuity, vat, total] of packages) {
    assert.equal(base + gratuity + vat, total);
    assert.equal(
      calculateCorporateBuyoutCommercials({
        guestCount: 250,
        package: {
          baseAmount: base,
          gratuityAmount: gratuity,
          includedGuestCount: 400,
          maximumGuestCount: null,
          totalAmount: total,
          vatAmount: vat,
        },
      }).totalAmount,
      total,
    );
  }
});

test("250 and 400 guests retain the full fixed package price", () => {
  const packageRow = {
    baseAmount: 590000,
    gratuityAmount: 73750,
    includedGuestCount: 400,
    maximumGuestCount: null,
    totalAmount: 752250,
    vatAmount: 88500,
  };
  assert.equal(calculateCorporateBuyoutCommercials({ guestCount: 250, package: packageRow }).totalAmount, 752250);
  assert.equal(calculateCorporateBuyoutCommercials({ guestCount: 400, package: packageRow }).totalAmount, 752250);
});

test("guests above 400 fail closed without approved quote terms", () => {
  assert.equal(
    validateCorporateBuyoutGuestTerms({
      guestCount: 401,
      includedGuestCount: 400,
      maximumGuestCount: null,
      additionalGuestRate: null,
    }),
    "Add the approved extra-guest rate and maximum to the quote before continuing.",
  );
  assert.equal(
    validateCorporateBuyoutGuestTerms({
      guestCount: 421,
      includedGuestCount: 400,
      maximumGuestCount: 420,
      additionalGuestRate: 1500,
    }),
    "This quote allows up to 420 guests.",
  );
});

test("only active lifecycle states block public sale", () => {
  for (const state of ["provisional", "awaiting_payment", "fully_paid", "confirmed"]) {
    assert.equal(isActiveCorporateBuyoutState(state), true);
  }
  assert.equal(isActiveCorporateBuyoutState("released"), false);
  assert.equal(isActiveCorporateBuyoutState("cancelled"), false);
});

test("migration creates one booking and one buyout with immutable snapshots", async () => {
  const migration = await source("../../supabase/migrations/20261007220000_phase_48_corporate_full_show_buyouts.sql");
  assert.match(migration, /insert into public\.bookings[\s\S]*insert into public\.corporate_buyouts/);
  assert.doesNotMatch(migration, /insert into public\.bookings[\s\S]*insert into public\.bookings/);
  assert.match(migration, /package_snapshot jsonb not null/);
  assert.match(migration, /commercialModel', 'fixed-buyout-package'/);
  assert.match(migration, /corporate_buyouts_one_active_show_idx/);
  assert.match(migration, /corporate_buyouts_idempotency_key_idx/);
});

test("creation blocks existing entitlement and validates total operational capacity", async () => {
  const migration = await source("../../supabase/migrations/20261007220000_phase_48_corporate_full_show_buyouts.sql");
  assert.match(migration, /BUYOUT_SHOW_HAS_BOOKINGS/);
  assert.match(migration, /booking_status::text in \('new', 'confirmed', 'pending_payment', 'checked_in'\)/);
  assert.match(migration, /booking_capacity_zone_effective_limit/);
  assert.match(migration, /BUYOUT_OPERATIONAL_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(migration, /update public\.venue_settings/);
});

test("public availability and database insert boundaries both block an active buyout", async () => {
  const [availability, migration, route] = await Promise.all([
    source("./supabase/publicShowAvailability.ts"),
    source("../../supabase/migrations/20261007220000_phase_48_corporate_full_show_buyouts.sql"),
    source("../app/api/shows/route.ts"),
  ]);
  assert.match(availability, /corporate_buyouts/);
  assert.match(availability, /showPubliclyBookable[\s\S]*!hasFullShowBuyout/);
  assert.match(migration, /bookings_public_buyout_guard/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(route, /loadActiveCorporateBuyoutSummaries/);
});

test("unknown zone allocation remains explicit and never creates four bookings", async () => {
  const migration = await source("../../supabase/migrations/20261007220000_phase_48_corporate_full_show_buyouts.sql");
  assert.match(migration, /allocated_guest_count \+ unallocated_guest_count = current_guest_count/);
  assert.match(migration, /'Full Show Buyout', null/);
  assert.match(migration, /zone_allocations = coalesce/);
  assert.doesNotMatch(migration, /guest_count\s*\/\s*4/);
});

test("ticket identities are deferred and only missing approved identities are issued", async () => {
  const migration = await source("../../supabase/migrations/20261007220000_phase_48_corporate_full_show_buyouts.sql");
  assert.match(migration, /'ticketIssuanceDeferred', true/);
  assert.match(migration, /issue_corporate_buyout_tickets_atomic/);
  assert.match(migration, /where not exists \(select 1 from public\.tickets/);
  assert.match(migration, /p_ticket_entitlement_count > v_before\.current_guest_count/);
});

test("release is explicit, revision checked, audited, and payment safe", async () => {
  const migration = await source("../../supabase/migrations/20261007220000_phase_48_corporate_full_show_buyouts.sql");
  assert.match(migration, /release_corporate_buyout_atomic/);
  assert.match(migration, /v_before\.revision <> p_expected_revision/);
  assert.match(migration, /BUYOUT_RELEASE_PAYMENT_REVIEW_REQUIRED/);
  assert.match(migration, /corporate\.buyout\.released/);
  assert.match(migration, /cancel_booking_atomic/);
});

test("payment-driven confirmation is state-safe and independently audited", async () => {
  const migration = await source("../../supabase/migrations/20261007223000_phase_48_buyout_payment_state_audit.sql");
  assert.match(migration, /new\.amount_paid >= new\.total_amount/);
  assert.match(migration, /new\.balance_outstanding = 0/);
  assert.match(migration, /new\.payment_status::text = 'fully_paid'/);
  assert.match(migration, /state in \('provisional','awaiting_payment','fully_paid'\)/);
  assert.match(migration, /corporate\.buyout\.payment_confirmed/);
  assert.match(migration, /insert into public\.audit_events/);
});

test("package configuration supports effective dates and audited version changes", async () => {
  const migration = await source("../../supabase/migrations/20261007224500_phase_48_buyout_package_lifecycle_audit.sql");
  assert.match(migration, /active_from timestamptz/);
  assert.match(migration, /active_until timestamptz/);
  assert.match(migration, /corporate_buyout_packages_active_window_check/);
  assert.match(migration, /corporate\.buyout\.package\.updated/);
  assert.match(migration, /corporate\.buyout\.package\.installed/);
  assert.match(migration, /Disputed terms remain unset/);
});

test("staff UI moves Buyout creation to the selected calendar show", async () => {
  const [ui, admin, route] = await Promise.all([
    source("../app/admin/CorporateBuyoutCreator.tsx"),
    source("../app/admin/page.tsx"),
    source("../app/api/admin/corporate-buyouts/route.ts"),
  ]);
  assert.doesNotMatch(ui, /Choose performance/);
  assert.doesNotMatch(ui, />Group Booking</);
  assert.match(admin, /href="\/book\?staffCheckout=1&bookingType=corporate"/);
  assert.match(admin, /setIsCalendarBuyoutOpen\(true\)/);
  assert.match(admin, /id: calendarBookingShow\.supabaseId \?\? calendarBookingShow\.id/);
  assert.match(ui, /Venue/);
  assert.match(ui, /Date/);
  assert.match(ui, /Time/);
  assert.match(ui, /aria-label="Create Company and Contact"/);
  assert.match(ui, /Review Bookings/);
  assert.match(route, /\.eq\("show_id", showId\)/);
  assert.match(ui, /Create this Full Show Buyout\?/);
  assert.match(ui, /Public booking will close for this performance\. Existing bookings will not be changed\./);
  assert.match(ui, /onClick=\{\(\) => setConfirming\(false\)\}/);
});

test("selected-show bootstrap remains bounded and release management remains available", async () => {
  const [route, client, manager] = await Promise.all([
    source("../app/api/admin/corporate-buyouts/route.ts"),
    source("./supabase/corporateBuyouts.ts"),
    source("../app/admin/CorporateBuyoutManager.tsx"),
  ]);
  assert.match(client, /\?showId=/);
  assert.match(route, /if \(showId\)[\s\S]*\.eq\("id", showId\)/);
  assert.match(route, /activeBookingCount: conflicts\.length/);
  assert.match(route, /activeGuestCount: conflicts\.reduce/);
  assert.match(manager, /Active Full Show Buyouts/);
  assert.match(manager, /releaseCorporateBuyout/);
});

test("show and public calendar surfaces display the dedicated Buyout state", async () => {
  const [admin, publicPage] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/book/page.tsx"),
  ]);
  assert.match(admin, /show\.fullShowBuyout/);
  assert.match(admin, /Full Show Buyout/);
  assert.match(publicPage, /"full-show-buyout": "Full Show Buyout"/);
  assert.match(publicPage, /show\.fullShowBuyout/);
});
