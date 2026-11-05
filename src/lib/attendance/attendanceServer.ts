import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAttendanceUrl,
  createAttendanceToken,
  hashAttendanceToken,
  openAttendanceToken,
  sealAttendanceToken,
} from "./attendanceTokens";

const origin = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://book.zingara.co.za").replace(/\/$/, "");

export async function getOrCreateAttendanceLinks(
  client: SupabaseClient,
  bookingId: string,
) {
  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("id,show_id")
    .eq("id", bookingId)
    .single();
  if (bookingError) throw bookingError;

  const { data: show, error: showError } = await client
    .from("shows")
    .select("date,time")
    .eq("id", booking.show_id)
    .single();
  if (showError) throw showError;

  const expiresAt = new Date(`${show.date}T${String(show.time).slice(0, 5)}:00+02:00`);
  expiresAt.setHours(expiresAt.getHours() + 6);

  const { data: existing, error: existingError } = await client
    .from("booking_attendance_links")
    .select("id,token_envelope,expires_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existingError) throw existingError;

  let token = existing ? openAttendanceToken(existing.token_envelope) : null;
  if (!token || new Date(existing?.expires_at ?? 0) <= new Date()) {
    token = createAttendanceToken();
    const values = {
      booking_id: bookingId,
      expires_at: expiresAt.toISOString(),
      token_envelope: sealAttendanceToken(token),
      token_hash: hashAttendanceToken(token),
      updated_at: new Date().toISOString(),
    };
    const { error } = await client
      .from("booking_attendance_links")
      .upsert(values, { onConflict: "booking_id" });
    if (error) throw error;
  }

  return {
    confirmedUrl: buildAttendanceUrl(origin(), token, "confirmed"),
    declinedUrl: buildAttendanceUrl(origin(), token, "declined"),
  };
}

export async function resolveAttendanceContext(
  client: SupabaseClient,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const { data: link, error } = await client
    .from("booking_attendance_links")
    .select("booking_id,expires_at")
    .eq("token_hash", hashAttendanceToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!link || new Date(link.expires_at) <= new Date()) return null;

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("booking_reference,guest_count,attendance_response,show_id,customer_id")
    .eq("id", link.booking_id)
    .single();
  if (bookingError) throw bookingError;
  const [{ data: show, error: showError }, { data: customer, error: customerError }] = await Promise.all([
    client.from("shows").select("date,time,venue,name").eq("id", booking.show_id).single(),
    client.from("customers").select("first_name").eq("id", booking.customer_id).single(),
  ]);
  if (showError) throw showError;
  if (customerError) throw customerError;

  return {
    attendanceResponse: booking.attendance_response as "confirmed" | "declined" | null,
    bookingReference: booking.booking_reference as string,
    firstName: customer.first_name?.trim() || "Guest",
    guestCount: booking.guest_count as number,
    performanceDate: show.date as string,
    performanceName: show.name as string,
    performanceTime: String(show.time).slice(0, 5),
    venue: show.venue as string,
  };
}
