import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TWO_SEATER_BOOKING_LIMIT,
  getTwoSeaterAlternativeContinuation,
  isQualifyingTwoSeaterBooking,
  isTwoSeaterLimitError,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./twoSeaterBookingLimit.ts";
import {
  canOverrideTwoSeaterLimit,
  normalizeTwoSeaterOverrideReason,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./twoSeaterOverrideServer.ts";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("only active, non-archived two-guest bookings qualify", () => {
  assert.equal(TWO_SEATER_BOOKING_LIMIT, 20);
  assert.equal(
    isQualifyingTwoSeaterBooking({
      archivedAt: null,
      guestCount: 2,
      status: "confirmed",
    }),
    true,
  );
  assert.equal(
    isQualifyingTwoSeaterBooking({
      archivedAt: null,
      guestCount: 4,
      status: "confirmed",
    }),
    false,
  );
  assert.equal(
    isQualifyingTwoSeaterBooking({
      archivedAt: null,
      guestCount: 2,
      status: "cancelled",
    }),
    false,
  );
  assert.equal(
    isQualifyingTwoSeaterBooking({
      archivedAt: "2026-10-23T10:00:00Z",
      guestCount: 2,
      status: "confirmed",
    }),
    false,
  );
});

test("database guard preserves existing bookings and serialises new claims", async () => {
  const migration = await source(
    "../../supabase/migrations/20261023103000_p0_two_seater_booking_limit.sql",
  );

  assert.match(migration, /v_limit constant integer := 20/);
  assert.match(migration, /new\.guest_count = 2/);
  assert.match(
    migration,
    /'new', 'confirmed', 'pending_payment', 'checked_in'/,
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_current_count >= v_limit/);
  assert.match(migration, /v_old_qualifies and old\.show_id = new\.show_id/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.bookings/i);
  assert.doesNotMatch(migration, /update\s+public\.bookings/i);
});

test("19 allows the twentieth claim while 20 blocks the twenty-first", async () => {
  const migration = await source(
    "../../supabase/migrations/20261023103000_p0_two_seater_booking_limit.sql",
  );

  assert.match(migration, /if v_current_count >= v_limit then/);
  assert.equal(19 >= TWO_SEATER_BOOKING_LIMIT, false);
  assert.equal(20 >= TWO_SEATER_BOOKING_LIMIT, true);
  assert.equal(21 >= TWO_SEATER_BOOKING_LIMIT, true);
});

test("limit errors are detected without exposing database details", () => {
  assert.equal(
    isTwoSeaterLimitError(
      new Error("TWO_SEATER_BOOKING_LIMIT_REACHED|20|20"),
    ),
    true,
  );
  assert.equal(isTwoSeaterLimitError(new Error("ZONE_CAPACITY_EXCEEDED")), false);
});

test("alternative selection resumes the furthest valid booking step", () => {
  assert.deepEqual(
    getTwoSeaterAlternativeContinuation({
      customerDetailsComplete: true,
      hasSelectedZone: true,
    }),
    { activeBookingStep: 4, isConfirmationOpen: true },
  );
  assert.deepEqual(
    getTwoSeaterAlternativeContinuation({
      customerDetailsComplete: false,
      hasSelectedZone: true,
    }),
    { activeBookingStep: 3, isConfirmationOpen: false },
  );
  assert.deepEqual(
    getTwoSeaterAlternativeContinuation({
      customerDetailsComplete: true,
      hasSelectedZone: false,
    }),
    { activeBookingStep: 2, isConfirmationOpen: false },
  );
});

test("booking UI offers bounded alternatives and a Box Office route", async () => {
  const [page, route, server] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
    source("./twoSeaterBookingLimitServer.ts"),
  ]);

  assert.match(page, /Choose another performance/);
  assert.match(page, /mailto:boxoffice@zingara\.co\.za/);
  assert.match(page, /selectTwoSeaterAlternative/);
  assert.match(page, /setAlternativeCalendarBookingContext\(nextContext\)/);
  assert.match(page, /getTwoSeaterAlternativeContinuation/);
  assert.match(route, /loadTwoSeaterAlternativeShows/);
  assert.match(server, /\.eq\("status", "active"\)/);
  assert.match(server, /alternativeCandidateLimit = 18/);
  assert.match(server, /alternativeResultLimit = 5/);
  assert.match(server, /isPublicBookingOpen\(settings, location\)/);
  assert.match(server, /getPublicBookingCutoff/);
  assert.match(server, /cutoff\.closed/);
  assert.match(server, /remainingSeatsByZone\[input\.zoneId\].*>= 2/s);
});

test("only authorised Box Office roles may request an override", () => {
  assert.equal(canOverrideTwoSeaterLimit("box-office"), true);
  assert.equal(canOverrideTwoSeaterLimit("box-office-manager"), true);
  assert.equal(canOverrideTwoSeaterLimit("box-office-staff"), true);
  assert.equal(canOverrideTwoSeaterLimit("super-admin"), true);
  assert.equal(canOverrideTwoSeaterLimit("venue-manager"), false);
  assert.equal(canOverrideTwoSeaterLimit(null), false);
  assert.equal(normalizeTwoSeaterOverrideReason("  approved exception  "), "approved exception");
});

test("override is private, short-lived, atomic and audited", async () => {
  const migration = await source(
    "../../supabase/migrations/20261026153000_p0_two_seater_box_office_override.sql",
  );

  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '10 minutes'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_current_count < v_limit/);
  assert.match(migration, /for update/);
  assert.match(migration, /booking\.two-seater-limit-override/);
  assert.match(migration, /v_override\.reason/);
  assert.match(migration, /actor_staff_profile_id/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.bookings/i);
  assert.doesNotMatch(migration, /update\s+public\.bookings/i);
});

test("public creation remains strict while internal paths expose an authorised retry", async () => {
  const [bookingRoute, adminRoute, reconciliationRoute, page] =
    await Promise.all([
      source("../app/api/bookings/route.ts"),
      source("../app/api/admin/bookings/route.ts"),
      source("../app/api/admin/bookings/reconciliation/route.ts"),
      source("../app/book/page.tsx"),
    ]);

  assert.match(
    bookingRoute,
    /!isTrustedInternalHandoff \|\| !twoSeaterOverrideAllowed/,
  );
  assert.match(bookingRoute, /validateBookingCapacityIncrease[\s\S]*authorizeTwoSeaterLimitOverride/);
  assert.match(adminRoute, /persistBookingShowTransfer[\s\S]*authorizeTwoSeaterLimitOverride/);
  assert.match(adminRoute, /persistBookingStateUpdate[\s\S]*authorizeTwoSeaterLimitOverride/);
  assert.match(reconciliationRoute, /authorizeTwoSeaterLimitOverride/);
  assert.match(page, /Override Limit/);
  assert.match(page, /Why is this exception required\?/);
});
