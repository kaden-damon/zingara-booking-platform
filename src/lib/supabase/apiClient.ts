import { getSupabaseClient } from "./client";

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
      error?: string;
    };

    throw new Error(errorPayload.error ?? "Supabase API request failed.");
  }

  return (await response.json()) as T;
}
