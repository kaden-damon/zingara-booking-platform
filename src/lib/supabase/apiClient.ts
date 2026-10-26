import { getSupabaseClient } from "./client";
import { adminIpUndertakingRequiredEvent } from "../adminIpUndertaking";

type ApiOptions = {
  body?: unknown;
  cache?: RequestCache;
  keepalive?: boolean;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  signal?: AbortSignal;
};

let staffSessionRecoveryStarted = false;

async function recoverExpiredStaffSession(
  supabase: ReturnType<typeof getSupabaseClient>,
) {
  if (typeof window === "undefined" || staffSessionRecoveryStarted) {
    return;
  }

  staffSessionRecoveryStarted = true;

  try {
    await supabase?.auth.signOut({ scope: "local" });
  } finally {
    window.location.replace("/admin");
  }
}

export class SupabaseApiError extends Error {
  code?: string;
  details?: unknown;
  explanation?: string;
  status: number;

  constructor(input: {
    code?: string;
    details?: unknown;
    explanation?: string;
    message: string;
    status: number;
  }) {
    super(input.message);
    this.name = "SupabaseApiError";
    this.code = input.code;
    this.details = input.details;
    this.explanation = input.explanation;
    this.status = input.status;
  }
}

export async function fetchSupabaseApi<T>(
  path: string,
  options: ApiOptions = {},
) {
  const supabase = getSupabaseClient();
  const session = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const accessToken = session.data.session?.access_token;
  const bookingLockSessionId =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("zingara-booking-lock-session-id")
      : null;

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (bookingLockSessionId) {
    headers["x-zingara-booking-lock-session"] = bookingLockSessionId;
  }

  const response = await fetch(path, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
    headers,
    keepalive: options.keepalive,
    method: options.method ?? "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
      explanation?: string;
    };

    if (
      response.status === 428 &&
      errorPayload.code === "ADMIN_IP_UNDERTAKING_REQUIRED" &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new Event(adminIpUndertakingRequiredEvent),
      );
    }

    if (
      response.status === 401 &&
      errorPayload.code === "STAFF_SESSION_REFRESH_REQUIRED" &&
      path.startsWith("/api/admin/")
    ) {
      await recoverExpiredStaffSession(supabase);
    }

    throw new SupabaseApiError({
      code: errorPayload.code,
      details: errorPayload,
      explanation: errorPayload.explanation,
      message: errorPayload.error ?? "Supabase API request failed.",
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

export async function fetchSupabaseBlob(
  path: string,
  options: Pick<ApiOptions, "body" | "method" | "signal"> = {},
) {
  const supabase = getSupabaseClient();
  const session = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const accessToken = session.data.session?.access_token;
  const response = await fetch(path, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    method: options.method ?? "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new SupabaseApiError({
      message: payload.error ?? "The file could not be generated.",
      status: response.status,
    });
  }

  return response.blob();
}
