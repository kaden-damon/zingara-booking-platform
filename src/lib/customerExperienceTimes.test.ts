import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getCustomerExperienceTimes,
  isValidExperienceTimes,
} from "./experienceTimes.ts";
import { getStandardShowTime } from "./showScheduleDefaults.ts";
import { defaultVenueSettings, normalizeVenueSettings } from "./zingaraDemo.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("authoritative venue experience schedules use the approved times", () => {
  assert.deepEqual(getCustomerExperienceTimes(defaultVenueSettings, "johannesburg"), {
    groundsOpen: "17:00",
    guestSeating: "18:30",
    showStarts: "19:30",
  });
  assert.deepEqual(getCustomerExperienceTimes(defaultVenueSettings, "cape-town"), {
    groundsOpen: "17:30",
    guestSeating: "19:00",
    showStarts: "20:00",
  });
});

test("experience schedule validation requires strict chronological ordering", () => {
  assert.equal(isValidExperienceTimes({ groundsOpen: "17:00", guestSeating: "18:30", showStarts: "19:30" }), true);
  assert.equal(isValidExperienceTimes({ groundsOpen: "18:30", guestSeating: "18:30", showStarts: "19:30" }), false);
  assert.equal(isValidExperienceTimes({ groundsOpen: "17:00", guestSeating: "20:30", showStarts: "19:30" }), false);
});

test("experience times remain independent of operational show time", () => {
  assert.equal(getStandardShowTime("johannesburg"), "17:00");
  assert.equal(getStandardShowTime("cape-town"), "18:00");
  assert.equal(getCustomerExperienceTimes(defaultVenueSettings, "cape-town")?.groundsOpen, "17:30");
  assert.equal(getCustomerExperienceTimes(defaultVenueSettings, "cape-town")?.showStarts, "20:00");
});

test("saved venue configuration overrides each customer time without changing defaults", () => {
  const settings = normalizeVenueSettings({
    operationalSettings: {
      ...defaultVenueSettings.operationalSettings,
      customerExperienceTimes: {
        ...defaultVenueSettings.operationalSettings.customerExperienceTimes,
        johannesburg: { groundsOpen: "17:30", guestSeating: "18:45", showStarts: "19:45" },
      },
    },
  });
  assert.equal(getCustomerExperienceTimes(settings, "johannesburg")?.guestSeating, "18:45");
  assert.equal(getStandardShowTime("johannesburg"), "17:00");
});

test("public booking uses date language, thresholds and the shared schedule", async () => {
  const page = await source("../app/book/page.tsx");
  assert.match(page, /Step 1 · Select Your Date/);
  assert.doesNotMatch(page, /Available Show Times/);
  assert.match(page, /1–19 Guests/);
  assert.match(page, /20\+ Guests/);
  assert.match(page, /<YourEvening/);
});

test("public Corporate submission enforces the 20 guest boundary", async () => {
  const page = await source("../app/corporate/page.tsx");
  const route = await source("../app/api/corporate-requests/route.ts");
  assert.match(page, /min=\{corporatePartySizeThreshold\}/);
  assert.match(page, /use Standard Booking/);
  assert.match(route, /corporateRequest\.guestCount < corporatePartySizeThreshold/);
});

test("ticket, payment link and find-booking surfaces use the shared schedule", async () => {
  const [ticket, payment, findBooking] = await Promise.all([
    source("../app/ticket/[reference]/ticket-client.tsx"),
    source("../app/payment/[token]/payment-link-client.tsx"),
    source("../app/find-booking/page.tsx"),
  ]);
  assert.match(ticket, /<YourEvening/);
  assert.match(payment, /<YourEvening/);
  assert.match(findBooking, /<YourEvening/);
  assert.doesNotMatch(findBooking, /\["Time", result\.booking\.time/);
});

test("PDF and branded ticket email contain all three explicit labels", async () => {
  const [pdf, email] = await Promise.all([
    source("./ticketPdf.ts"),
    source("./email/ticketEmail.ts"),
  ]);
  for (const label of ["GROUNDS OPEN", "GUEST SEATING", "SHOW STARTS"]) {
    assert.match(pdf, new RegExp(label));
  }
  assert.match(email, /\["Grounds Open", experienceTimes\.groundsOpen\]/);
  assert.match(email, /formatCustomerExperienceSchedule/);
});

test("Wallet displays all three times while preserving existing relevance", async () => {
  const wallet = await source("./appleWalletPass.ts");
  assert.match(wallet, /label: "GROUNDS OPEN"/);
  assert.match(wallet, /label: "GUEST SEATING"/);
  assert.match(wallet, /label: "SHOW STARTS"/);
  assert.match(wallet, /pass\.setRelevantDate\(performance\.value\)/);
});

test("Venue Configuration validates and saves authoritative experience times", async () => {
  const [admin, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/venue-settings/route.ts"),
  ]);
  assert.match(admin, /Customer Experience Times/);
  assert.match(admin, /These values do not alter the underlying operational show record/);
  assert.match(route, /isValidExperienceTimes/);
});
