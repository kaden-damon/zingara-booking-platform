import {
  type CustomerCommunicationSuppression,
  type OperationalCommunicationChannel,
  type OperationalPauseDuration,
} from "@/lib/customerCommunicationPreferences";
import { fetchSupabaseApi } from "./apiClient";

export async function loadCustomerCommunicationSuppressions(
  customerId: string,
) {
  const payload = await fetchSupabaseApi<{
    rows: CustomerCommunicationSuppression[];
  }>(
    `/api/admin/customers/communication-suppression?customerId=${encodeURIComponent(customerId)}`,
  );

  return payload.rows ?? [];
}

export async function setCustomerCommunicationSuppression(input: {
  action: "pause" | "resume";
  channel: OperationalCommunicationChannel;
  customerId: string;
  duration?: OperationalPauseDuration;
  otherReason?: string;
  reason: string;
}) {
  const payload = await fetchSupabaseApi<{
    rows: CustomerCommunicationSuppression[];
  }>("/api/admin/customers/communication-suppression", {
    body: input,
    method: "POST",
  });

  return payload.rows ?? [];
}
