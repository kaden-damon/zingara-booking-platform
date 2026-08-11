import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordPlatformEventBestEffort,
  type PlatformEventInput,
} from "@/lib/platformTelemetry";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

type RateLimitRpcResult = {
  allowed: boolean;
  current_count: number;
  retry_after_seconds: number;
};

export type RateLimitRule = {
  limit: number;
  scope: string;
  windowSeconds: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  currentCount: number;
  retryAfterSeconds: number;
};

const rateLimitMessage =
  "Too many requests. Please wait a moment and try again.";

function getForwardedIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "local"
  );
}

function safePart(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();

  return trimmed ? trimmed.slice(0, 120) : "unknown";
}

export function getRateLimitIdentity(
  request: Request,
  ...parts: Array<string | null | undefined>
) {
  return [getForwardedIp(request), ...parts.map(safePart)].join("|");
}

export async function checkRateLimit(
  request: Request,
  rule: RateLimitRule,
  identityParts: Array<string | null | undefined> = [],
  client: SupabaseClient | null = getServiceClient(),
): Promise<RateLimitDecision> {
  if (!client) {
    return {
      allowed: true,
      currentCount: 0,
      retryAfterSeconds: 0,
    };
  }

  try {
    const { data, error } = await client.rpc("check_platform_rate_limit", {
      p_identity: getRateLimitIdentity(request, ...identityParts),
      p_limit: rule.limit,
      p_scope: rule.scope,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data)
      ? (data[0] as RateLimitRpcResult | undefined)
      : (data as RateLimitRpcResult | null);

    return {
      allowed: result?.allowed ?? true,
      currentCount: result?.current_count ?? 0,
      retryAfterSeconds: result?.retry_after_seconds ?? 0,
    };
  } catch (error) {
    console.error("[Zingara rate limit] Check failed open", {
      message:
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message)
            : "Unknown error",
      scope: rule.scope,
    });

    return {
      allowed: true,
      currentCount: 0,
      retryAfterSeconds: 0,
    };
  }
}

export function rateLimitResponse(
  retryAfterSeconds: number,
  event?: Omit<PlatformEventInput, "eventType" | "severity" | "statusCode">,
  client?: SupabaseClient | null,
) {
  if (event) {
    recordPlatformEventBestEffort(
      {
        ...event,
        eventType: "rate_limited",
        severity: "warning",
        statusCode: 429,
      },
      client,
    );
  }

  return Response.json(
    {
      error: rateLimitMessage,
      retryAfterSeconds,
    },
    {
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
      },
      status: 429,
    },
  );
}
