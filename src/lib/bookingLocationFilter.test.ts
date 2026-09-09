import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { bookingMatchesLocation } from "./bookingLocationFilter";

test("booking location accepts all and matches canonical Cape Town or Johannesburg", () => {
  assert.equal(bookingMatchesLocation(undefined, "all"), true);
  assert.equal(bookingMatchesLocation("Cape Town", "cape-town"), true);
  assert.equal(bookingMatchesLocation("cape-town", "cape-town"), true);
  assert.equal(bookingMatchesLocation("JHB", "johannesburg"), true);
  assert.equal(bookingMatchesLocation("Johannesburg", "cape-town"), false);
  assert.equal(bookingMatchesLocation(undefined, "johannesburg"), false);
});

test("location composes with show, status, date, and search predicates", () => {
  const bookings = [
    {
      date: "2026-10-03",
      location: "cape-town",
      name: "Cape Confirmed",
      show: "cpt-october",
      status: "confirmed",
    },
    {
      date: "2026-10-03",
      location: "johannesburg",
      name: "Joburg Confirmed",
      show: "jhb-october",
      status: "confirmed",
    },
  ];

  const result = bookings.filter(
    (booking) =>
      bookingMatchesLocation(booking.location, "cape-town") &&
      booking.show === "cpt-october" &&
      booking.status === "confirmed" &&
      booking.date === "2026-10-03" &&
      booking.name.toLowerCase().includes("cape"),
  );

  assert.deepEqual(result.map((booking) => booking.name), ["Cape Confirmed"]);
});

test("Standard and Corporate bookings share location filters and reset without changing view modes", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /activeAdminTab === "bookings"/);
  assert.match(
    page,
    /activeAdminTab === "corporate" && corporateWorkspace === "bookings"/,
  );
  assert.match(page, /bookingMatchesLocation\(/);
  assert.match(page, /<option value="all">All Locations<\/option>/);
  assert.match(page, /setBookingShowFilter\("all"\)/);
  assert.match(page, /setBookingLocationFilter\("all"\)/);
  assert.match(page, /setBookingSourceFilter\("all"\)/);
  assert.match(page, /setBookingStatusFilter\("all"\)/);
  assert.match(page, /setBookingPromoFilter\("all"\)/);
  assert.match(page, /setBookingDateFilter\("all"\)/);
  assert.match(page, /setBookingSearch\(""\)/);
  assert.match(page, /setHideCancelledBookings\(true\)/);

  const clearFiltersHandler = page.slice(
    page.indexOf('setBookingLocationFilter("all")') - 200,
    page.indexOf('setBookingLocationFilter("all")') + 500,
  );
  assert.doesNotMatch(clearFiltersHandler, /setBookingViewMode/);
  assert.doesNotMatch(clearFiltersHandler, /setBookingArchiveFilter/);
});

test("location filtering reuses hydrated shows and does not add a request", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const filterBody = page.slice(
    page.indexOf("function bookingMatchesCurrentFilters"),
    page.indexOf("function getFilteredArchivableBookings"),
  );

  assert.match(filterBody, /getBookingShow\(booking\)/);
  assert.doesNotMatch(filterBody, /fetch\(|fetchSupabaseApi|await /);
});
