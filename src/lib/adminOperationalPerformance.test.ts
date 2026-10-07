import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("rare Admin workspaces are split away from the everyday Admin bundle", async () => {
  const page = await source("../app/admin/page.tsx");

  for (const component of [
    "ManagementAnalytics",
    "DineplanReconciliation",
    "ReviewsAdminWorkspace",
    "CompanyCrmWorkspace",
    "SystemMaintenancePanel",
    "SystemPreferences",
  ]) {
    assert.match(
      page,
      new RegExp(`const ${component} = dynamic\\(`),
      `${component} should load only when its workspace is rendered`,
    );
    assert.doesNotMatch(
      page,
      new RegExp(`import ${component} from`),
      `${component} must not remain a static Admin dependency`,
    );
  }

  assert.match(page, /const InternationalPhoneInput = dynamic\(/);
});

test("Booking Details prioritises the critical record over secondary history", async () => {
  const [page, bookingsClient, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("./supabase/bookings.ts"),
    source("../app/api/admin/bookings/route.ts"),
  ]);
  const start = page.indexOf("async function loadBookingDetails");
  const end = page.indexOf("function openBookingDetails", start);
  const detailsLoader = page.slice(start, end);

  assert.match(
    detailsLoader,
    /getBooking\(reference, \{\s*includeHistory: false,/,
  );
  assert.match(detailsLoader, /setExpandedBookingReference\(reference\)/);
  assert.match(detailsLoader, /void getBookingHistories\(reference\)/);
  assert.ok(
    detailsLoader.indexOf("setExpandedBookingReference(reference)") <
      detailsLoader.indexOf("void getBookingHistories(reference)"),
  );
  assert.match(bookingsClient, /searchParams\.set\("reference", reference\)/);
  assert.match(route, /fetchAdminBookingIdentityRows\(serviceClient, reference\)/);
});

test("single-booking reconciliation avoids a full booking population reload", async () => {
  const page = await source("../app/admin/page.tsx");
  const start = page.indexOf("async function saveFinancialReconciliation");
  const end = page.indexOf("function canSendCustomerPaymentLink", start);
  const reconciliation = page.slice(start, end);

  assert.match(reconciliation, /refreshBookingInState\(/);
  assert.doesNotMatch(reconciliation, /setBookings\(await getBookings\(\)\)/);
  assert.match(
    page,
    /getBooking\(reference, \{ includeHistory: false \}\)/,
  );
});
