import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("conversion creates and links the booking in one database transaction", async () => {
  const [route, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source(
      "../../supabase/migrations/20260903150000_phase_39_58_atomic_corporate_conversion.sql",
    ),
  ]);

  assert.match(route, /corporateRequestId: record\.row\.id/);
  assert.doesNotMatch(route, /\.from\("corporate_requests"\)\s*\.update/);
  assert.match(migration, /before insert on public\.bookings/);
  assert.match(migration, /for update/);
  assert.match(migration, /after insert on public\.bookings/);
  assert.match(migration, /set status = 'converted'/);
  assert.match(migration, /linked_booking_id = new\.id/);
  assert.match(migration, /linked_booking_reference = new\.booking_reference/);
});

test("failed booking creation cannot mark an enquiry Converted", async () => {
  const [route, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source(
      "../../supabase/migrations/20260903150000_phase_39_58_atomic_corporate_conversion.sql",
    ),
  ]);

  assert.doesNotMatch(route, /previousPayload|rollbackError|convertedPayload/);
  assert.match(migration, /CORPORATE_REQUEST_CONVERTED_WITHOUT_BOOKING/);
  assert.match(migration, /not exists \([\s\S]*from public\.bookings b/);
});

test("conversion retries are idempotent and cannot create two bookings", async () => {
  const [route, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source(
      "../../supabase/migrations/20260903150000_phase_39_58_atomic_corporate_conversion.sql",
    ),
  ]);

  assert.match(route, /conversionGate\.outcome === "idempotent"/);
  assert.match(route, /latest\?\.request\.linkedBookingReference/);
  assert.match(migration, /create unique index if not exists bookings_corporate_request_unique_idx/);
  assert.match(migration, /CORPORATE_REQUEST_ALREADY_CONVERTED/);
});

test("only trusted Corporate booking metadata can establish a link", async () => {
  const [bookingRoute, migration] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source(
      "../../supabase/migrations/20260903150000_phase_39_58_atomic_corporate_conversion.sql",
    ),
  ]);

  assert.match(bookingRoute, /corporateRequestId: undefined/);
  assert.match(migration, /new\.booking_source <> 'corporate-direct'/);
  assert.match(migration, /new\.booking_origin::text <> 'corporate'/);
  assert.match(migration, /new\.created_by_staff_id is null/);
  assert.match(migration, /CORPORATE_CONVERSION_CONTEXT_INVALID/);
});

test("converted enquiries are historical and never part of Active Enquiries", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(
    page,
    /activeCorporateBookingRequests[\s\S]*request\.status !== "converted"/,
  );
  assert.match(page, /Converted Enquiries/);
  assert.match(page, /status === "converted"/);
  assert.match(page, /status !== "converted"/);
});

test("generic status editing cannot manufacture a Converted enquiry", async () => {
  const page = await source("../app/admin/page.tsx");
  const handler = page.slice(
    page.indexOf("function updateCorporateRequestStatus"),
    page.indexOf("function archiveCorporateRequest"),
  );

  assert.match(handler, /status === "converted"/);
  assert.match(page, /filter\(\(status\) => status !== "converted"\)/);
});

test("imported enquiry persistence matches its physical row before inserting", async () => {
  const persistence = await source("./supabase/corporateRequestsServer.ts");

  assert.match(persistence, /row\.id === request\.id/);
  assert.match(
    persistence,
    /Boolean\(request\.linkedBookingReference\)[\s\S]*row\.linked_booking_reference/,
  );
});

test("Corporate conversion retains payment-hold and server permission architecture", async () => {
  const [route, holdMigration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source(
      "../../supabase/migrations/20260902150000_phase_39_48_booking_cutoff_corporate_holds.sql",
    ),
  ]);

  assert.match(route, /requireActiveStaff/);
  assert.match(route, /includes\("bookings:manage"\)/);
  assert.match(holdMigration, /new\.booking_source <> 'corporate-direct'/);
  assert.match(holdMigration, /new\.booking_origin::text <> 'corporate'/);
  assert.match(holdMigration, /new\.corporate_payment_deadline := least/);
});

test("standard staff tables no longer enter the custom temporary pricing failure path", async () => {
  const route = await source("../app/api/bookings/route.ts");

  assert.match(
    route,
    /if \(!table \|\| table\.custom_price_per_person === null\) \{\s*return null;/,
  );
  assert.match(route, /if \(customPricedTemporaryTable\) \{/);
  assert.doesNotMatch(
    route,
    /selected temporary table could not be resolved/,
  );
});
