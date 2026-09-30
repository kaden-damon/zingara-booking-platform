import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { percentage } from "./websiteConversionAnalytics.ts";

const migrationUrl = new URL(
  "../../supabase/migrations/20260930113000_website_conversion_analytics.sql",
  import.meta.url,
);

test("conversion percentages use explicit numerator and denominator", () => {
  assert.equal(percentage(25, 100), 25);
  assert.equal(percentage(1, 4), 25);
  assert.equal(percentage(0, 10), 0);
  assert.equal(percentage(1, 0), null);
});

test("traffic instrumentation uses anonymous visitor IDs and 30-minute sessions", async () => {
  const browser = await readFile(
    new URL("./browserPlatformTelemetry.ts", import.meta.url),
    "utf8",
  );
  const component = await readFile(
    new URL("../app/PublicTrafficTelemetry.tsx", import.meta.url),
    "utf8",
  );

  assert.match(browser, /publicSessionTimeoutMs = 30 \* 60 \* 1000/);
  assert.match(browser, /randomId\("visitor"\)/);
  assert.match(browser, /sessionStorage\.setItem/);
  assert.match(browser, /eventType: "session_started"/);
  assert.match(browser, /eventType: "site_view"/);
  assert.doesNotMatch(browser, /customer|email|mobile|firstName|surname/i);
  assert.match(component, /trackedPublicRoutes/);
  assert.match(component, /cookieConsentReadyEvent/);
  assert.match(component, /detail\?\.analytics === true/);
  assert.match(browser, /hasAnalyticsConsent\(\)/);
  assert.doesNotMatch(component, /\/admin|\/corporate/);
});

test("server classifies environment, device and automated traffic", async () => {
  const route = await readFile(
    new URL("../app/api/platform-telemetry/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /book\.zingara\.co\.za/);
  assert.match(route, /trafficKind/);
  assert.match(route, /automated/);
  assert.match(route, /mobile/);
  assert.match(route, /tablet/);
  assert.match(route, /desktop/);
});

test("website conversion report uses authoritative public booking provenance", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const route = await readFile(
    new URL("../app/api/admin/analytics/website-conversion/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /booking_origin = 'customer_public'/);
  assert.match(migration, /booking_source = 'online'/);
  assert.match(migration, /public_checkout_superseded_by is null/);
  assert.match(migration, /test\|demo\|qa/);
  assert.match(migration, /Africa\/Johannesburg/);
  assert.match(migration, /payment_status::text in \('fully_paid', 'deposit_paid'\)/);
  assert.match(migration, /is_abandoned_hold/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /analytics:read/);
  assert.match(route, /rangeDays > 30/);
});

test("Management Analytics does not fabricate unavailable historical visitors", async () => {
  const panel = await readFile(
    new URL("../app/admin/WebsiteConversionPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(panel, /Not historically available/);
  assert.match(panel, /not historical visitors or sessions/);
  assert.match(panel, /Visitor Conversion/);
  assert.match(panel, /Session Conversion/);
  assert.match(panel, /visitor_completed_bookings.*visitors/s);
  assert.match(panel, /session_completed_bookings.*sessions/s);
  assert.match(panel, /customer-public \/ online/);
});

test("analytics aggregate is read-only and service-role only", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const paymentMigration = await readFile(
    new URL("../../supabase/migrations/20260930114000_website_conversion_public_payment_funnel.sql", import.meta.url),
    "utf8",
  );
  const consentMigration = await readFile(
    new URL("../../supabase/migrations/20260930115000_website_conversion_consented_attribution.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /language sql/);
  assert.match(migration, /stable/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate)\b/i);
  assert.match(paymentMigration, /customer_public/);
  assert.match(consentMigration, /visitorId/);
  assert.match(consentMigration, /payment_initiated/);
  assert.doesNotMatch(`${paymentMigration}\n${consentMigration}`, /\b(insert|update|delete|truncate)\b/i);
});
