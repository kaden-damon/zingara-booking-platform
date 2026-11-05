import type { SupabaseClient } from "@supabase/supabase-js";

import { insertCommunicationPayload } from "@/lib/email/communicationIdempotency";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
  loadManagementEmailRoute,
} from "@/lib/email/staffEmailNotifications";
import { sendStaffPushNotification } from "@/lib/supabase/staffPush";

function formatPerformance(date: string, time: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${date}T${String(time).slice(0, 5)}:00+02:00`));
}

export async function sendAttendanceResponseNotification(
  client: SupabaseClient,
  input: {
    bookingId: string;
    bookingReference: string;
    response: "confirmed" | "declined";
    responseVersion: number;
  },
) {
  const route = await loadManagementEmailRoute(
    client,
    "attendance-confirmations",
  );
  const emailEnabled =
    route.enabled && route.emailEvents?.[input.response] !== false;
  if (input.response === "confirmed" && !emailEnabled) {
    return { delivered: false, suppressed: true };
  }

  const recipientIds = [...route.to, ...route.cc].map((recipient) => recipient.id);
  const deliveryId = emailEnabled
    ? await claimStaffEmailDelivery(client, {
        ccStaffProfileIds: route.cc.map((recipient) => recipient.id),
        eventKey: `${input.bookingId}:${input.responseVersion}`,
        notificationKey: "attendance-confirmations",
        toStaffProfileIds: route.to.map((recipient) => recipient.id),
      })
    : null;

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select(
      "booking_reference,customer_id,guest_count,show_id,customer:customers(first_name,surname),show:shows(date,time,venue)",
    )
    .eq("id", input.bookingId)
    .single();
  if (bookingError) throw bookingError;

  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer;
  const show = Array.isArray(booking.show) ? booking.show[0] : booking.show;
  if (!show) throw new Error("Attendance performance context is unavailable.");

  const guestName = [customer?.first_name, customer?.surname]
    .filter(Boolean)
    .join(" ") || "Guest";
  const attending = input.response === "confirmed";
  const subject = `${attending ? "Guest attending" : "Guest cannot attend"} · ${booking.booking_reference}`;
  const message = [
    attending
      ? "A guest has confirmed that they will attend."
      : "A guest has confirmed that they cannot attend.",
    "",
    `Booking: ${booking.booking_reference}`,
    `Guest: ${guestName}`,
    `Guests: ${booking.guest_count}`,
    `Venue: ${show.venue}`,
    `Performance: ${formatPerformance(show.date, show.time)}`,
    "",
    attending
      ? "The booking remains active. This response does not mark the guest as arrived."
      : "The booking remains active and requires Box Office review.",
  ].join("\n");

  const emailResult = deliveryId
    ? await (async () => {
        const branded = await createBrandedCustomerEmail({
          ctaLabel: "OPEN BOOKING",
          ctaUrl: `/admin?booking=${encodeURIComponent(booking.booking_reference)}`,
          heading: attending ? "Guest Is Attending" : "Guest Cannot Attend",
          includeAgePolicy: false,
          includeSecurityNotice: false,
          message,
          subject,
        });
        return sendZingaraEmail({
          attachments: branded.attachments,
          cc: route.cc.map((recipient) => recipient.email),
          html: branded.html,
          message,
          subject,
          to: route.to.map((recipient) => recipient.email),
        });
      })()
    : null;

  const operations: Promise<unknown>[] = [];
  if (deliveryId && emailResult) {
    operations.push(
      completeStaffEmailDelivery(client, deliveryId, {
        error: emailResult.ok ? undefined : emailResult.error,
        status: emailResult.ok ? "sent" : "failed",
      }),
      insertCommunicationPayload(client, {
        booking_id: input.bookingId,
        channel: "email",
        customer_id: booking.customer_id,
        message,
        sent_at: new Date().toISOString(),
        show_id: booking.show_id,
        status: emailResult.ok ? "sent" : "failed",
        subject,
        type: "custom_message",
      }),
    );
  }
  if (!attending) {
    operations.push(
      sendStaffPushNotification({
        body: `${booking.booking_reference} can no longer attend. The booking remains active and requires Box Office review.`,
        bookingReference: booking.booking_reference,
        notificationId: `attendance-declined-${input.bookingId}-${input.responseVersion}`,
        recipientStaffProfileIds: recipientIds,
        title: "Guest Cannot Attend",
        trigger: "attendance-declined",
      }),
    );
  }
  await Promise.all(operations);

  return {
    deduplicated: emailEnabled && !deliveryId,
    delivered: emailResult?.ok === true,
    suppressed: !emailEnabled,
  };
}
