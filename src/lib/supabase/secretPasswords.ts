import type { ResolvedSecretPassword, SecretPasswordSchedule } from "@/lib/secretPassword";
import { fetchSupabaseApi } from "./apiClient";

export function getSecretPasswordSchedules() {
  return fetchSupabaseApi<{ canEdit: boolean; schedules: SecretPasswordSchedule[] }>("/api/admin/secret-passwords", { cache: "no-store" });
}

export function getResolvedSecretPassword(showId: string) {
  return fetchSupabaseApi<{ enabled: boolean; resolved: ResolvedSecretPassword | null }>(`/api/admin/secret-passwords?showId=${encodeURIComponent(showId)}`, { cache: "no-store" });
}

export function saveSecretPasswordSchedule(schedule: Omit<SecretPasswordSchedule, "createdAt" | "updatedAt">) {
  return fetchSupabaseApi<{ schedule: SecretPasswordSchedule }>("/api/admin/secret-passwords", { body: schedule, method: schedule.id ? "PATCH" : "POST" });
}

export function deleteSecretPasswordSchedule(id: string) {
  return fetchSupabaseApi<{ deleted: true }>(`/api/admin/secret-passwords?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
