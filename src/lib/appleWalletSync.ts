import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { connect } from "node:http2";
import { readFile } from "node:fs/promises";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase/serverAdmin";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deviceIdentifierPattern = /^[A-Za-z0-9._-]{1,255}$/;
const pushTokenPattern = /^[A-Fa-f0-9]{32,256}$/;
const rateLimitBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();

export class AppleWalletSyncConfigurationError extends Error {}

export function isAppleWalletUuid(value: string) {
  return uuidPattern.test(value);
}

export function isAppleWalletDeviceIdentifier(value: string) {
  return deviceIdentifierPattern.test(value);
}

export function isAppleWalletPushToken(value: string) {
  return pushTokenPattern.test(value);
}

export function getAppleWalletPassTypeIdentifier() {
  const value = process.env.APPLE_WALLET_PASS_TYPE_IDENTIFIER?.trim();

  if (!value) {
    throw new AppleWalletSyncConfigurationError(
      "Apple Wallet Pass Type ID is not configured.",
    );
  }

  return value;
}

function getAppleWalletAuthSecret() {
  const value = process.env.APPLE_WALLET_AUTH_SECRET?.trim();

  if (!value || value.length < 32) {
    throw new AppleWalletSyncConfigurationError(
      "Apple Wallet authentication is not configured.",
    );
  }

  return value;
}

export function getAppleWalletWebServiceUrl(requestUrl: string) {
  const configured = process.env.APPLE_WALLET_WEB_SERVICE_URL?.trim();
  const value = configured || new URL("/api/apple-wallet", requestUrl).toString();
  const url = new URL(value);

  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname) &&
    !/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
  ) {
    throw new AppleWalletSyncConfigurationError(
      "Apple Wallet web service URL must use HTTPS outside local QA.",
    );
  }

  return url.toString().replace(/\/$/, "");
}

export function createAppleWalletAuthenticationToken(ticketId: string) {
  if (!isAppleWalletUuid(ticketId)) {
    throw new AppleWalletSyncConfigurationError(
      "Apple Wallet ticket identity is invalid.",
    );
  }

  return createHmac("sha256", getAppleWalletAuthSecret())
    .update(`zingara-apple-wallet-pass:${ticketId.toLowerCase()}`)
    .digest("base64url");
}

export function hasValidAppleWalletAuthentication(
  request: Request,
  ticketId: string,
) {
  const supplied = request.headers
    .get("authorization")
    ?.match(/^ApplePass\s+(.+)$/i)?.[1]
    ?.trim();

  if (!supplied) {
    return false;
  }

  const expected = createAppleWalletAuthenticationToken(ticketId);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export function checkAppleWalletRateLimit(
  identity: string,
  options: { limit?: number; windowMs?: number } = {},
) {
  const now = Date.now();
  const limit = options.limit ?? 240;
  const windowMs = options.windowMs ?? 60 * 60 * 1000;
  const key = createHash("sha256").update(identity).digest("hex");
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;

  return {
    allowed: current.count <= limit,
    retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
  };
}

export function appleWalletRateLimitResponse(retryAfterSeconds: number) {
  return new Response(null, {
    headers: { "Retry-After": String(retryAfterSeconds) },
    status: 429,
  });
}

export function getAppleWalletServiceClient() {
  const client = getServiceClient();

  if (!client) {
    throw new AppleWalletSyncConfigurationError(
      "Apple Wallet data service is not configured.",
    );
  }

  return client;
}

export async function resolveAppleWalletTicket(
  client: SupabaseClient,
  serialNumber: string,
) {
  if (!isAppleWalletUuid(serialNumber)) {
    return null;
  }

  const { data, error } = await client
    .from("tickets")
    .select("id,booking_id")
    .eq("id", serialNumber)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as { booking_id: string; id: string } | null;
}

export async function ensureAppleWalletPassState(
  client: SupabaseClient,
  ticketId: string,
) {
  const { error } = await client.from("apple_wallet_pass_state").upsert(
    { ticket_id: ticketId },
    { ignoreDuplicates: true, onConflict: "ticket_id" },
  );

  if (error) {
    throw error;
  }
}

async function loadCredential(base64Name: string, pathName: string) {
  const encoded = process.env[base64Name]?.trim();
  const configuredPath = process.env[pathName]?.trim();

  if (encoded) {
    return Buffer.from(encoded, "base64");
  }

  if (configuredPath) {
    return readFile(configuredPath);
  }

  throw new AppleWalletSyncConfigurationError(
    "Apple Wallet APNs credentials are not configured.",
  );
}

type AppleWalletDevice = {
  id: string;
  push_token: string;
};

type AppleWalletApnsResponse = {
  reason: string;
  status: number;
};

const terminalAppleWalletTokenReasons = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
]);

function isTerminalAppleWalletTokenResponse(
  response: AppleWalletApnsResponse,
) {
  return (
    (response.status === 400 || response.status === 410) &&
    terminalAppleWalletTokenReasons.has(response.reason)
  );
}

async function sendAppleWalletApnsPushes(devices: AppleWalletDevice[]) {
  if (process.env.APPLE_WALLET_APNS_ENABLED?.trim().toLowerCase() !== "true") {
    return { attempted: 0, delivered: 0, staleDeviceIds: [] as string[] };
  }

  if (devices.length === 0) {
    return { attempted: 0, delivered: 0, staleDeviceIds: [] as string[] };
  }

  const [cert, key] = await Promise.all([
    loadCredential(
      "APPLE_WALLET_SIGNER_CERTIFICATE_BASE64",
      "APPLE_WALLET_SIGNER_CERTIFICATE_PATH",
    ),
    loadCredential(
      "APPLE_WALLET_SIGNER_KEY_BASE64",
      "APPLE_WALLET_SIGNER_KEY_PATH",
    ),
  ]);
  const host =
    process.env.APPLE_WALLET_APNS_HOST?.trim() || "https://api.push.apple.com";
  const client = connect(host, {
    cert,
    key,
    passphrase:
      process.env.APPLE_WALLET_CERTIFICATE_PASSWORD?.trim() || undefined,
  });
  let delivered = 0;
  const staleDeviceIds = new Set<string>();
  const deviceIdsByPushToken = new Map<string, string[]>();

  for (const device of devices) {
    const deviceIds = deviceIdsByPushToken.get(device.push_token) ?? [];
    deviceIds.push(device.id);
    deviceIdsByPushToken.set(device.push_token, deviceIds);
  }

  try {
    for (const [pushToken, deviceIds] of deviceIdsByPushToken) {
      const response = await new Promise<AppleWalletApnsResponse>(
        (resolve, reject) => {
          const stream = client.request({
            ":method": "POST",
            ":path": `/3/device/${pushToken}`,
            "apns-priority": "5",
            "apns-push-type": "background",
            "apns-topic": getAppleWalletPassTypeIdentifier(),
            "content-type": "application/json",
          });
          let responseStatus = 0;
          let responseBytes = 0;
          const responseChunks: Buffer[] = [];

          stream.on("response", (headers) => {
            responseStatus = Number(headers[":status"] ?? 0);
          });
          stream.on("data", (chunk: Buffer) => {
            if (responseBytes < 4096) {
              responseChunks.push(chunk);
              responseBytes += chunk.length;
            }
          });
          stream.on("error", reject);
          stream.on("end", () => {
            let reason = "";

            try {
              const payload = JSON.parse(
                Buffer.concat(responseChunks).toString(),
              ) as { reason?: unknown };
              reason = typeof payload.reason === "string" ? payload.reason : "";
            } catch {
              // Apple may return no JSON body for a successful request.
            }

            resolve({ reason, status: responseStatus });
          });
          stream.end("{}");
        },
      );

      if (response.status === 200) {
        delivered += 1;
      } else if (isTerminalAppleWalletTokenResponse(response)) {
        deviceIds.forEach((deviceId) => staleDeviceIds.add(deviceId));
      }
    }
  } finally {
    client.close();
  }

  return {
    attempted: deviceIdsByPushToken.size,
    delivered,
    staleDeviceIds: [...staleDeviceIds],
  };
}

export async function notifyAppleWalletTickets(
  client: SupabaseClient,
  ticketIds: string[],
) {
  const uniqueTicketIds = [...new Set(ticketIds.filter(isAppleWalletUuid))];

  if (uniqueTicketIds.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  try {
    const { data: registrations, error: registrationError } = await client
      .from("apple_wallet_registrations")
      .select("device_id")
      .in("ticket_id", uniqueTicketIds)
      .eq("pass_type_identifier", getAppleWalletPassTypeIdentifier());

    if (registrationError) {
      throw registrationError;
    }

    const deviceIds = [
      ...new Set((registrations ?? []).map((row) => row.device_id as string)),
    ];

    if (deviceIds.length === 0) {
      return { attempted: 0, delivered: 0 };
    }

    const { data: devices, error: deviceError } = await client
      .from("apple_wallet_devices")
      .select("id,push_token")
      .in("id", deviceIds);

    if (deviceError) {
      throw deviceError;
    }

    const result = await sendAppleWalletApnsPushes(
      (devices ?? []) as AppleWalletDevice[],
    );

    if (result.staleDeviceIds.length > 0) {
      const { error: cleanupError } = await client
        .from("apple_wallet_devices")
        .delete()
        .in("id", result.staleDeviceIds);

      if (cleanupError) {
        throw cleanupError;
      }

      console.warn(
        `[Apple Wallet] Removed ${result.staleDeviceIds.length} stale device registration(s).`,
      );
    }

    return { attempted: result.attempted, delivered: result.delivered };
  } catch {
    console.error("[Apple Wallet] Pass update notification failed.");
    return { attempted: 0, delivered: 0 };
  }
}

async function markAppleWalletTicketsChanged(
  client: SupabaseClient,
  ticketIds: string[],
) {
  const uniqueTicketIds = [...new Set(ticketIds.filter(isAppleWalletUuid))];

  if (uniqueTicketIds.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  try {
    const { error } = await client.rpc("bump_apple_wallet_pass_state", {
      p_ticket_ids: uniqueTicketIds,
    });

    if (error) {
      throw error;
    }

    return notifyAppleWalletTickets(client, uniqueTicketIds);
  } catch {
    console.error("[Apple Wallet] Pass change tracking failed.");
    return { attempted: 0, delivered: 0 };
  }
}

export async function notifyAppleWalletBooking(
  client: SupabaseClient,
  bookingId: string,
) {
  try {
    const { data, error } = await client
      .from("tickets")
      .select("id")
      .eq("booking_id", bookingId);

    if (error) {
      throw error;
    }

    return notifyAppleWalletTickets(
      client,
      (data ?? []).map((row) => row.id as string),
    );
  } catch {
    console.error("[Apple Wallet] Booking pass notification failed.");
    return { attempted: 0, delivered: 0 };
  }
}

export async function notifyAppleWalletShow(
  client: SupabaseClient,
  showId: string,
) {
  try {
    const { data: bookings, error: bookingError } = await client
      .from("bookings")
      .select("id")
      .eq("show_id", showId);

    if (bookingError) {
      throw bookingError;
    }

    const bookingIds = (bookings ?? []).map((row) => row.id as string);

    if (bookingIds.length === 0) {
      return { attempted: 0, delivered: 0 };
    }

    const { data: tickets, error: ticketError } = await client
      .from("tickets")
      .select("id")
      .in("booking_id", bookingIds);

    if (ticketError) {
      throw ticketError;
    }

    return notifyAppleWalletTickets(
      client,
      (tickets ?? []).map((row) => row.id as string),
    );
  } catch {
    console.error("[Apple Wallet] Show pass notification failed.");
    return { attempted: 0, delivered: 0 };
  }
}

export async function notifyAppleWalletCustomer(
  client: SupabaseClient,
  customerId: string,
) {
  try {
    const { data: bookings, error: bookingError } = await client
      .from("bookings")
      .select("id")
      .eq("customer_id", customerId);

    if (bookingError) {
      throw bookingError;
    }

    const bookingIds = (bookings ?? []).map((row) => row.id as string);

    if (bookingIds.length === 0) {
      return { attempted: 0, delivered: 0 };
    }

    const { data: tickets, error: ticketError } = await client
      .from("tickets")
      .select("id")
      .in("booking_id", bookingIds);

    if (ticketError) {
      throw ticketError;
    }

    return markAppleWalletTicketsChanged(
      client,
      (tickets ?? []).map((row) => row.id as string),
    );
  } catch {
    console.error("[Apple Wallet] Customer pass notification failed.");
    return { attempted: 0, delivered: 0 };
  }
}
