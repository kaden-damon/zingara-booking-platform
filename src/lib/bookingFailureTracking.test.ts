import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("public booking failures are recorded after the response without browser work", async () => {
  const [tracking, bookingPage, bookingRoute] = await Promise.all([
    source("./bookingFailureTracking.ts"),
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
  ]);

  assert.match(tracking, /import \{ after \} from "next\/server"/);
  assert.match(tracking, /after\(async \(\) =>/);
  assert.match(tracking, /booking_attempt_rejected/);
  assert.match(bookingRoute, /recordPublicBookingFailureAfterResponse/);
  assert.doesNotMatch(bookingPage, /BookingFailureRecoveryPanel|booking_attempt_rejected/);
});

test("failure telemetry is bounded and contains no customer PII", async () => {
  const tracking = await source("./bookingFailureTracking.ts");

  for (const field of [
    "failureReason",
    "performanceDate",
    "performanceId",
    "quotedValue",
    "requestedGuests",
    "seatingZone",
    "venue",
  ]) {
    assert.match(tracking, new RegExp(field));
  }
  assert.doesNotMatch(tracking, /customer|email|mobile|phone|surname/i);
  assert.match(tracking, /10_000_000/);
  assert.match(tracking, /10_000/);
});

test("management reporting is indexed, paginated and service-role only", async () => {
  const [migration, route, panel, analytics] = await Promise.all([
    source("../../supabase/migrations/20261030093000_phase_61_booking_failure_recovery_reporting.sql"),
    source("../app/api/admin/analytics/booking-failures/route.ts"),
    source("../app/admin/BookingFailureRecoveryPanel.tsx"),
    source("../app/admin/ManagementAnalytics.tsx"),
  ]);

  assert.match(migration, /platform_events_booking_rejection_date_idx/);
  assert.match(migration, /limit \(select page_size from bounds\)/);
  assert.match(migration, /revoke all on function[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*service_role/);
  assert.match(route, /analytics:read/);
  assert.match(route, /p_page_size: 25/);
  assert.doesNotMatch(panel, /setInterval|poll/i);
  assert.match(analytics, /dynamic\([\s\S]*BookingFailureRecoveryPanel/);
  assert.match(analytics, /openSections\.includes\("booking-failures"\)/);
});

test("failure taxonomy distinguishes authoritative booking rejection reasons", async () => {
  const tracking = await source("./bookingFailureTracking.ts");

  for (const reason of [
    "application-error",
    "booking-cutoff",
    "booking-validation",
    "concurrency-conflict",
    "payment-initiation-failed",
    "show-closed",
    "show-sold-out",
    "two-seater-limit",
    "zone-capacity-exhausted",
    "zone-unavailable",
  ]) {
    assert.match(tracking, new RegExp(reason));
  }
});
