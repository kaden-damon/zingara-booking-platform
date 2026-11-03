import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeAdvertisingAttribution } from "./advertisingAttribution.ts";
import {
  defaultMetaApiVersion,
  deliverAdvertisingConversion,
  getAdvertisingConversionReadiness,
  verifyMetaCapiConfiguration,
} from "./advertisingConversionOutbox.ts";

const row = {
  amount: 275,
  attempt_count: 1,
  booking_id: "00000000-0000-4000-8000-000000000001",
  currency: "ZAR" as const,
  destination: "meta" as const,
  event_id: "pay_00000000000040008000000000000002",
  id: "00000000-0000-4000-8000-000000000003",
  journey_id: "journey_0123456789abcdef0123456789abcdef",
  occurred_at: "2026-10-29T10:15:30.000Z",
  payment_id: "00000000-0000-4000-8000-000000000002",
  payment_type: "deposit" as const,
};

const attribution = {
  analytics_consent: true,
  booking_id: row.booking_id,
  fbc: "fb.1.123.valid-click",
  fbclid: "valid-click",
  fbp: "fb.1.123.browser",
  ga_client_id: "123456789.987654321",
  gbraid: null,
  gclid: "google-click-id",
  journey_id: row.journey_id,
  marketing_consent: true,
  wbraid: null,
};

test("server conversion destinations remain independently disabled until fully configured", () => {
  assert.deepEqual(getAdvertisingConversionReadiness({}), {
    activations: {},
    authorized: false,
    configured: [],
    ga4: false,
    googleAds: false,
    meta: false,
  });
  const readiness = getAdvertisingConversionReadiness({
    ADVERTISING_GA4_SERVER_ENABLED: "true",
    ADVERTISING_GA4_SERVER_STARTED_AT: "2026-10-29T12:00:00.000Z",
    ADVERTISING_META_CAPI_ENABLED: "true",
    ADVERTISING_META_CAPI_STARTED_AT: "2026-10-29T12:00:00.000Z",
    ADVERTISING_SERVER_PURCHASE_CONVERSIONS_AUTHORISED: "true",
    GA4_MEASUREMENT_PROTOCOL_API_SECRET: "secret",
    META_CAPI_ACCESS_TOKEN: "token",
    META_PIXEL_ID: "1434578967806435",
  });
  assert.equal(readiness.authorized, true);
  assert.deepEqual(readiness.configured.sort(), ["ga4", "meta"]);
  assert.equal(readiness.activations.ga4, "2026-10-29T12:00:00.000Z");
  assert.equal(readiness.googleAds, false);
});

test("attribution normalization requires explicit current consent evidence", () => {
  assert.equal(normalizeAdvertisingAttribution({ marketingConsent: true }), null);
  const normalized = normalizeAdvertisingAttribution({
    analyticsConsent: false,
    consentRecordedAt: "2026-10-29T10:00:00.000Z",
    consentVersion: 6,
    fbclid: "abc-123",
    gaClientId: "must-not-survive",
    marketingConsent: true,
    utmCampaign: "spring_campaign",
  });
  assert.equal(normalized?.fbclid, "abc-123");
  assert.equal(normalized?.gaClientId, undefined);
  assert.equal(normalized?.utmCampaign, "spring_campaign");
});

test("Meta CAPI uses the verified payment amount and stable event id without PII", async () => {
  let requestBody = "";
  let requestUrl = "";
  let authorization = "";
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace" }), {
      status: 200,
    });
  }) as typeof fetch;
  const result = await deliverAdvertisingConversion(row, attribution, {
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl,
  });
  const payload = JSON.parse(requestBody);
  assert.equal(result.succeeded, true);
  assert.equal(payload.data[0].custom_data.value, 275);
  assert.equal(payload.data[0].custom_data.currency, "ZAR");
  assert.equal(payload.data[0].event_id, row.event_id);
  assert.equal(payload.data[0].event_name, "Purchase");
  assert.equal(
    requestUrl,
    `https://graph.facebook.com/${defaultMetaApiVersion}/1434578967806435/events`,
  );
  assert.equal(authorization, "Bearer token");
  assert.doesNotMatch(requestUrl, /token|access_token/i);
  assert.doesNotMatch(requestBody, /email|phone|booking_reference/i);
});

test("Meta readiness verifies token identity without requiring dataset-management access", async () => {
  let method = "GET";
  let requestUrl = "";
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestUrl = String(input);
    method = init?.method ?? "GET";
    return new Response(JSON.stringify({ id: "system-user-id" }), {
      status: 200,
    });
  }) as typeof fetch;
  const result = await verifyMetaCapiConfiguration({
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl,
  });

  assert.deepEqual(result, {
    accepted: false,
    apiVersion: defaultMetaApiVersion,
    configured: true,
    datasetMatches: null,
    deliveryVerified: false,
    status: 200,
    testEventConfigured: false,
    testEventRequired: true,
    tokenAccepted: true,
  });
  assert.equal(method, "GET");
  assert.match(requestUrl, /\/me\?fields=id$/);
  assert.doesNotMatch(requestUrl, /token|access_token/i);
});

test("Meta readiness verifies delivery only through an isolated Test Events request", async () => {
  let requestBody = "";
  let requestMethod = "";
  let requestUrl = "";
  const result = await verifyMetaCapiConfiguration({
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_CAPI_TEST_EVENT_CODE: "TEST12345",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      requestMethod = init?.method ?? "GET";
      requestUrl = String(input);
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace" }), {
        status: 200,
      });
    }) as typeof fetch,
    mode: "test_event",
  });

  const payload = JSON.parse(requestBody);
  assert.equal(result.accepted, true);
  assert.equal(result.datasetMatches, true);
  assert.equal(result.deliveryVerified, true);
  assert.equal(result.testEventRequired, false);
  assert.equal(result.tokenAccepted, true);
  assert.equal(requestMethod, "POST");
  assert.match(requestUrl, /\/1434578967806435\/events$/);
  assert.equal(payload.test_event_code, "TEST12345");
  assert.equal(payload.data[0].event_name, "ZingaraCapiReadiness");
  assert.doesNotMatch(requestBody, /Purchase|email|phone|booking_reference/i);
});

test("Meta readiness never sends a test event without an Events Manager code", async () => {
  let called = false;
  const result = await verifyMetaCapiConfiguration({
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl: (async () => {
      called = true;
      throw new Error("must not be called");
    }) as typeof fetch,
    mode: "test_event",
  });

  assert.equal(called, false);
  assert.equal(result.accepted, false);
  assert.equal(result.deliveryVerified, false);
  assert.equal(result.testEventRequired, true);
});

test("Meta readiness exposes a redacted provider error message", async () => {
  const result = await verifyMetaCapiConfiguration({
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      error: {
        code: 100,
        error_subcode: 33,
        message: "Object 1434578967806435 rejected access_token=EAsecretvalue000000000000 at https://graph.facebook.com/path",
        type: "OAuthException",
      },
    }), { status: 400 })) as typeof fetch,
  });

  assert.deepEqual(result, {
    accepted: false,
    apiVersion: defaultMetaApiVersion,
    configured: true,
    datasetMatches: null,
    deliveryVerified: false,
    providerError: {
      code: 100,
      message: "Object [dataset] rejected access_token=[redacted] at [url]",
      reason: "request_rejected",
      subcode: 33,
      type: "OAuthException",
    },
    status: 400,
    testEventConfigured: false,
    testEventRequired: true,
    tokenAccepted: false,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /1434578967806435|EAsecretvalue000000000000|graph\.facebook\.com/,
  );
});

test("Meta readiness classifies an inaccessible identity request without exposing provider text", async () => {
  const result = await verifyMetaCapiConfiguration({
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      error: {
        code: 100,
        message: "Unsupported get request. Object does not exist or is not accessible.",
        type: "OAuthException",
      },
    }), { status: 400 })) as typeof fetch,
  });

  assert.equal(result.providerError?.reason, "dataset_not_accessible");
  assert.equal(
    result.providerError?.message,
    "Unsupported get request. Object does not exist or is not accessible.",
  );
});

test("Meta readiness distinguishes delivery permission rejection", async () => {
  const result = await verifyMetaCapiConfiguration({
    env: {
      META_CAPI_ACCESS_TOKEN: "token",
      META_CAPI_TEST_EVENT_CODE: "TEST12345",
      META_PIXEL_ID: "1434578967806435",
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      error: {
        code: 100,
        message: "(#100) Missing Permission",
        type: "OAuthException",
      },
    }), { status: 400 })) as typeof fetch,
    mode: "test_event",
  });

  assert.equal(result.providerError?.reason, "delivery_permission_missing");
  assert.equal(result.deliveryVerified, false);
});

test("GA4 server purchase uses one payment transaction value and identity", async () => {
  let requestBody = "";
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const result = await deliverAdvertisingConversion(
    { ...row, destination: "ga4" },
    attribution,
    { env: { GA4_MEASUREMENT_PROTOCOL_API_SECRET: "secret" }, fetchImpl },
  );
  const payload = JSON.parse(requestBody);
  assert.equal(result.succeeded, true);
  assert.equal(payload.events[0].params.value, 275);
  assert.equal(payload.events[0].params.transaction_id, row.event_id);
  assert.equal(payload.events[0].params.payment_type, "deposit");
});

test("Google Ads upload retains click attribution and payment-level order id", async () => {
  const bodies: string[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    bodies.push(String(init?.body ?? ""));
    if (url.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ results: [{ gclid: "google-click-id" }] }), { status: 200 });
  }) as typeof fetch;
  const result = await deliverAdvertisingConversion(
    { ...row, destination: "google_ads", payment_type: "balance" },
    attribution,
    {
      env: {
        GOOGLE_ADS_API_VERSION: "v99",
        GOOGLE_ADS_CLIENT_ID: "client",
        GOOGLE_ADS_CLIENT_SECRET: "secret",
        GOOGLE_ADS_CONVERSION_ACTION: "customers/123/conversionActions/456",
        GOOGLE_ADS_CUSTOMER_ID: "123",
        GOOGLE_ADS_DEVELOPER_TOKEN: "developer",
        GOOGLE_ADS_REFRESH_TOKEN: "refresh",
      },
      fetchImpl,
    },
  );
  const payload = JSON.parse(bodies[1]);
  assert.equal(result.succeeded, true);
  assert.equal(payload.conversions[0].conversionValue, 275);
  assert.equal(payload.conversions[0].currencyCode, "ZAR");
  assert.equal(payload.conversions[0].gclid, "google-click-id");
  assert.equal(payload.conversions[0].orderId, row.event_id);
});

test("migration and ITN preserve post-activation idempotent non-blocking delivery", async () => {
  const [migration, itn, workflow, readinessRoute] = await Promise.all([
    readFile(new URL("../../supabase/migrations/20261029143000_phase_56_1_purchase_conversion_outbox.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/payfast/itn/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workflows/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/qa/meta-capi-readiness/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /unique \(payment_id, destination\)/);
  assert.match(migration, /a\.booking_id=o\.booking_id and a\.expires_at <= now\(\)/);
  assert.match(migration, /p\.processed_at >= \(p_activations ->> 'ga4'\)::timestamptz/);
  assert.match(migration, /p_activations \? 'meta'/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /booking_source = 'online'/);
  assert.match(migration, /booking_origin = 'customer_public'/);
  assert.match(itn, /after\(async \(\) => \{[\s\S]*enqueueVerifiedAdvertisingPurchase/);
  assert.match(workflow, /runAdvertisingConversionWorker/);
  assert.match(readinessRoute, /settings:manage/);
  assert.match(readinessRoute, /export async function POST/);
  assert.match(readinessRoute, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(readinessRoute, /META_CAPI_ACCESS_TOKEN/);
});
