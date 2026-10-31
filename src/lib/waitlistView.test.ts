import assert from "node:assert/strict";
import test from "node:test";

import type { DemoWaitlistEntry } from "./zingaraDemo.ts";
import {
  filterWaitlistEntries,
  getWaitlistSource,
  summarizeWaitlistEntries,
} from "./waitlistView.ts";

const entries: DemoWaitlistEntry[] = [
  {
    id: "WLT-SECRET",
    showId: "show-1",
    desiredZoneTitle: "Golden Circle",
    partySize: 4,
    customer: {
      email: "secret@example.com",
      name: "Secret Guest",
      phone: "0710000000",
    },
    notes: "Submitted via The Secret Guest List.",
    status: "waiting",
    createdAt: "2026-10-31T08:00:00.000Z",
  },
  {
    id: "WLT-DIRECT",
    showId: "show-1",
    desiredZoneTitle: "Middle Ring",
    partySize: 8,
    customer: {
      email: "direct@example.com",
      name: "Direct Guest",
      phone: "0720000000",
    },
    notes: "Box Office enquiry.",
    status: "promoted",
    createdAt: "2026-10-31T09:00:00.000Z",
  },
];

test("classifies Secret Guest List enquiries from their authoritative note", () => {
  assert.equal(getWaitlistSource(entries[0]), "secret-guest-list");
  assert.equal(getWaitlistSource(entries[1]), "waitlist");
});

test("combines search, status, guest-count and source filters", () => {
  assert.deepEqual(
    filterWaitlistEntries(
      entries,
      {
        guestCount: "3-4",
        search: "cape town",
        source: "secret-guest-list",
        status: "waiting",
      },
      "Cape Town 31 October 2026",
    ).map((entry) => entry.id),
    ["WLT-SECRET"],
  );
});

test("summarises the currently visible entries and active guests", () => {
  assert.deepEqual(summarizeWaitlistEntries(entries), {
    activeGuests: 12,
    converted: 0,
    promoted: 1,
    removed: 0,
    waiting: 1,
  });
});
