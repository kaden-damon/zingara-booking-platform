import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getPublicBookingSalesStatus,
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

test("homepage keeps Cape Town visible but removes its booking link", async () => {
  const source = await readFile(
    new URL("../app/LocationSelectionClient.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Bookings Open/);
  assert.match(source, /isPublicBookingOpen \?/);
  assert.match(source, /Find My Booking/);
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
