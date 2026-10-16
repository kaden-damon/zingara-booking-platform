import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingRouteUrl = new URL("../app/api/bookings/route.ts", import.meta.url);
const checkoutRouteUrl = new URL(
  "../app/api/payfast/checkout/route.ts",
  import.meta.url,
);
const itnRouteUrl = new URL("../app/api/payfast/itn/route.ts", import.meta.url);
const bookingPageUrl = new URL("../app/book/page.tsx", import.meta.url);
const telemetryUrl = new URL("./platformTelemetry.ts", import.meta.url);
const headerUrl = new URL("../app/components/ZingaraHeader.tsx", import.meta.url);

test("public reservation overlaps independent reads while awaiting expiry cleanup before capacity commit", async () => {
  const [bookingRoute, checkoutRoute] = await Promise.all([
    readFile(bookingRouteUrl, "utf8"),
    readFile(checkoutRouteUrl, "utf8"),
  ]);

  assert.match(
    bookingRoute,
    /Promise\.all\(\[\s*loadVenueSettings\(supabase\),\s*isPublicZoneSalesOpen/,
  );
  assert.match(bookingRoute, /await holdCleanupPromise;[\s\S]*checkRateLimit/);
  assert.match(checkoutRoute, /const holdCleanupPromise = runPublicPaymentHoldCleanup/);
  assert.match(checkoutRoute, /checkRateLimit[\s\S]*await holdCleanupPromise/);
});

test("PayFast acknowledges durable financial confirmation before deferred communication", async () => {
  const route = await readFile(itnRouteUrl, "utf8");
  const core = route.slice(
    route.indexOf("async function confirmPayment("),
    route.indexOf("export async function POST"),
  );

  assert.match(route, /import \{ after \} from "next\/server"/);
  assert.match(core, /confirmPaymentCore/);
  assert.match(core, /await ensureTicket/);
  assert.match(core, /after\(async \(\) =>/);
  assert.ok(core.indexOf("confirmPaymentCore") < core.indexOf("after(async"));
  assert.match(core, /Promise\.all\(\[\s*ensureCommunication/);
  assert.match(route, /processingStatus: "processed"/);
  assert.match(route, /receipt\.processing_status === "processed"/);
});

test("independent PayFast validation checks run concurrently without weakening the validation gate", async () => {
  const route = await readFile(itnRouteUrl, "utf8");

  assert.match(
    route,
    /Promise\.all\(\[[\s\S]*verifyPayFastSourceIp[\s\S]*getExpectedPayFastAmounts[\s\S]*verifyPayFastServerConfirmation/,
  );
  assert.match(
    route,
    /!signatureValid[\s\S]*!sourceIpValid[\s\S]*!merchantValid[\s\S]*!paymentAmountValid[\s\S]*!serverValidationValid/,
  );
});

test("checkout failures retain safe status and category evidence", async () => {
  const [page, telemetry] = await Promise.all([
    readFile(bookingPageUrl, "utf8"),
    readFile(telemetryUrl, "utf8"),
  ]);

  assert.match(page, /error instanceof SupabaseApiError/);
  assert.match(page, /failureKind: failure\.failureKind/);
  assert.match(page, /statusCode: failure\.statusCode/);
  assert.match(page, /public_booking_details_validation_failed/);
  assert.match(
    await readFile(bookingRouteUrl, "utf8"),
    /bookingReference: telemetryBookingReference,[\s\S]*journeyId: telemetryJourneyId/,
  );
  assert.match(telemetry, /"failureKind"/);
  assert.doesNotMatch(page, /metadata:[\s\S]{0,200}(email|phone|name):/i);
});

test("public booking navigation never calls the authenticated venue-settings endpoint", async () => {
  const header = await readFile(headerUrl, "utf8");

  assert.match(header, /isAdminRoute[\s\S]*getVenueSettings\(\)/);
  assert.match(header, /getPublicVenueSettings\(\)/);
});
