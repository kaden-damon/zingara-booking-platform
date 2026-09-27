import type { SupabaseClient } from "@supabase/supabase-js";

export async function triggerDineplanActionDigestAfterReconciliation<TResult>(input: {
  actionCount: number;
  client: SupabaseClient;
  runDigest: (client: SupabaseClient) => Promise<TResult>;
  trusted: boolean;
}) {
  if (!input.trusted) {
    return { available: true, delivered: false, reason: "untrusted" as const };
  }
  if (input.actionCount <= 0) {
    return { available: true, delivered: false, reason: "no_actions" as const };
  }

  try {
    return await input.runDigest(input.client);
  } catch (error) {
    console.error("[Dineplan Reconciliation] Immediate action digest failed", error);
    return { available: true, delivered: false, reason: "failed" as const };
  }
}
