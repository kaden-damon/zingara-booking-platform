import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("ordinary Bookings uses a bounded server page while export remains complete", async () => {
  const [page, route, exportRoute, migration] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/bookings/route.ts"),
    source("../app/api/admin/bookings/export/route.ts"),
    source("../../supabase/migrations/20261007193000_phase_47_1_server_paginated_bookings.sql"),
  ]);

  assert.match(page, /getBookingsPage\(getActiveBookingListFilters\(\)\)/);
  assert.doesNotMatch(page, /const bookingsRequest = loadBookingList\(\)/);
  assert.match(route, /Math\.min\(100,/);
  assert.match(route, /pageMetadata\.ids\.length === 0/);
  assert.match(migration, /offset \(\(i\.page_number - 1\) \* i\.page_size\)/);
  assert.match(migration, /count\(\*\) from candidates/);
  assert.match(exportRoute, /p_page_size: 10000/);
});

test("Floor assignment opens a confirmation before the atomic mutation", async () => {
  const page = await source("../app/admin/page.tsx");
  const prepare = page.slice(
    page.indexOf("function assignFloorQueuedBooking"),
    page.indexOf("async function confirmFloorQueuedBooking"),
  );
  const confirm = page.slice(
    page.indexOf("async function confirmFloorQueuedBooking"),
    page.indexOf("async function sendTicket"),
  );

  assert.match(prepare, /setTableAssignmentConfirmation/);
  assert.doesNotMatch(prepare, /assignBookingTable\(/);
  assert.match(confirm, /findBestTableAllocation/);
  assert.match(confirm, /assignBookingTable\(assignedBooking\)/);
  assert.match(page, /Assign this table\?/);
  assert.match(page, /That table is no longer available\. Choose another table\./);
});
