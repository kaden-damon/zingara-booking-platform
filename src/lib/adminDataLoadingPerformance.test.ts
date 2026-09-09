import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function pageSource() {
  return readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
}

test("Admin boot requests lean booking and show data without eager histories or table inventory", async () => {
  const page = await pageSource();
  const loadBookingList = page.slice(
    page.indexOf("async function loadBookingList"),
    page.indexOf("async function loadBookingDetails"),
  );
  const loadAdminData = page.slice(
    page.indexOf("async function loadAdminData"),
    page.indexOf("async function restoreAdminSession"),
  );

  assert.match(loadBookingList, /includeHistory: false/);
  assert.doesNotMatch(loadBookingList, /getBookingHistories|hydrateBookingHistories/);
  assert.match(loadAdminData, /getShowsWithTables\(\{ metadataOnly: true \}\)/);
  assert.doesNotMatch(loadAdminData, /refreshLiveCustomerRecords/);
});

test("Admin boot paints configured show metadata before booking and payment summaries", async () => {
  const page = await pageSource();
  const loadAdminData = page.slice(
    page.indexOf("async function loadAdminData"),
    page.indexOf("async function restoreAdminSession"),
  );

  assert.match(
    loadAdminData,
    /const showShellRequest = Promise\.all\(\[[\s\S]*getShowsWithTables\(\{ metadataOnly: true \}\)[\s\S]*getVenueSettings\(\)/,
  );
  assert.ok(
    loadAdminData.indexOf("await showShellRequest") <
      loadAdminData.indexOf("await Promise.all([dashboardDataRequest, bookingsRequest])"),
  );
  assert.ok(
    loadAdminData.indexOf("setIsShowsLoading(false)") <
      loadAdminData.lastIndexOf("setIsCalendarSummariesLoading(false)"),
  );
  assert.match(loadAdminData, /setVenueSettings\(nextVenueSettings\)/);
});

test("calendar never presents partial occupancy or financial summaries as authoritative", async () => {
  const page = await pageSource();

  assert.match(page, /disabled=\{isCalendarSummariesLoading\}/);
  assert.match(page, /Financial summary loading/);
  assert.match(page, /occupancy loading/);
  assert.match(page, /isCalendarSummariesLoading[\s\S]{0,180}`… \/ \$\{chip\.capacity\}`/);
});

test("calendar navigation reuses hydrated metadata and never reloads all bookings", async () => {
  const page = await pageSource();
  const selectedShowEffect = page.slice(
    page.indexOf("async function refreshSelectedShowTables"),
    page.indexOf("const canViewOperationsWorkspace"),
  );

  assert.doesNotMatch(page, /async function refreshCalendarTables/);
  assert.match(selectedShowEffect, /tableShow: selectedShowId/);
  assert.match(selectedShowEffect, /bookingsRef\.current/);
  assert.doesNotMatch(selectedShowEffect, /getBookings\(/);
});

test("Booking Details paints authoritative core data before secondary table inventory", async () => {
  const page = await pageSource();
  const details = page.slice(
    page.indexOf("async function loadBookingDetails"),
    page.indexOf("function openBookingDetails"),
  );

  assert.ok(
    details.indexOf("setExpandedBookingReference(reference)") <
      details.indexOf("getShowsWithTables({ tableShow: detailedBooking.showId })"),
  );
  assert.match(details, /bookingDetailTableLoadRequestRef/);
  assert.match(details, /mergeTablesForShows/);
});

test("customer CRM hydration is deferred until the authenticated Customers workspace opens", async () => {
  const page = await pageSource();

  assert.match(
    page,
    /activeAdminTab !== "customers"[\s\S]{0,220}customerDataLoadStatus !== "idle"[\s\S]{0,220}refreshLiveCustomerRecords\(\)/,
  );
  assert.match(
    page,
    /activeAdminTab === "customers"[\s\S]{0,180}activeSettingsTab === "workflows"[\s\S]{0,360}hydrateBookingHistories\(\)/,
  );
});

test("calendar occupancy and financial summaries are aggregated once per dataset revision", async () => {
  const page = await pageSource();

  assert.match(page, /const showCalendarOccupancyByShowZone = useMemo\(/);
  assert.match(page, /const showCalendarFinancialsByShow = useMemo\(/);
  assert.match(
    page,
    /showCalendarOccupancyByShowZone\.get\(`\$\{show\.id\}\|\$\{zone\.id\}`\)/,
  );
  assert.match(page, /showCalendarFinancialsByShow\.get\(show\.id\)/);
});
