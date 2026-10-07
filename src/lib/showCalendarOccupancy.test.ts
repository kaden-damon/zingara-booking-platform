import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getManagementForecastZoneGuests } from "./managementAnalytics.ts";
import {
  buildShowCalendarOccupancySummaries,
  type ShowCalendarOccupancyBooking,
} from "./showCalendarOccupancy.ts";

function booking(
  input: Partial<ShowCalendarOccupancyBooking> &
    Pick<ShowCalendarOccupancyBooking, "guestCount" | "section" | "showId">,
): ShowCalendarOccupancyBooking {
  return {
    archivedAt: null,
    bookingStatus: "confirmed",
    zoneEntitlements: null,
    ...input,
  };
}

test("calendar zone summaries exactly reuse Forward Forecast entitlement semantics", () => {
  const rows = [
    booking({ guestCount: 2, section: "Golden Circle", showId: "show-a" }),
    booking({
      guestCount: 10,
      section: "Middle Ring",
      showId: "show-a",
      zoneEntitlements: [
        { pax: 4, zoneId: "golden-circle" },
        { pax: 6, zoneId: "royal-booths" },
      ],
    }),
    booking({
      bookingStatus: "checked_in",
      guestCount: 1,
      section: "Middle Ring",
      showId: "show-a",
    }),
    booking({
      bookingStatus: "pending_payment",
      guestCount: 3,
      section: "Royal Balcony",
      showId: "show-a",
    }),
  ];
  const [summary] = buildShowCalendarOccupancySummaries(["show-a"], rows);

  assert.deepEqual(
    summary.zoneGuests,
    getManagementForecastZoneGuests(rows),
  );
  assert.deepEqual(summary.zoneGuests, { gc: 6, mr: 1, pb: 6, rb: 3 });
});

test("calendar includes unassigned entitlement but excludes inactive lifecycle residue", () => {
  const rows = [
    booking({ guestCount: 8, section: "Private Booths", showId: "show-a" }),
    booking({
      bookingStatus: "cancelled",
      guestCount: 90,
      section: "Golden Circle",
      showId: "show-a",
    }),
    booking({
      archivedAt: "2026-10-01T00:00:00Z",
      guestCount: 80,
      section: "Middle Ring",
      showId: "show-a",
    }),
    booking({
      bookingStatus: "refunded",
      guestCount: 70,
      section: "Royal Balcony",
      showId: "show-a",
    }),
    booking({
      bookingStatus: "superseded",
      guestCount: 60,
      section: "Golden Circle",
      showId: "show-a",
    }),
  ];
  const summaries = buildShowCalendarOccupancySummaries(
    ["show-a", "zero-show"],
    rows,
  );

  assert.deepEqual(summaries, [
    { showId: "show-a", zoneGuests: { gc: 0, mr: 0, pb: 8, rb: 0 } },
    { showId: "zero-show", zoneGuests: { gc: 0, mr: 0, pb: 0, rb: 0 } },
  ]);
});

test("calendar occupancy transport is bounded and independent from paginated Bookings state", async () => {
  const [page, route, server, shows] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/api/admin/shows/calendar-occupancy/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "./supabase/showCalendarOccupancyServer.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("./supabase/shows.ts", import.meta.url), "utf8"),
  ]);
  const occupancyEffect = page.slice(
    page.indexOf("void getShowCalendarOccupancy("),
    page.indexOf("useEffect(() => {", page.indexOf("void getShowCalendarOccupancy(") + 1),
  );
  const occupancyRender = page.slice(
    page.indexOf("const getShowOccupancyChips"),
    page.indexOf("const showSearchTerm"),
  );

  assert.match(route, /requireActiveStaff/);
  assert.doesNotMatch(route, /settings:manage/);
  assert.match(route, /private, no-store/);
  assert.match(server, /\.gte\("date", `\$\{input\.month\}-01`\)/);
  assert.match(server, /\.lt\("date", `\$\{nextMonth\(input\.month\)\}-01`\)/);
  assert.match(server, /\.in\("show_id", showIds\)/);
  assert.match(server, /\.select\(\s*"id,show_id,guest_count,booking_status,section,zone_entitlements,archived_at"/);
  assert.match(server, /bookingPageSize = 1000/);
  assert.match(server, /normalizeStaffVenueScope/);
  assert.match(shows, /\/api\/admin\/shows\/calendar-occupancy/);
  assert.doesNotMatch(occupancyEffect, /getBookings\(/);
  assert.doesNotMatch(occupancyEffect, /activeBookingsForOperations/);
  assert.match(occupancyEffect, /controller\.abort\(\)/);
  assert.match(occupancyRender, /show\.supabaseId \?\? show\.id/);
  assert.match(page, /Show occupancy couldn't be loaded\. Try again\./);
  assert.match(page, /show\.fullShowBuyout \?/);
});
