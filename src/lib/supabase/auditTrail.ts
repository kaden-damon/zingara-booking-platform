import { fetchSupabaseApi } from "./apiClient";
import type { AuditEvent, AuditTrailFilters } from "@/lib/auditTrail";

export async function getAuditTrail(filters: AuditTrailFilters = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === "" || value === "all") {
      return;
    }

    searchParams.set(key, String(value));
  });

  return fetchSupabaseApi<{
    events: AuditEvent[];
    page: number;
    pageSize: number;
    total: number;
  }>(`/api/admin/audit-trail?${searchParams.toString()}`);
}
