import { type CorporateRequest } from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "./apiClient";

async function getSupabaseCorporateRequests() {
  try {
    const payload = await fetchSupabaseApi<{ requests: CorporateRequest[] }>(
      "/api/admin/corporate-requests",
    );

    return payload.requests ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load corporate requests", error);
    return null;
  }
}

async function persistCorporateRequestsToSupabase(
  requests: CorporateRequest[],
  options: { replace?: boolean; route?: string } = {},
) {
  try {
    const payload = await fetchSupabaseApi<{ requests: CorporateRequest[] }>(
      options.route ?? "/api/admin/corporate-requests",
      {
        body: {
          replace: options.replace,
          requests,
        },
        method: "POST",
      },
    );

    return payload.requests ?? requests;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to save corporate requests", error);
    return requests;
  }
}

export async function getCorporateRequests() {
  const supabaseRequests = await getSupabaseCorporateRequests();

  if (!supabaseRequests) {
    return [];
  }

  return supabaseRequests;
}

export async function getCorporateRequest(id: string) {
  const requests = await getCorporateRequests();

  return requests.find((request) => request.id === id);
}

export async function createCorporateRequest(request: CorporateRequest) {
  await persistCorporateRequestsToSupabase([request], {
    route: "/api/corporate-requests",
  });

  return request;
}

export async function updateCorporateRequest(request: CorporateRequest) {
  await persistCorporateRequestsToSupabase([request]);

  return request;
}

export async function saveCorporateRequests(requests: CorporateRequest[]) {
  await persistCorporateRequestsToSupabase(requests, { replace: true });

  return getCorporateRequests();
}
