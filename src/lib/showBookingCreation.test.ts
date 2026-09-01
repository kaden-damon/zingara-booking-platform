import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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

test("Standard and Corporate use the same acquired show lock", () => {
  const standard = new URL(
    `https://book.zingara.co.za${buildCalendarBookingHref({ bookingType: "standard", context })}`,
  );
  const corporate = new URL(
    `https://book.zingara.co.za${buildCalendarBookingHref({ bookingType: "corporate", context })}`,
  );

  assert.equal(standard.searchParams.get("showLockId"), context.lockId);
  assert.equal(corporate.searchParams.get("showLockId"), context.lockId);
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

test("incomplete calendar lock context fails closed", () => {
  assert.equal(hasValidCalendarBookingContext(context), true);
  assert.equal(
    hasValidCalendarBookingContext({ ...context, lockId: "" }),
    false,
  );
});

test("server verifies purpose, owner, freshness, show snapshot and releases on success", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /Full Name and a valid Pax value are required/);
  assert.match(route, /\.eq\("lock_purpose", "booking-creation"\)/);
  assert.match(route, /\.eq\("staff_profile_id", auth\.staffProfile\.id\)/);
  assert.match(route, /\.gte\("last_activity_at", staleBefore\)/);
  assert.match(route, /lockedShow\.date !== calendarBookingContext\.expectedDate/);
  assert.match(route, /reason: "booking-created"/);
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
