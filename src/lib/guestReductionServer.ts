import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestReductionBasis } from "./guestReductionPolicy";

// Keep uncertain historical/contractual bases out of automatic allocation.
export async function loadGuestReductionBasis(client: SupabaseClient, bookingId: string): Promise<GuestReductionBasis> {
  const { data, error } = await client.rpc("booking_guest_reduction_basis", { p_booking_id: bookingId });
  if (error) throw error;
  return data as GuestReductionBasis;
}
