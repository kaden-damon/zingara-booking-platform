import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveCustomerOperationalCommunication,
  shouldRespectCustomerOperationalPause,
  type CustomerCommunicationSuppression,
  type OperationalCommunicationKind,
  type OperationalCommunicationChannel,
} from "../customerCommunicationPreferences";

type SuppressionRow = {
  channel: OperationalCommunicationChannel;
  customer_id: string;
  paused_at: string;
  paused_by_name: string;
  paused_until: string;
  reason: string;
};

function toSuppression(row: SuppressionRow): CustomerCommunicationSuppression {
  return {
    channel: row.channel,
    customerId: row.customer_id,
    pausedAt: row.paused_at,
    pausedByName: row.paused_by_name,
    pausedUntil: row.paused_until,
    reason: row.reason,
  };
}

export async function getCustomerCommunicationSuppressions(
  serviceClient: SupabaseClient,
  customerId: string,
) {
  const { data, error } = await serviceClient
    .from("customer_communication_suppressions")
    .select(
      "customer_id,channel,paused_at,paused_until,reason,paused_by_name",
    )
    .eq("customer_id", customerId)
    .order("channel", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as SuppressionRow[]).map(toSuppression);
}

export async function resolveBookingCustomerId(
  serviceClient: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await serviceClient
    .from("bookings")
    .select("customer_id")
    .eq("booking_reference", bookingReference.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { customer_id?: string | null } | null)?.customer_id ?? null;
}

export async function checkCustomerOperationalCommunication(
  serviceClient: SupabaseClient,
  input: {
    channel: OperationalCommunicationChannel;
    customerId: string;
    kind: OperationalCommunicationKind;
    now?: Date;
  },
) {
  if (!shouldRespectCustomerOperationalPause(input.kind)) {
    return {
      allowed: true,
      reason: null,
      suppression: null,
    } as const;
  }

  const suppressions = await getCustomerCommunicationSuppressions(
    serviceClient,
    input.customerId,
  );
  return resolveCustomerOperationalCommunication(suppressions, input);
}
