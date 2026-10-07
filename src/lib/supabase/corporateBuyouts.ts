import type { CompanyRecord } from "@/lib/companyMaster";
import type {
  CorporateBuyoutPackage,
  CorporateBuyoutSummary,
} from "@/lib/corporateBuyouts";
import { fetchSupabaseApi } from "./apiClient";

export type CorporateBuyoutShowOption = {
  activeBuyout: CorporateBuyoutSummary | null;
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: string;
};

export type CorporateBuyoutBootstrap = {
  canCreate: boolean;
  companies: CompanyRecord[];
  eligibility?: CorporateBuyoutEligibility;
  packages: CorporateBuyoutPackage[];
  shows: CorporateBuyoutShowOption[];
};

export type CorporateBuyoutEligibility = {
  activeBookingCount: number;
  activeGuestCount: number;
  available: boolean;
  buyoutState: string | null;
  showStatus: string;
};

export function getCorporateBuyoutBootstrap(
  showId?: string,
  signal?: AbortSignal,
) {
  const query = showId ? `?showId=${encodeURIComponent(showId)}` : "";
  return fetchSupabaseApi<CorporateBuyoutBootstrap>(
    `/api/admin/corporate-buyouts${query}`,
    { cache: "no-store", signal },
  );
}

export async function getCorporateBuyoutEligibility(
  showId: string,
  signal?: AbortSignal,
) {
  const payload = await fetchSupabaseApi<{
    eligibility: CorporateBuyoutEligibility;
  }>(`/api/admin/corporate-buyouts?showId=${encodeURIComponent(showId)}`, {
    cache: "no-store",
    signal,
  });
  return payload.eligibility;
}

export async function createCorporateBuyout(input: {
  companyId: string;
  contactCustomerId: string;
  expectedGuestCount: number;
  finalGuestCount: number | null;
  idempotencyKey: string;
  packageId: string;
  showId: string;
}) {
  const payload = await fetchSupabaseApi<{
    buyout: {
      bookingReference: string;
      buyoutId: string;
      idempotent: boolean;
      state: string;
      totalAmount: number;
    };
  }>("/api/admin/corporate-buyouts", {
    body: input,
    method: "POST",
  });
  return payload.buyout;
}

export async function releaseCorporateBuyout(input: {
  buyoutId: string;
  expectedRevision: number;
  reason: string;
}) {
  return fetchSupabaseApi<{ result: unknown }>("/api/admin/corporate-buyouts", {
    body: { ...input, action: "release" },
    method: "PATCH",
  });
}
