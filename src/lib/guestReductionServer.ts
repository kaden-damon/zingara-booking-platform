import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestReductionBasis } from "./guestReductionPolicy";

// Keep uncertain historical/contractual bases out of automatic allocation.
export async function loadGuestReductionBasis(client: SupabaseClient, bookingId: string): Promise<GuestReductionBasis> {
  const { data, error } = await client.rpc("booking_guest_reduction_basis", { p_booking_id: bookingId });
  if (error) throw error;
  const basis = data as GuestReductionBasis;
  if (basis.blockedReason === "The Corporate quote must establish separate ticket and gratuity components before allocation.") {
    return {
      ...basis,
      blockedReason: "Accounts must confirm the separate ticket, gratuity and prepaid bar amounts before guests can be removed or money moved to the bar. The saved total does not show that breakdown.",
    };
  }
  return basis;
}
