import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminRole } from "@/lib/zingaraAccess";

const authorisedOverrideRoles = new Set<AdminRole>([
  "box-office",
  "box-office-manager",
  "box-office-staff",
  "super-admin",
]);

export function canOverrideTwoSeaterLimit(role: AdminRole | null) {
  return Boolean(role && authorisedOverrideRoles.has(role));
}

export function normalizeTwoSeaterOverrideReason(reason: unknown) {
  return typeof reason === "string" ? reason.trim().slice(0, 500) : "";
}

export async function authorizeTwoSeaterLimitOverride(
  client: SupabaseClient,
  input: {
    actorAuthUserId: string;
    actorLocationScope: string[];
    actorName: string;
    actorRole: AdminRole;
    actorStaffProfileId: string;
    bookingReference: string;
    reason: string;
    request: Request;
    showId: string;
  },
) {
  const reason = normalizeTwoSeaterOverrideReason(input.reason);

  if (!canOverrideTwoSeaterLimit(input.actorRole)) {
    throw new Error("TWO_SEATER_OVERRIDE_NOT_AUTHORISED");
  }

  if (reason.length < 3) {
    throw new Error("TWO_SEATER_OVERRIDE_REASON_REQUIRED");
  }

  const { error } = await client
    .from("two_seater_limit_override_authorizations")
    .insert({
      actor_auth_user_id: input.actorAuthUserId,
      actor_location_scope: input.actorLocationScope,
      actor_name: input.actorName,
      actor_role: input.actorRole,
      actor_staff_profile_id: input.actorStaffProfileId,
      booking_reference: input.bookingReference,
      reason,
      request_id:
        input.request.headers.get("x-vercel-id") ??
        input.request.headers.get("x-request-id") ??
        crypto.randomUUID(),
      show_id: input.showId,
      user_agent: input.request.headers.get("user-agent"),
    });

  if (error) throw error;
}
