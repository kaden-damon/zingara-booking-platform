import {
  type CorporateRequest,
  getStoredCorporateRequests,
  storeCorporateRequests,
} from "@/lib/zingaraDemo";
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
  const fallbackRequests = getStoredCorporateRequests();
  const supabaseRequests = await getSupabaseCorporateRequests();

  if (!supabaseRequests) {
    return fallbackRequests;
  }

  if (supabaseRequests.length === 0) {
    await persistCorporateRequestsToSupabase(fallbackRequests);

    return fallbackRequests;
  }

  const supabaseIds = new Set(supabaseRequests.map((request) => request.id));

  return [
    ...supabaseRequests,
    ...fallbackRequests.filter((request) => !supabaseIds.has(request.id)),
  ];
}

export async function getCorporateRequest(id: string) {
  const requests = await getCorporateRequests();

  return requests.find((request) => request.id === id);
}

export async function createCorporateRequest(request: CorporateRequest) {
  const nextRequests = [request, ...getStoredCorporateRequests()];

  storeCorporateRequests(nextRequests);
  await persistCorporateRequestsToSupabase([request], {
    route: "/api/corporate-requests",
  });

  return request;
}

export async function updateCorporateRequest(request: CorporateRequest) {
  const nextRequests = getStoredCorporateRequests().map((currentRequest) =>
    currentRequest.id === request.id ? request : currentRequest,
  );

  storeCorporateRequests(nextRequests);
  await persistCorporateRequestsToSupabase([request]);

  return request;
}

export async function saveCorporateRequests(requests: CorporateRequest[]) {
  storeCorporateRequests(requests);
  await persistCorporateRequestsToSupabase(requests, { replace: true });

  return getCorporateRequests();
}
