import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const ga4MeasurementId = "G-PP7C1SBY8N";
const metaPixelId = "1434578967806435";

type Destination = "ga4" | "google_ads" | "meta";
type DestinationActivations = Partial<Record<Destination, string>>;

type ConversionRow = {
  amount: number;
  attempt_count: number;
  booking_id: string;
  currency: "ZAR";
  destination: Destination;
  event_id: string;
  id: string;
  journey_id: string | null;
  occurred_at: string;
  payment_id: string;
  payment_type: "balance" | "deposit" | "full_payment";
};

type AttributionRow = {
  analytics_consent: boolean;
  booking_id: string;
  fbc: string | null;
  fbclid: string | null;
  fbp: string | null;
  ga_client_id: string | null;
  gbraid: string | null;
  gclid: string | null;
  journey_id: string;
  marketing_consent: boolean;
  wbraid: string | null;
};

type DeliveryResult = {
  evidence?: Record<string, unknown>;
  error?: string;
  retryable?: boolean;
  succeeded: boolean;
};

type AdvertisingEnvironment = NodeJS.ProcessEnv;

function enabled(value: string | undefined) {
  return value === "true";
}

function validActivation(value: string | undefined) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function configuredDestinations(env: AdvertisingEnvironment) {
  const activations: DestinationActivations = {};
  const ga4StartedAt = validActivation(env.ADVERTISING_GA4_SERVER_STARTED_AT);
  if (
    enabled(env.ADVERTISING_GA4_SERVER_ENABLED) &&
    env.GA4_MEASUREMENT_PROTOCOL_API_SECRET &&
    ga4StartedAt
  ) activations.ga4 = ga4StartedAt;
  const metaStartedAt = validActivation(env.ADVERTISING_META_CAPI_STARTED_AT);
  if (
    enabled(env.ADVERTISING_META_CAPI_ENABLED) &&
    env.META_CAPI_ACCESS_TOKEN &&
    env.META_CAPI_API_VERSION &&
    metaStartedAt
  ) activations.meta = metaStartedAt;
  const googleAdsStartedAt = validActivation(
    env.ADVERTISING_GOOGLE_ADS_SERVER_STARTED_AT,
  );
  if (
    enabled(env.ADVERTISING_GOOGLE_ADS_SERVER_ENABLED) &&
    env.GOOGLE_ADS_CLIENT_ID &&
    env.GOOGLE_ADS_CLIENT_SECRET &&
    env.GOOGLE_ADS_REFRESH_TOKEN &&
    env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    env.GOOGLE_ADS_CUSTOMER_ID &&
    env.GOOGLE_ADS_CONVERSION_ACTION &&
    env.GOOGLE_ADS_API_VERSION &&
    googleAdsStartedAt
  ) activations.google_ads = googleAdsStartedAt;
  return activations;
}

export function getAdvertisingConversionReadiness(
  env: AdvertisingEnvironment = process.env,
) {
  const activations = configuredDestinations(env);
  const configured = Object.keys(activations) as Destination[];
  return {
    activations,
    authorized: enabled(env.ADVERTISING_SERVER_PURCHASE_CONVERSIONS_AUTHORISED),
    configured,
    ga4: configured.includes("ga4"),
    googleAds: configured.includes("google_ads"),
    meta: configured.includes("meta"),
  };
}

function compactEvidence(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !/token|secret|email|phone|user_data/i.test(key))
      .slice(0, 12),
  );
}

async function responseBody(response: Response) {
  const text = (await response.text()).slice(0, 4_000);
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { response: text };
  }
}

function providerFailure(response: Response, body: Record<string, unknown>): DeliveryResult {
  return {
    error: `Provider rejected conversion (${response.status}): ${JSON.stringify(compactEvidence(body)).slice(0, 700)}`,
    retryable: response.status === 408 || response.status === 429 || response.status >= 500,
    succeeded: false,
  };
}

async function deliverMeta(
  row: ConversionRow,
  attribution: AttributionRow,
  fetchImpl: typeof fetch,
  env: AdvertisingEnvironment,
): Promise<DeliveryResult> {
  if (!attribution.marketing_consent) {
    return { error: "Marketing consent is not present.", retryable: false, succeeded: false };
  }
  const version = env.META_CAPI_API_VERSION;
  const token = env.META_CAPI_ACCESS_TOKEN;
  if (!version || !token) {
    return { error: "Meta CAPI configuration is incomplete.", retryable: false, succeeded: false };
  }

  const userData = Object.fromEntries(
    Object.entries({ fbc: attribution.fbc, fbp: attribution.fbp }).filter(([, value]) => value),
  );
  const response = await fetchImpl(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${metaPixelId}/events?access_token=${encodeURIComponent(token)}`,
    {
      body: JSON.stringify({
        data: [{
          action_source: "website",
          custom_data: {
            content_name: "Zingara booking payment",
            currency: row.currency,
            value: Number(row.amount),
          },
          event_id: row.event_id,
          event_name: "Purchase",
          event_source_url: "https://book.zingara.co.za/book",
          event_time: Math.floor(new Date(row.occurred_at).getTime() / 1_000),
          user_data: userData,
        }],
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = await responseBody(response);
  if (!response.ok || Number(body.events_received) < 1) {
    return providerFailure(response, body);
  }
  return { evidence: compactEvidence(body), succeeded: true };
}

async function deliverGa4(
  row: ConversionRow,
  attribution: AttributionRow,
  fetchImpl: typeof fetch,
  env: AdvertisingEnvironment,
): Promise<DeliveryResult> {
  if (!attribution.analytics_consent) {
    return { error: "Analytics consent is not present.", retryable: false, succeeded: false };
  }
  const secret = env.GA4_MEASUREMENT_PROTOCOL_API_SECRET;
  if (!secret) {
    return { error: "GA4 Measurement Protocol configuration is incomplete.", retryable: false, succeeded: false };
  }
  const endpoint = new URL("https://www.google-analytics.com/mp/collect");
  endpoint.searchParams.set("measurement_id", ga4MeasurementId);
  endpoint.searchParams.set("api_secret", secret);
  const response = await fetchImpl(endpoint, {
    body: JSON.stringify({
      client_id: attribution.ga_client_id ?? row.journey_id ?? row.event_id,
      events: [{
        name: "purchase",
        params: {
          currency: row.currency,
          items: [{ item_id: "zingara-booking-payment", item_name: "Zingara booking payment", quantity: 1 }],
          payment_type: row.payment_type,
          transaction_id: row.event_id,
          value: Number(row.amount),
        },
      }],
      timestamp_micros: String(new Date(row.occurred_at).getTime() * 1_000),
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = await responseBody(response);
  if (!response.ok) return providerFailure(response, body);
  return { evidence: { accepted: true, status: response.status }, succeeded: true };
}

let googleAccessToken: { expiresAt: number; value: string } | null = null;

async function getGoogleAccessToken(fetchImpl: typeof fetch, env: AdvertisingEnvironment) {
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60_000) {
    return googleAccessToken.value;
  }
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body = await responseBody(response);
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Google OAuth rejected conversion worker (${response.status}).`);
  }
  googleAccessToken = {
    expiresAt: Date.now() + Math.max(300, Number(body.expires_in) || 3_600) * 1_000,
    value: body.access_token,
  };
  return googleAccessToken.value;
}

function googleConversionDateTime(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}+02:00`;
}

async function deliverGoogleAds(
  row: ConversionRow,
  attribution: AttributionRow,
  fetchImpl: typeof fetch,
  env: AdvertisingEnvironment,
): Promise<DeliveryResult> {
  if (!attribution.marketing_consent) {
    return { error: "Marketing consent is not present.", retryable: false, succeeded: false };
  }
  const click = attribution.gclid
    ? { gclid: attribution.gclid }
    : attribution.gbraid
      ? { gbraid: attribution.gbraid }
      : attribution.wbraid
        ? { wbraid: attribution.wbraid }
        : null;
  if (!click) {
    return { error: "No consented Google click identifier is available.", retryable: false, succeeded: false };
  }

  try {
    const accessToken = await getGoogleAccessToken(fetchImpl, env);
    const customerId = (env.GOOGLE_ADS_CUSTOMER_ID ?? "").replaceAll("-", "");
    const response = await fetchImpl(
      `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`,
      {
        body: JSON.stringify({
          conversions: [{
            ...click,
            consent: { adPersonalization: "GRANTED", adUserData: "GRANTED" },
            conversionAction: env.GOOGLE_ADS_CONVERSION_ACTION,
            conversionDateTime: googleConversionDateTime(row.occurred_at),
            conversionValue: Number(row.amount),
            currencyCode: row.currency,
            orderId: row.event_id,
          }],
          partialFailure: true,
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
          ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
            ? { "login-customer-id": env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replaceAll("-", "") }
            : {}),
        },
        method: "POST",
      },
    );
    const body = await responseBody(response);
    if (!response.ok || body.partialFailureError) return providerFailure(response, body);
    return { evidence: compactEvidence(body), succeeded: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Google Ads delivery failed.",
      retryable: true,
      succeeded: false,
    };
  }
}

export async function deliverAdvertisingConversion(
  row: ConversionRow,
  attribution: AttributionRow,
  options: { env?: AdvertisingEnvironment; fetchImpl?: typeof fetch } = {},
) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (row.destination === "meta") return deliverMeta(row, attribution, fetchImpl, env);
  if (row.destination === "ga4") return deliverGa4(row, attribution, fetchImpl, env);
  return deliverGoogleAds(row, attribution, fetchImpl, env);
}

export async function enqueueVerifiedAdvertisingPurchase(
  client: SupabaseClient,
  paymentId: string,
) {
  const readiness = getAdvertisingConversionReadiness();
  if (!readiness.authorized || !readiness.configured.length) return;
  const { error } = await client.rpc("enqueue_advertising_purchase_conversions", {
    p_activations: readiness.activations,
    p_payment_id: paymentId,
  });
  if (error) throw error;
}

export async function runAdvertisingConversionWorker(
  client: SupabaseClient,
  options: { limit?: number } = {},
) {
  const readiness = getAdvertisingConversionReadiness();
  if (!readiness.authorized) return { delivered: 0, reason: "not_authorized" as const };
  if (!readiness.configured.length) return { delivered: 0, reason: "no_destination_configured" as const };

  await client.rpc("enqueue_recent_advertising_purchase_conversions", {
    p_activations: readiness.activations,
    p_limit: 50,
  });
  const workerId = `advertising-${randomUUID()}`;
  const { data, error } = await client.rpc("claim_advertising_conversion_outbox", {
    p_destinations: readiness.configured,
    p_lease_seconds: 90,
    p_limit: Math.min(Math.max(options.limit ?? 10, 1), 25),
    p_worker_id: workerId,
  });
  if (error) throw error;
  const rows = (data ?? []) as ConversionRow[];
  if (!rows.length) return { delivered: 0, reason: "empty" as const };

  const bookingIds = [...new Set(rows.map((row) => row.booking_id))];
  const { data: attributionRows, error: attributionError } = await client
    .from("advertising_attribution")
    .select("booking_id,journey_id,analytics_consent,marketing_consent,fbc,fbp,fbclid,gclid,gbraid,wbraid,ga_client_id")
    .in("booking_id", bookingIds);
  if (attributionError) throw attributionError;
  const attributionByBooking = new Map(
    ((attributionRows ?? []) as AttributionRow[]).map((row) => [row.booking_id, row]),
  );

  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    const attribution = attributionByBooking.get(row.booking_id);
    const result = attribution
      ? await deliverAdvertisingConversion(row, attribution)
      : { error: "Consent attribution is unavailable or expired.", retryable: false, succeeded: false };
    const { error: completionError } = await client.rpc(
      "complete_advertising_conversion_outbox",
      {
        p_error: result.error ?? null,
        p_outbox_id: row.id,
        p_provider_response: result.evidence ?? null,
        p_retryable: result.retryable !== false,
        p_succeeded: result.succeeded,
        p_worker_id: workerId,
      },
    );
    if (completionError) throw completionError;
    if (result.succeeded) delivered += 1;
    else failed += 1;
  }

  return { claimed: rows.length, delivered, failed, reason: "processed" as const };
}
