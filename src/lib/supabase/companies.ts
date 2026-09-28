import type {
  CompanyRecord,
  CompanyWriteInput,
  CrmReviewCandidate,
} from "@/lib/companyMaster";
import { fetchSupabaseApi } from "./apiClient";

export async function getCompanies(includeArchived = false) {
  const payload = await fetchSupabaseApi<{ companies: CompanyRecord[] }>(
    `/api/admin/companies${includeArchived ? "?includeArchived=true" : ""}`,
  );

  return payload.companies ?? [];
}

export async function saveCompany(input: {
  companyId?: string;
  expectedRevision: number;
  values: CompanyWriteInput;
}) {
  const payload = await fetchSupabaseApi<{ company: CompanyRecord }>(
    "/api/admin/companies",
    {
      body: input,
      method: input.companyId ? "PATCH" : "POST",
    },
  );

  return payload.company;
}

export async function linkCustomerCompany(input: {
  companyId: string | null;
  customerId: string;
  expectedRevision: number;
  jobTitle: string;
}) {
  return fetchSupabaseApi<{ customer: Record<string, unknown> }>(
    "/api/admin/companies/contact",
    { body: input, method: "PATCH" },
  );
}

export async function getCrmReviewCandidates() {
  const payload = await fetchSupabaseApi<{ candidates: CrmReviewCandidate[] }>(
    "/api/admin/companies/reviews",
  );

  return payload.candidates ?? [];
}

export async function reviewCrmCandidate(input: {
  action: "keep-separate" | "link-to-company" | "merge" | "not-a-duplicate";
  companyId?: string;
  duplicateCustomerId?: string;
  expectedDuplicateUpdatedAt?: string;
  expectedSurvivorUpdatedAt?: string;
  note: string;
  reviewId: string;
  survivorCustomerId?: string;
}) {
  return fetchSupabaseApi<{ candidate: CrmReviewCandidate }>(
    "/api/admin/companies/reviews",
    { body: input, method: "PATCH" },
  );
}
