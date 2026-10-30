import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingAddon } from "@/lib/zingaraDemo";
import { getRestrictedDietaryQuantities } from "@/lib/dietaryAddonOrdering";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
} from "@/lib/email/staffEmailNotifications";
import { sendZingaraEmail } from "@/lib/email/smtp";

export const fatimaStaffProfileId = "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188";

type DietaryOrderNotificationInput = {
  bookingId: string;
  bookingReference: string;
  confirmationKey: string;
  currentAddons: BookingAddon[];
  customerName: string;
  existingAddons?: BookingAddon[];
  performanceDate: string;
  performanceTime: string;
  venue: string;
};

export async function sendConfirmedDietaryOrderNotification(
  client: SupabaseClient,
  input: DietaryOrderNotificationInput,
) {
  const current = getRestrictedDietaryQuantities(input.currentAddons);
  const existing = getRestrictedDietaryQuantities(input.existingAddons);
  const halaalIncrease = Math.max(
    current["dietary-strictly-halaal"] - existing["dietary-strictly-halaal"],
    0,
  );
  const kosherIncrease = Math.max(
    current["dietary-kosher"] - existing["dietary-kosher"],
    0,
  );
  if (halaalIncrease === 0 && kosherIncrease === 0) {
    return { duplicate: false, ok: true, suppressed: true } as const;
  }

  const { data: fatima, error: staffError } = await client
    .from("staff_profiles")
    .select("id,full_name,email")
    .eq("id", fatimaStaffProfileId)
    .eq("active", true)
    .not("email", "is", null)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!fatima?.email) throw new Error("Fatima's active staff email could not be resolved.");

  const deliveryId = await claimStaffEmailDelivery(client, {
    ccStaffProfileIds: [],
    eventKey: `${input.bookingId}:${input.confirmationKey}`,
    notificationKey: "dietary-order",
    toStaffProfileIds: [fatima.id],
  });
  if (!deliveryId) return { duplicate: true, ok: true } as const;

  const quantities = [
    halaalIncrease > 0 ? `Strictly Halaal: ${halaalIncrease}` : null,
    kosherIncrease > 0 ? `Kosher: ${kosherIncrease}` : null,
  ].filter(Boolean);
  const subject = `Zingara | Dietary Order — ${input.bookingReference}`;
  const message = [
    `Hi ${fatima.full_name.split(" ")[0] || "Fatima"},`,
    "",
    "A confirmed booking includes a dietary meal order.",
    `Booking: ${input.bookingReference}`,
    `Customer: ${input.customerName || "Customer not recorded"}`,
    `Venue: ${input.venue}`,
    `Performance: ${input.performanceDate} at ${input.performanceTime.slice(0, 5)}`,
    ...quantities,
  ].join("\n");
  const branded = await createBrandedCustomerEmail({
    heading: "Dietary Meal Order",
    includeAgePolicy: false,
    includePrimaryCta: false,
    message,
    subject,
  });
  const result = await sendZingaraEmail({
    attachments: branded.attachments,
    html: branded.html,
    message: branded.message,
    subject,
    to: fatima.email,
  });
  await completeStaffEmailDelivery(client, deliveryId, {
    error: result.ok ? undefined : result.error,
    status: result.ok ? "sent" : "failed",
  });
  return result;
}

export async function notifyConfirmedDietaryOrderByBookingId(
  client: SupabaseClient,
  input: {
    bookingId: string;
    confirmationKey: string;
    existingAddons?: BookingAddon[];
  },
) {
  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("id,booking_reference,booking_status,customer_id,notes,show_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking || !["confirmed", "checked_in"].includes(booking.booking_status)) {
    return { duplicate: false, ok: true, suppressed: true } as const;
  }

  const prefix = "__zingara_booking_meta__:";
  let currentAddons: BookingAddon[] = [];
  if (typeof booking.notes === "string" && booking.notes.startsWith(prefix)) {
    try {
      const metadata = JSON.parse(booking.notes.slice(prefix.length)) as {
        addons?: BookingAddon[];
      };
      currentAddons = Array.isArray(metadata.addons) ? metadata.addons : [];
    } catch {
      currentAddons = [];
    }
  }

  const [{ data: customer, error: customerError }, { data: show, error: showError }] =
    await Promise.all([
      client
        .from("customers")
        .select("first_name,surname")
        .eq("id", booking.customer_id)
        .maybeSingle(),
      client
        .from("shows")
        .select("date,time,venue")
        .eq("id", booking.show_id)
        .maybeSingle(),
    ]);
  if (customerError) throw customerError;
  if (showError) throw showError;
  if (!show) throw new Error("Dietary order performance could not be resolved.");

  return sendConfirmedDietaryOrderNotification(client, {
    bookingId: booking.id,
    bookingReference: booking.booking_reference,
    confirmationKey: input.confirmationKey,
    currentAddons,
    customerName: [customer?.first_name, customer?.surname].filter(Boolean).join(" "),
    existingAddons: input.existingAddons,
    performanceDate: show.date,
    performanceTime: show.time,
    venue: show.venue ?? "Venue not recorded",
  });
}
