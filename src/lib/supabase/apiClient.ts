import { getSupabaseClient } from "./client";
import { adminIpUndertakingRequiredEvent } from "../adminIpUndertaking";

type ApiOptions = {
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
};

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
    headers,
    method: options.method ?? "GET",
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as {
      code?: string;
      error?: string;
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

    throw new Error(errorPayload.error ?? "Supabase API request failed.");
  }

  return (await response.json()) as T;
}
