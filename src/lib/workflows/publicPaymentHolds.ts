import type { SupabaseClient } from "@supabase/supabase-js";

export const publicPaymentHoldMinutes = 30;

export type PublicPaymentHoldCleanupResult = {
  expired?: number;
  releasedPax?: number;
  releasedTableClaims?: number;
};

export async function runPublicPaymentHoldCleanup(
  client: SupabaseClient,
): Promise<PublicPaymentHoldCleanupResult> {
  const { data, error } = await client.rpc("expire_due_public_booking_holds", {
    p_limit: 500,
  });

  if (error) throw error;

  const result = (data ?? {}) as {
    expired?: number;
    released_pax?: number;
    released_table_claims?: number;
  };

  return {
    expired: result.expired ?? 0,
    releasedPax: result.released_pax ?? 0,
    releasedTableClaims: result.released_table_claims ?? 0,
  };
}

export async function releaseValidatedFailedPublicPaymentHold(
  client: SupabaseClient,
  bookingReference: string,
  paymentStatus: string | undefined,
) {
  const normalizedStatus = paymentStatus?.trim().toUpperCase();

  if (normalizedStatus !== "FAILED" && normalizedStatus !== "CANCELLED") {
    return { expired: false };
  }

  const { data, error } = await client.rpc(
    "expire_public_booking_hold_by_reference",
    {
      p_booking_reference: bookingReference,
      p_reason: `validated-payfast-${normalizedStatus.toLowerCase()}`,
    },
  );

  if (error) throw error;

  return (data ?? { expired: false }) as { expired?: boolean };
}
