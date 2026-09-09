import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Admin exposes List, Grid, and Compact booking views", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /type BookingViewMode = "compact" \| "grid" \| "list"/);
  assert.match(page, /\["list", "List"\]/);
  assert.match(page, /\["grid", "Grid"\]/);
  assert.match(page, /\["compact", "Compact"\]/);
  assert.match(page, /aria-label="Bookings view mode"/);
});

test("Compact preference survives Admin tab changes within the session", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /bookingViewModeSessionStorageKey/);
  assert.match(page, /window\.sessionStorage\.getItem\(/);
  assert.match(page, /window\.sessionStorage\.setItem\(/);
  assert.match(page, /storedViewMode === "compact"/);
});

test("Compact shares the authoritative Standard and Corporate Bookings cohort", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(
    page,
    /activeAdminTab === "bookings" \|\|[\s\S]{0,140}corporateWorkspace === "bookings"/,
  );
  assert.match(page, /const filteredBookings = useMemo/);
  assert.match(
    page,
    /const bookingPagination = paginateItems\([\s\S]{0,100}compactSortedBookings/,
  );
  assert.match(page, /rows=\{compactPaginatedRows\}/);
});

test("Compact rows retain required scanning fields and sorting controls", async () => {
  const component = await source("../app/admin/CompactBookingList.tsx");

  for (const label of [
    "Status",
    "Customer",
    "Pax",
    "Section",
    "Table / Floor",
    "Payment",
    "Amount Paid",
    "Balance",
    "Source / Type",
    "Reference",
  ]) {
    assert.match(component, new RegExp(`label: "${label.replace("/", "\\/")}"`));
  }

  assert.match(component, /onSortChange\(column\.key!\)/);
  assert.match(component, /Open Booking Details/);
  assert.match(component, /onOpenBooking\(row\.reference\)/);
});

test("Compact is dense on desktop and a contained two-line row on mobile", async () => {
  const component = await source("../app/admin/CompactBookingList.tsx");

  assert.match(component, /xl:min-h-11/);
  assert.match(component, /min-h-14/);
  assert.match(component, /xl:grid-cols-\[/);
  assert.match(component, /xl:hidden/);
  assert.match(component, /min-w-0/);
  assert.doesNotMatch(component, /overflow-x-auto/);
});

test("Compact exposes authoritative notes without per-row requests", async () => {
  const [page, component] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/CompactBookingList.tsx"),
  ]);

  assert.match(page, /bookingNotes: booking\.operationalNotes\?\.trim\(\)/);
  assert.match(component, /Show booking notes for/);
  assert.match(component, /role="tooltip"/);
  assert.match(component, /onMouseEnter/);
  assert.match(component, /onFocus/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /overflow-visible/);
  assert.doesNotMatch(component, /fetch\(|supabase/i);
});

test("Booking toolbar offers deterministic independent ordering", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /standardCompactBookingSort/);
  assert.match(page, /corporateCompactBookingSort/);
  assert.match(page, /direction: "desc", key: "createdAt"/);
  assert.match(page, /aria-label="Arrange bookings by"/);
  for (const label of [
    "Newest booking",
    "Oldest booking",
    "Customer name A-Z",
    "Customer name Z-A",
    "Show date soonest",
    "Show date latest",
    "Highest guest count",
    "Lowest guest count",
    "Highest balance",
    "Lowest balance",
    "Highest amount paid",
    "Lowest amount paid",
  ]) {
    assert.match(page, new RegExp(label));
  }
});

test("sorting composes after filters and is shared by all booking views", async () => {
  const page = await source("../app/admin/page.tsx");
  const filterIndex = page.indexOf("const filteredBookings = useMemo");
  const sortIndex = page.indexOf("const compactSortedBookings = useMemo");
  const paginationIndex = page.indexOf("const bookingPagination = paginateItems");

  assert.ok(filterIndex >= 0 && filterIndex < sortIndex);
  assert.ok(sortIndex < paginationIndex);
  assert.doesNotMatch(
    page.slice(sortIndex, paginationIndex),
    /bookingViewMode !== "compact"/,
  );
});

test("Compact rendering is presentation-only and opens the established details flow", async () => {
  const [page, component] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/CompactBookingList.tsx"),
  ]);

  assert.match(page, /void openBookingDetails\(reference\)/);
  assert.match(page, /renderedBookingCards/);
  assert.match(page, /booking\.reference === expandedBookingReference/);
  assert.doesNotMatch(component, /fetch\(|supabase|localStorage|sessionStorage/i);
});

test("Compact distinguishes Floor Assignment, Corporate, Data Import, and Comp state", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /"Floor Assignment"/);
  assert.match(page, /booking\.source === "corporate-direct"[\s\S]{0,60}\? "Corporate"/);
  assert.match(page, /booking\.bookingOrigin === "data_import"[\s\S]{0,60}\? "Data Import"/);
  assert.match(page, /paymentStatusLabels\[financials\.paymentStatus\]/);
  assert.match(page, /"comp-vip": "Comp\/VIP"/);
});
