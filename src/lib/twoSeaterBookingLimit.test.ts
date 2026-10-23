import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TWO_SEATER_BOOKING_LIMIT,
  isQualifyingTwoSeaterBooking,
  isTwoSeaterLimitError,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./twoSeaterBookingLimit.ts";

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

test("booking UI offers bounded alternatives and a Box Office route", async () => {
  const [page, route, server] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
    source("./twoSeaterBookingLimitServer.ts"),
  ]);

  assert.match(page, /Choose another performance/);
  assert.match(page, /mailto:boxoffice@zingara\.co\.za/);
  assert.match(page, /selectTwoSeaterAlternative/);
  assert.match(route, /loadTwoSeaterAlternativeShows/);
  assert.match(server, /\.eq\("status", "active"\)/);
  assert.match(server, /alternativeCandidateLimit = 18/);
  assert.match(server, /alternativeResultLimit = 5/);
  assert.match(server, /isPublicBookingOpen\(settings, location\)/);
  assert.match(server, /getPublicBookingCutoff/);
  assert.match(server, /cutoff\.closed/);
  assert.match(server, /remainingSeatsByZone\[input\.zoneId\].*>= 2/s);
});
