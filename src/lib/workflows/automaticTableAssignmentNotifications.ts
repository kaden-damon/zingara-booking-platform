import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendStaffPushNotification } from "@/lib/supabase/staffPush";

type NotificationEvent = {
  event_type: "review_reminder" | "threshold_reached";
  id: string;
  payload: {
    occupancyGuests?: number;
    occupancyPercent?: number;
    remainingTicketCapacity?: number;
    showDate?: string;
    showTime?: string;
    thresholdPercent?: number;
    venue?: string;
  };
  show_id: string;
};

function venueLabel(value?: string) {
  return value === "johannesburg" ? "Johannesburg" : value === "cape-town" ? "Cape Town" : "Zingara";
}

function eventMessage(event: NotificationEvent) {
  const payload = event.payload ?? {};
  const performance = [venueLabel(payload.venue), payload.showDate, payload.showTime?.slice(0, 5)]
    .filter(Boolean)
    .join(" · ");
  if (event.event_type === "review_reminder") {
    return `${performance}: review the remaining physical seating and decide whether to continue manual allocation or resume automatic assignment. Ticket sales remain open.`;
  }
  return `${performance}: ${payload.occupancyGuests ?? 0} guests (${payload.occupancyPercent ?? 0}%) reached the ${payload.thresholdPercent ?? 70}% physical-layout threshold. Automatic assignment paused; ${payload.remainingTicketCapacity ?? 0} ticket-sale seats remain.`;
}

export async function runAutomaticTableAssignmentNotifications(client: SupabaseClient) {
  const { error: reminderError } = await client.rpc(
    "enqueue_automatic_assignment_review_reminders",
    { p_limit: 50 },
  );
  if (reminderError) throw reminderError;

  const claimToken = randomUUID();
  const { data, error } = await client.rpc(
    "claim_automatic_assignment_notifications",
    { p_claim_token: claimToken, p_limit: 10 },
  );
  if (error) throw error;

  let delivered = 0;
  let failed = 0;
  for (const event of (data ?? []) as NotificationEvent[]) {
    try {
      const result = await sendStaffPushNotification({
        body: eventMessage(event),
        notificationId: `automatic-table-assignment-${event.id}`,
        title: event.event_type === "review_reminder" ? "Table Assignment Review" : "Automatic Assignment Paused",
        trigger: "floor-assignment-paused",
        url: `/admin?section=floor&show=${encodeURIComponent(event.show_id)}`,
      });
      const { error: completionError } = await client.rpc(
        "complete_automatic_assignment_notification",
        {
          p_claim_token: claimToken,
          p_delivered: true,
          p_error: null,
          p_event_id: event.id,
        },
      );
      if (completionError) throw completionError;
      delivered += 1;
      if (!result.ok) {
        console.info("[Automatic table assignment] In-app notification saved without a web-push delivery.", {
          eventId: event.id,
        });
      }
    } catch (deliveryError) {
      failed += 1;
      await client.rpc("complete_automatic_assignment_notification", {
        p_claim_token: claimToken,
        p_delivered: false,
        p_error: deliveryError instanceof Error ? deliveryError.message : "Notification delivery failed.",
        p_event_id: event.id,
      });
    }
  }
  return { claimed: (data ?? []).length, delivered, failed };
}
