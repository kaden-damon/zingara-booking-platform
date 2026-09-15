import { getSupabaseClient } from "./client";
import { adminIpUndertakingRequiredEvent } from "../adminIpUndertaking";

type ApiOptions = {
  body?: unknown;
  cache?: RequestCache;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
};

export class SupabaseApiError extends Error {
  code?: string;
  explanation?: string;
  status: number;

  constructor(input: {
    code?: string;
    explanation?: string;
    message: string;
    status: number;
  }) {
    super(input.message);
    this.name = "SupabaseApiError";
    this.code = input.code;
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

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(path, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
    headers,
    method: options.method ?? "GET",
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

    throw new SupabaseApiError({
      code: errorPayload.code,
      explanation: errorPayload.explanation,
      message: errorPayload.error ?? "Supabase API request failed.",
      status: response.status,
    });
  }

  return (await response.json()) as T;
}
