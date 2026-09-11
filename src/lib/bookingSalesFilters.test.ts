import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bookingMatchesCreatedWindow,
  bookingMatchesCreator,
  bookingMatchesSalesSource,
  getBookingSalesSource,
  resolveBookingCreatedWindow,
} from "./bookingSalesFilters.ts";

test("created-date filtering defaults to all and uses SAST Today boundaries", () => {
  const all = resolveBookingCreatedWindow({ filter: "all" });
  const today = resolveBookingCreatedWindow({
    filter: "today",
    now: new Date("2026-09-09T22:30:00.000Z"),
  });

  assert.equal(bookingMatchesCreatedWindow(undefined, all), true);
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-09T21:59:59.999Z", today),
    false,
  );
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-09T22:00:00.000Z", today),
    true,
  );
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-10T21:59:59.999Z", today),
    true,
  );
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-10T22:00:00.000Z", today),
    false,
  );
});

test("Yesterday, Specific Date, and inclusive Date Range use local calendar days", () => {
  const yesterday = resolveBookingCreatedWindow({
    filter: "yesterday",
    now: new Date("2026-09-10T10:00:00.000Z"),
  });
  const specific = resolveBookingCreatedWindow({
    filter: "specific",
    specificDate: "2026-09-09",
  });
  const range = resolveBookingCreatedWindow({
    filter: "range",
    from: "2026-09-08",
    to: "2026-09-10",
  });

  assert.deepEqual(yesterday, specific);
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-07T22:00:00.000Z", range),
    true,
  );
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-10T21:59:59.999Z", range),
    true,
  );
  assert.equal(
    bookingMatchesCreatedWindow("2026-09-10T22:00:00.000Z", range),
    false,
  );
});

test("created-date validation rejects incomplete and reversed ranges", () => {
  assert.equal(
    resolveBookingCreatedWindow({ filter: "specific" }).error,
    "Select the booking-created date.",
  );
  assert.equal(
    resolveBookingCreatedWindow({
      filter: "range",
      from: "2026-09-08",
    }).error,
    "Select both From and To dates.",
  );
  assert.equal(
    resolveBookingCreatedWindow({
      filter: "range",
      from: "2026-09-10",
      to: "2026-09-08",
    }).error,
    "From date must not be later than To date.",
  );
});

test("authoritative provenance distinguishes public, staff, import, conversion, and legacy", () => {
  assert.equal(
    getBookingSalesSource({ bookingOrigin: "customer_public" }),
    "customer_public",
  );
  assert.equal(
    getBookingSalesSource({
      bookingOrigin: "admin_staff",
      createdByStaffId: "staff-1",
    }),
    "staff_internal",
  );
  assert.equal(
    getBookingSalesSource({
      bookingOrigin: "data_import",
      createdByStaffId: "importer-1",
    }),
    "data_import",
  );
  assert.equal(
    getBookingSalesSource({
      bookingOrigin: "corporate",
      corporateRequestId: "request-1",
      createdByStaffId: "staff-1",
    }),
    "corporate_conversion",
  );
  assert.equal(
    getBookingSalesSource({
      bookingOrigin: "corporate",
      createdByStaffId: "staff-1",
    }),
    "staff_internal",
  );
  assert.equal(
    getBookingSalesSource({ bookingOrigin: "legacy_unknown" }),
    "legacy_unknown",
  );
});

test("Source and Created By compose without fabricated attribution", () => {
  const bookings = [
    {
      bookingOrigin: "customer_public" as const,
      createdByStaffId: undefined,
      reference: "PUBLIC",
    },
    {
      bookingOrigin: "admin_staff" as const,
      createdByStaffId: "staff-1",
      reference: "STAFF",
    },
    {
      bookingOrigin: "data_import" as const,
      createdByStaffId: "staff-1",
      reference: "IMPORT",
    },
  ];

  assert.deepEqual(
    bookings
      .filter(
        (booking) =>
          bookingMatchesSalesSource(booking, "staff_internal") &&
          bookingMatchesCreator(booking, "staff-1"),
      )
      .map((booking) => booking.reference),
    ["STAFF"],
  );
  assert.equal(bookingMatchesCreator(bookings[0], "staff-1"), false);
  assert.equal(bookingMatchesSalesSource(bookings[2], "staff_internal"), false);
});

test("Bookings UI composes new filters before shared pagination without extra requests", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const filterBody = page.slice(
    page.indexOf("function bookingMatchesCurrentFilters"),
    page.indexOf("function getFilteredArchivableBookings"),
  );
  const filteredCohort = page.slice(
    page.indexOf("const filteredBookings = useMemo"),
    page.indexOf("const persistedPromoFilterOptions"),
  );

  assert.match(page, /Booking Created/);
  assert.match(page, /Created By/);
  assert.match(filterBody, /bookingMatchesCreatedWindow/);
  assert.match(filterBody, /bookingMatchesSalesSource/);
  assert.match(filterBody, /bookingMatchesCreator/);
  assert.doesNotMatch(filterBody, /fetch\(|fetchSupabaseApi|await /);
  assert.match(filteredCohort, /bookings\.filter/);
  assert.ok(
    page.indexOf("const filteredBookings = useMemo") <
      page.indexOf("const bookingPagination = paginateItems"),
  );
  assert.match(page, /setBookingCreatedDateFilter\("all"\)/);
  assert.match(page, /setBookingCreatedSpecificDate\(""\)/);
  assert.match(page, /setBookingCreatedFrom\(""\)/);
  assert.match(page, /setBookingCreatedTo\(""\)/);
  assert.match(page, /setBookingCreatedByFilter\("all"\)/);
  assert.match(page, /value="createdAt:desc">Newest Booking/);
  assert.match(
    page,
    /activeAdminTab === "corporate" && corporateWorkspace === "bookings"/,
  );
});

test("booking-core hydration includes creator and Corporate conversion linkage in one request", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("./supabase/bookings.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /corporate_request_id/);
  assert.match(route, /created_by_staff:staff_profiles/);
  assert.match(client, /corporateRequestId: row\.corporate_request_id/);
  assert.doesNotMatch(client, /createdByStaffId[\s\S]{0,200}fetch\(/);
});

