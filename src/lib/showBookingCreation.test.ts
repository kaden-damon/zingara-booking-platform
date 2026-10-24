import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAlternativeCalendarBookingContext,
  buildCalendarBookingHref,
  canReuseShowLock,
  hasValidCalendarBookingContext,
} from "./showBookingCreation.ts";

const context = {
  expectedDate: "2026-10-17",
  expectedLocation: "johannesburg",
  expectedTime: "18:00",
  lockId: "lock-1",
  sessionId: "session-a",
  showReference: "show-2026-10-17-1800",
};

test("calendar booking links preserve the exact show and lock context", () => {
  const href = buildCalendarBookingHref({ bookingType: "standard", context });
  const params = new URL(`https://book.zingara.co.za${href}`).searchParams;

  assert.equal(params.get("showId"), context.showReference);
  assert.equal(params.get("expectedDate"), context.expectedDate);
  assert.equal(params.get("expectedTime"), context.expectedTime);
  assert.equal(params.get("expectedLocation"), context.expectedLocation);
  assert.equal(params.get("showLockId"), context.lockId);
  assert.equal(params.get("showLockSession"), context.sessionId);
});

test("alternative performances replace the immutable staff show snapshot without reusing a lock", () => {
  const alternative = buildAlternativeCalendarBookingContext({
    date: "2026-10-24",
    location: "cape-town",
    showReference: "show-2026-10-24-1800",
    time: "18:00",
  });

  assert.deepEqual(alternative, {
    expectedDate: "2026-10-24",
    expectedLocation: "cape-town",
    expectedTime: "18:00",
    showReference: "show-2026-10-24-1800",
  });
  assert.equal(alternative.lockId, undefined);
  assert.equal(alternative.sessionId, undefined);
  assert.equal(hasValidCalendarBookingContext(alternative), true);
});

test("Standard and Corporate preserve show context without a shared creation lock", () => {
  const unlockedContext = {
    expectedDate: context.expectedDate,
    expectedLocation: context.expectedLocation,
    expectedTime: context.expectedTime,
    showReference: context.showReference,
  };
  const standard = new URL(
    `https://book.zingara.co.za${buildCalendarBookingHref({ bookingType: "standard", context: unlockedContext })}`,
  );
  const corporate = new URL(
    `https://book.zingara.co.za${buildCalendarBookingHref({ bookingType: "corporate", context: unlockedContext })}`,
  );

  assert.equal(standard.searchParams.get("showLockId"), null);
  assert.equal(corporate.searchParams.get("showLockId"), null);
  assert.equal(corporate.searchParams.get("bookingType"), "corporate");
});

test("duplicate clicks reuse only the same purpose and same browser session", () => {
  assert.equal(
    canReuseShowLock({
      existingPurpose: "booking-creation",
      existingSessionId: "one",
      requestedPurpose: "booking-creation",
      requestedSessionId: "one",
    }),
    true,
  );
  assert.equal(
    canReuseShowLock({
      existingPurpose: "booking-creation",
      existingSessionId: "one",
      requestedPurpose: "booking-creation",
      requestedSessionId: "two",
    }),
    false,
  );
  assert.equal(
    canReuseShowLock({
      existingPurpose: "show-edit",
      existingSessionId: "one",
      requestedPurpose: "booking-creation",
      requestedSessionId: "one",
    }),
    false,
  );
});

test("heartbeat and insert races cannot transfer a lock to another tab", async () => {
  const route = await readFile(
    new URL("../app/api/admin/show-locks/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /\.eq\("session_id", sessionId\)/);
  assert.doesNotMatch(route, /session_id: body\.sessionId/);
  assert.match(route, /const ownsLatestLock =/);
  assert.match(route, /status: ownsLatestLock \? "acquired" : "blocked"/);
});

test("calendar context requires the immutable show snapshot, not a creation lock", () => {
  assert.equal(hasValidCalendarBookingContext(context), true);
  assert.equal(
    hasValidCalendarBookingContext({ ...context, lockId: "", sessionId: "" }),
    true,
  );
  assert.equal(hasValidCalendarBookingContext({ ...context, expectedDate: "" }), false);
});

test("explicit locked-show location overrides query and stored venue context", async () => {
  const page = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );
  const expectedLocation = page.indexOf(
    'normalizeShowLocation(searchParams.get("expectedLocation"))',
  );
  const queryLocation = page.indexOf(
    'normalizeShowLocation(searchParams.get("location"))',
  );
  const storedLocation = page.indexOf(
    'window.localStorage.getItem("zingara-selected-location")',
  );

  assert.ok(expectedLocation > -1);
  assert.ok(queryLocation > expectedLocation);
  assert.ok(storedLocation > queryLocation);
});

test("booking entry location uses the shared venue normalizer", async () => {
  const demo = await readFile(
    new URL("./zingaraDemo.ts", import.meta.url),
    "utf8",
  );

  assert.match(demo, /normalisedValue === "jhb"/);
  assert.match(demo, /normalisedValue === "cpt"/);
  assert.match(demo, /normalisedValue === "cape-town"/);
  assert.match(demo, /normalisedValue === "johannesburg"/);
});

test("staff operational show inventory uses the authenticated API client", async () => {
  const shows = await readFile(
    new URL("./supabase/shows.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    shows,
    /if \(options\.operational\)[\s\S]+fetchSupabaseApi<[\s\S]+\/api\/shows\?scope=operational/,
  );
  assert.match(shows, /fetch\(\s*"\/api\/shows"/);
});

test("exact show resolution declares staff checkout ready without a shared lock", async () => {
  const page = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /lockedShow\.date !== lockContext\.expectedDate[\s\S]+lockedShow\.time !== lockContext\.expectedTime[\s\S]+lockedLocation !== lockContext\.expectedLocation/,
  );
});

test("server verifies the authoritative show snapshot without serialising creators", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /Full Name and a valid Pax value are required/);
  assert.match(route, /lockedShow\.date !== calendarBookingContext\.expectedDate/);
  assert.doesNotMatch(route, /Your show booking lock has expired/);
  assert.doesNotMatch(route, /reason: "booking-created"/);
});

test("three staff booking journeys for one show remain independent", () => {
  const unlockedContext = {
    expectedDate: context.expectedDate,
    expectedLocation: context.expectedLocation,
    expectedTime: context.expectedTime,
    showReference: context.showReference,
  };
  const journeys = ["fatima", "michael", "sharon"].map(() =>
    new URL(
      `https://book.zingara.co.za${buildCalendarBookingHref({ bookingType: "standard", context: unlockedContext })}`,
    ),
  );

  assert.equal(journeys.length, 3);
  for (const journey of journeys) {
    assert.equal(journey.searchParams.get("showId"), context.showReference);
    assert.equal(journey.searchParams.get("showLockId"), null);
    assert.equal(journey.searchParams.get("showLockSession"), null);
  }
});

test("public booking route remains independent from staff show locks", async () => {
  const route = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(route, /show_edit_locks/);
  assert.match(route, /reserve_public_booking_(?:table|entitlement)/);
});

test("calendar checkout keeps atomic capacity, table and custom-price paths", async () => {
  const route = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /resolveCustomPricedTemporaryTable/);
  assert.match(route, /reservePublicBookingAtomically/);
  assert.match(route, /CUSTOM_PRICED_TEMPORARY_TABLE_UNAVAILABLE/);
});

test("customer lookup requires email or a plausible phone and never name alone", async () => {
  const route = await readFile(
    new URL("../app/api/admin/customers/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /normalizedEmail\.includes\("@"\)/);
  assert.match(route, /normalizedPhone\.length < 7/);
  assert.doesNotMatch(route, /ilike\("first_name"/);
});

test("calendar corporate checkout reuses corporate-direct provenance", async () => {
  const page = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /isCorporateCalendarCheckout\s*\? "corporate-direct"/);
  assert.match(page, /`Company: \$\{corporateCompany\.trim\(\)\}`/);
});

test("show edit writes reject booking-creation locks", async () => {
  const route = await readFile(
    new URL("../app/api/admin/shows/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /lock\.lock_purpose !== "show-edit"/);
});
