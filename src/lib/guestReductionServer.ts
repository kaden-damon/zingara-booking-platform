import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestReductionBasis } from "./guestReductionPolicy";
import { corporateComponentsMissing } from "./guestReductionPolicy";
import { hasBookingOperationalAuthority } from "./bookingOperationalAuthority";

// Keep uncertain historical/contractual bases out of automatic allocation.
export async function loadGuestReductionBasis(client: SupabaseClient, bookingId: string, actor?: { id: string; user_id: string; active: boolean }): Promise<GuestReductionBasis> {
  const { data, error } = await client.rpc("booking_guest_reduction_basis", { p_booking_id: bookingId,
    ...(hasBookingOperationalAuthority(actor) ? { p_actor_staff_profile_id: actor!.id, p_actor_auth_user_id: actor!.user_id } : {}) });
  if (error) throw error;
  const basis = data as GuestReductionBasis;
  if (basis.blockedReason === corporateComponentsMissing) {
    return {
      ...basis,
      componentConfirmationRequired: true,
      blockedReason: "Confirm the invoice breakdown below before removing guests. The amounts must match the saved booking total.",
    };
  }
  return basis;
}
