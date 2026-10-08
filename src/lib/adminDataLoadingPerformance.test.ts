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

test("Admin boot paints configured show metadata before payment summaries", async () => {
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
      loadAdminData.indexOf("await dashboardDataRequest"),
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
  assert.match(page, /isShowCalendarOccupancyLoading[\s\S]{0,240}`… \/ \$\{chip\.capacity\}`/);
  assert.match(page, /occupancyUnavailable[\s\S]{0,120}`— \/ \$\{chip\.capacity\}`/);
});

test("selected-show operations load only that show's bookings", async () => {
  const page = await pageSource();
  const refreshStart = page.indexOf("async function refreshSelectedShowTables");
  const selectedShowEffect = page.slice(
    refreshStart - 1000,
    refreshStart + 5000,
  );

  assert.doesNotMatch(page, /async function refreshCalendarTables/);
  assert.match(
    page,
    /const authoritativeSelectedShowId = useMemo\([\s\S]{0,260}getOperationalShowIdentityValues\(show\)\.includes\(selectedShowId\)/,
  );
  assert.match(
    page,
    /return selectedShow\?\.supabaseId \?\? selectedShowId/,
  );
  assert.match(selectedShowEffect, /tableShow: selectedShowId/);
  assert.match(
    selectedShowEffect,
    /getBookings\(\{[\s\S]{0,100}showId: authoritativeSelectedShowId,[\s\S]{0,100}throwOnError: true/,
  );
  assert.doesNotMatch(selectedShowEffect, /getBookings\(\)/);
});

test("Floor hides counts until authoritative selected-show data loads and exposes retry on failure", async () => {
  const page = await pageSource();

  assert.match(
    page,
    /selectedShowFloorLoadState\.showId === selectedShowId[\s\S]{0,160}selectedShowFloorLoadState\.status === "loaded"/,
  );
  assert.match(page, /Floor details couldn't be loaded\. Try again\./);
  assert.match(page, /role=\{selectedShowFloorDataError \? "alert" : "status"\}/);
  assert.match(
    page,
    /setSelectedShowFloorLoadState\(\{[\s\S]{0,180}status: "loading"[\s\S]{0,180}setSelectedShowFloorLoadRevision\(\(revision\) => revision \+ 1\)/,
  );
  assert.match(
    page,
    /selectedShowFloorDataReady && floorManagementZones/,
  );
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

test("calendar occupancy is server aggregated while financial summaries remain memoized", async () => {
  const page = await pageSource();

  assert.match(page, /getShowCalendarOccupancy\(/);
  assert.match(page, /setShowCalendarOccupancyByShowZone\(nextOccupancy\)/);
  assert.match(page, /const showCalendarFinancialsByShow = useMemo\(/);
  assert.match(
    page,
    /showCalendarOccupancyByShowZone\.get\([\s\S]{0,100}show\.supabaseId \?\? show\.id[\s\S]{0,100}zone\.id/,
  );
  assert.match(page, /showCalendarFinancialsByShow\.get\(show\.id\)/);
});
