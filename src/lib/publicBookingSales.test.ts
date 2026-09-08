import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getPublicBookingCountdown,
  getPublicBookingSalesStatus,
  getPublicBookingSalesStatusFromConfiguration,
  isPublicBookingOpen,
  parseJohannesburgDateTimeInput,
  toJohannesburgDateTimeInput,
} from "./publicBookingSales.ts";

function settings() {
  return {
    operationalSettings: {
      publicBookings: {
        "cape-town": {
          enabled: true,
          opensAt: "2026-09-08T22:00:00.000Z",
        },
        johannesburg: { enabled: true, opensAt: null },
      },
    },
  } as never;
}

test("Cape Town public bookings are blocked before the SAST opening", () => {
  assert.equal(
    isPublicBookingOpen(
      settings(),
      "cape-town",
      new Date("2026-09-08T21:59:59.999Z"),
    ),
    false,
  );
});

test("Cape Town public bookings open exactly at midnight SAST", () => {
  assert.equal(
    isPublicBookingOpen(
      settings(),
      "cape-town",
      new Date("2026-09-08T22:00:00.000Z"),
    ),
    true,
  );
});

test("Cape Town public bookings remain open after the boundary", () => {
  assert.equal(
    getPublicBookingSalesStatus(
      settings(),
      "cape-town",
      new Date("2026-09-09T12:00:00.000Z"),
    ).state,
    "open",
  );
});

test("Johannesburg remains open", () => {
  assert.equal(isPublicBookingOpen(settings(), "johannesburg"), true);
});

test("future configured opening produces an absolute countdown", () => {
  assert.deepEqual(
    getPublicBookingCountdown(
      "2026-09-08T13:00:00.000Z",
      new Date("2026-09-08T10:45:23.000Z"),
    ),
    { hours: 2, minutes: 14, seconds: 37, totalSeconds: 8077 },
  );
});

test("SAST opening timestamp represents the same instant outside Johannesburg", () => {
  assert.deepEqual(
    getPublicBookingCountdown(
      "2026-09-08T13:00:00.000Z",
      new Date("2026-09-08T14:59:59+02:00"),
    ),
    { hours: 0, minutes: 0, seconds: 1, totalSeconds: 1 },
  );
});

test("countdown ends and configured venue becomes open at zero", () => {
  const publicBookings = settings().operationalSettings.publicBookings;
  publicBookings["cape-town"].opensAt = "2026-09-08T13:00:00.000Z";
  const opening = new Date("2026-09-08T13:00:00.000Z");

  assert.equal(
    getPublicBookingCountdown(publicBookings["cape-town"].opensAt, opening),
    null,
  );
  assert.equal(
    getPublicBookingSalesStatusFromConfiguration(
      publicBookings,
      "cape-town",
      opening,
    ).state,
    "open",
  );
});

test("countdown is generic for any future venue configuration", () => {
  const publicBookings = settings().operationalSettings.publicBookings;
  publicBookings.johannesburg.opensAt = "2026-10-01T15:00:00.000Z";

  assert.equal(
    getPublicBookingSalesStatusFromConfiguration(
      publicBookings,
      "johannesburg",
      new Date("2026-10-01T14:00:00.000Z"),
    ).state,
    "scheduled",
  );
});

test("Admin datetime input is converted using Africa/Johannesburg", () => {
  assert.equal(
    parseJohannesburgDateTimeInput("2026-09-09T00:00"),
    "2026-09-08T22:00:00.000Z",
  );
  assert.equal(
    toJohannesburgDateTimeInput("2026-09-08T22:00:00.000Z"),
    "2026-09-09T00:00",
  );
});

test("homepage countdown is server-seeded and keeps Find My Booking available", async () => {
  const [source, page, countdown] = await Promise.all([
    readFile(new URL("../app/LocationSelectionClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PublicBookingCountdown.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /PublicBookingCountdown/);
  assert.match(source, /isPublicBookingOpen/);
  assert.match(source, /Find My Booking/);
  assert.match(source, /seasonLabel: "MELANINA \| SEASON TWO"/);
  assert.match(source, /seasonLabel: "LA DOLCE ROYAL \| SEASON ONE"/);
  assert.match(source, /text-\[calc\(0\.67rem\+2px\)\]/);
  assert.match(source, /sm:text-\[calc\(0\.72rem\+2px\)\]/);
  assert.match(page, /loadServerVenueSettings/);
  assert.match(page, /initialPublicBookings/);
  assert.match(countdown, /Bookings Open In/);
  assert.match(countdown, /Hrs/);
  assert.match(countdown, /Mins/);
  assert.match(countdown, /Secs/);
  assert.doesNotMatch(countdown, /00\s*:\s*00\s*:\s*00/);
});

test("direct Cape Town booking route renders a blocked state", async () => {
  const source = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /getPublicBookingSalesStatus/);
  assert.match(
    source,
    /selectedEntryLocation \?\?[\s\S]*getShowVenueKey\(selectedShow\)/,
  );
  assert.match(source, /isPublicBookingBlocked/);
  assert.match(source, /Back to Venues/);
});

test("public booking API blocks before customer creation", async () => {
  const source = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const gateIndex = source.indexOf("PUBLIC_BOOKINGS_NOT_OPEN");
  const customerMutationIndex = source.indexOf(
    "const customerId = await upsertCustomer",
  );

  assert.ok(gateIndex > 0);
  assert.ok(customerMutationIndex > gateIndex);
  assert.match(source, /booking\.source === "online" && !isTrustedStaff/);
});

test("trusted Admin handoff is not blocked by the public gate", async () => {
  const source = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /verifyInternalBookingHandoff/);
  assert.match(source, /!isTrustedStaff/);
  assert.match(source, /requireActiveStaff\(request\)/);
});

test("Find My Booking and payment-link completion stay outside the gate", async () => {
  const [findBooking, paymentLink] = await Promise.all([
    readFile(new URL("../app/api/find-booking/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/payment-links/[token]/checkout/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(findBooking, /PUBLIC_BOOKINGS_NOT_OPEN/);
  assert.doesNotMatch(paymentLink, /PUBLIC_BOOKINGS_NOT_OPEN/);
});
