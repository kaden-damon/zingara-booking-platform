import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isCorporateRequestConversionEligible,
  parseCorporateConversionReview,
  validateCorporateConversionReview,
} from "./corporateConversionReview.ts";
import { getCorporateSeatingZoneId } from "./corporateZoneMapping.ts";

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

  assert.match(page, /getCorporateEnquiryLifecycleCounts/);
  assert.match(page, /aria-label="Corporate enquiry lifecycle"/);
  assert.match(page, /\["converted", "Converted"\]/);
  assert.match(page, /corporateLifecycle === lifecycle/);
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

test("eligible Corporate enquiry states expose conversion without allowing terminal states", () => {
  const request = {
    archivedAt: undefined,
    linkedBookingReference: undefined,
  };

  assert.equal(
    isCorporateRequestConversionEligible({ ...request, status: "quote-sent" }),
    true,
  );
  assert.equal(
    isCorporateRequestConversionEligible({ ...request, status: "confirmed" }),
    true,
  );
  assert.equal(
    isCorporateRequestConversionEligible({ ...request, status: "converted" }),
    false,
  );
  assert.equal(
    isCorporateRequestConversionEligible({ ...request, status: "cancelled" }),
    false,
  );
  assert.equal(
    isCorporateRequestConversionEligible({
      ...request,
      archivedAt: "2026-09-03T12:00:00+02:00",
      status: "quote-sent",
    }),
    false,
  );
});

test("review requires authoritative financials and reconciles paid and outstanding", () => {
  const base = {
    amountPaid: "",
    paymentBasis: "unpaid" as const,
    pax: "73",
    showId: "show-27-november",
    ticketTotal: "",
    venue: "cape-town" as const,
    zoneId: "middle-ring",
  };

  assert.deepEqual(validateCorporateConversionReview(base), {
    amountPaid:
      "Enter the authoritative amount already paid, including R0.00.",
    ticketTotal: "Enter the agreed ticket obligation.",
  });
  assert.equal(parseCorporateConversionReview(base), null);

  assert.deepEqual(
    parseCorporateConversionReview({
      ...base,
      amountPaid: "25000",
      paymentBasis: "deposit",
      ticketTotal: "100000",
    }),
    {
      amountPaid: 25000,
      paymentBasis: "deposit",
      paymentStatus: "deposit-paid",
      pax: 73,
      showId: "show-27-november",
      ticketTotal: 100000,
      venue: "cape-town",
      zoneId: "middle-ring",
    },
  );
});

test("large Corporate conversion uses zone entitlement without requiring one table", async () => {
  const [page, conversionRoute, bookingRoute] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source("../app/api/bookings/route.ts"),
  ]);

  assert.match(page, /tableId: ""/);
  assert.match(page, /tableNumber: ""/);
  assert.doesNotMatch(page, /No suitable table is available for this request/);
  assert.doesNotMatch(conversionRoute, /!booking\?\.reference \|\| !booking\.tableId/);
  assert.match(conversionRoute, /reservationTableClaims: table[\s\S]*: \[\]/);
  assert.match(
    bookingRoute,
    /booking\.source === "corporate-direct" && booking\.corporateRequestId/,
  );
  assert.match(bookingRoute, /reserve_public_booking_entitlement/);
});

test("reviewed conversion remains capacity protected and failure-safe", async () => {
  const [route, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source(
      "../../supabase/migrations/20260903160000_phase_39_58a_corporate_conversion_eligibility.sql",
    ),
  ]);

  assert.match(route, /validateBookingCapacityIncrease/);
  assert.match(route, /getBookingCapacityConflictResponse/);
  assert.match(route, /hasValidReviewedFinancials/);
  assert.match(migration, /status::text not in \('confirmed', 'quote_sent'\)/);
  assert.match(migration, /status::text in \('confirmed', 'quote_sent'\)/);
  assert.doesNotMatch(route, /\.from\("corporate_requests"\)\s*\.update/);
});

test("Corporate UI provides a review action and does not infer current zone pricing", async () => {
  const [page, modal] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/CorporateConversionModal.tsx"),
  ]);

  assert.match(page, /openCorporateConversionReview/);
  assert.match(page, /Convert To Booking/);
  assert.match(modal, /Agreed Ticket Obligation/);
  assert.match(modal, /Amount Already Paid/);
  assert.match(modal, /Large parties are created as a show and zone entitlement/);
  const conversionHandler = page.slice(
    page.indexOf("async function convertCorporateRequestToBooking"),
    page.indexOf("function sendCorporatePaymentLink"),
  );
  assert.doesNotMatch(conversionHandler, /venueSettings\.zonePricing/);
});

test("Corporate conversion maps canonical seating aliases without positional fallback", () => {
  assert.equal(getCorporateSeatingZoneId("MR"), "middle-ring");
  assert.equal(
    getCorporateSeatingZoneId("MR / Middle Ring"),
    "middle-ring",
  );
  assert.equal(getCorporateSeatingZoneId("GC"), "golden-circle");
  assert.equal(getCorporateSeatingZoneId("Golden Circle"), "golden-circle");
  assert.equal(getCorporateSeatingZoneId("PB"), "royal-booths");
  assert.equal(getCorporateSeatingZoneId("Private Booths"), "royal-booths");
  assert.equal(getCorporateSeatingZoneId("RB"), "royal-balcony");
  assert.equal(getCorporateSeatingZoneId("Royal Balcony"), "royal-balcony");
  assert.equal(getCorporateSeatingZoneId("Unknown premium area"), null);
});

test("Corporate conversion rejects unknown or inconsistent zone payloads", async () => {
  const [page, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/corporate-requests/convert/route.ts"),
  ]);

  assert.match(
    page,
    /getCorporateSeatingZoneId\(request\.seatingPreference\) \?\? ""/,
  );
  assert.doesNotMatch(
    page.slice(
      page.indexOf("function getCorporateRequestZoneId"),
      page.indexOf("function openConvertedCorporateBooking"),
    ),
    /seatingZones\[1\]/,
  );
  assert.match(route, /canonicalZoneId !== booking\.zoneId/);
  assert.match(route, /canonicalZoneTitle !== booking\.zoneTitle/);
  assert.match(route, /Select a valid authoritative Corporate seating zone/);
});

test("IFF correction is exact, guarded, capacity-safe, and audited", async () => {
  const migration = await source(
    "../../supabase/migrations/20260903170000_phase_39_58b_correct_iff_corporate_zone.sql",
  );

  assert.match(migration, /booking_reference = 'ZNG-43V3AQ'/);
  assert.match(migration, /seating_preference <> 'MR'/);
  assert.match(migration, /v_booking\.section <> 'Golden Circle'/);
  assert.match(migration, /v_existing_middle_ring_pax \+ v_booking\.guest_count > v_capacity/);
  assert.match(migration, /set section = 'Middle Ring'/);
  assert.match(migration, /'zoneId', 'middle-ring'/);
  assert.match(migration, /'corporate\.booking-zone-corrected'/);
  assert.doesNotMatch(migration, /update public\.corporate_requests/);
  assert.doesNotMatch(migration, /update public\.payments/);
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
