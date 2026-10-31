import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { insertCommunicationPayload } from "@/lib/email/communicationIdempotency";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
  isPersonalEmailSubscriptionEnabled,
  loadManagementEmailRoute,
} from "@/lib/email/staffEmailNotifications";
import type { DemoWaitlistEntry } from "@/lib/zingaraDemo";

function formatPerformance(date: string, time: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${date}T${time}+02:00`));
}

export async function sendWaitlistStaffNotification(
  supabase: SupabaseClient,
  input: {
    customerId: string;
    entry: DemoWaitlistEntry;
    showId: string;
    source: "secret-guest-list" | "waitlist";
  },
) {
  const notificationKey =
    input.source === "secret-guest-list"
      ? "secret-guest-list"
      : "new-waitlist-enquiry";
  const [{ data: show, error: showError }, route] = await Promise.all([
    supabase
      .from("shows")
      .select("date,time,venue")
      .eq("id", input.showId)
      .maybeSingle(),
    loadManagementEmailRoute(supabase, notificationKey),
  ]);
  if (showError) throw showError;
  if (!show || !route.enabled) return;

  const [toEnabled, ccEnabled] = await Promise.all([
    Promise.all(
      route.to.map(async (recipient) => ({
        enabled: await isPersonalEmailSubscriptionEnabled(
          supabase,
          recipient.id,
          notificationKey,
        ),
        recipient,
      })),
    ),
    Promise.all(
      route.cc.map(async (recipient) => ({
        enabled: await isPersonalEmailSubscriptionEnabled(
          supabase,
          recipient.id,
          notificationKey,
        ),
        recipient,
      })),
    ),
  ]);
  const to = toEnabled.filter((item) => item.enabled).map((item) => item.recipient);
  const cc = ccEnabled.filter((item) => item.enabled).map((item) => item.recipient);
  const sourceLabel =
    input.source === "secret-guest-list"
      ? "The Secret Guest List"
      : "New Waitlist Enquiry";
  const subject = `${sourceLabel} · ${input.entry.customer.name}`;
  const performance = formatPerformance(show.date, show.time);
  const message = [
    input.source === "secret-guest-list"
      ? "A guest has joined The Secret Guest List."
      : "A guest has joined the Waitlist.",
    "",
    `Guest: ${input.entry.customer.name}`,
    `Mobile: ${input.entry.customer.phone}`,
    `Email: ${input.entry.customer.email}`,
    `Venue: ${show.venue}`,
    `Performance: ${performance}`,
    `Guests: ${input.entry.partySize}`,
    `Preferred seating: ${input.entry.desiredZoneTitle || "Any eligible seating section"}`,
    `Enquiry source: ${sourceLabel}`,
    `Reference: ${input.entry.id}`,
  ].join("\n");
  const deliveryId = await claimStaffEmailDelivery(supabase, {
    ccStaffProfileIds: cc.map((member) => member.id),
    eventKey: input.entry.id,
    notificationKey,
    toStaffProfileIds: to.map((member) => member.id),
  });

  if (!deliveryId) return;

  let result:
    | { error?: never; ok: true }
    | { error: string; ok: false; suppressed?: boolean };

  if (to.length === 0) {
    result = {
      error: `All primary ${sourceLabel} recipients disabled this email.`,
      ok: false,
      suppressed: true,
    };
  } else {
    const branded = await createBrandedCustomerEmail({
      ctaLabel: "OPEN WAITLIST ENTRY",
      ctaUrl: `/admin?waitlist=${encodeURIComponent(input.entry.id)}`,
      heading: sourceLabel,
      includeAgePolicy: false,
      includeSecurityNotice: false,
      message,
      subject,
    });
    result = await sendZingaraEmail({
      attachments: branded.attachments,
      cc: cc.map((member) => member.email),
      html: branded.html,
      message,
      replyTo: input.entry.customer.email,
      subject,
      to: to.map((member) => member.email),
    });
  }

  await Promise.all([
    completeStaffEmailDelivery(supabase, deliveryId, {
      error: result.ok ? undefined : result.error,
      status: result.ok ? "sent" : result.suppressed ? "suppressed" : "failed",
    }),
    insertCommunicationPayload(supabase, {
      booking_id: null,
      channel: "email",
      customer_id: input.customerId,
      message,
      sent_at: new Date().toISOString(),
      show_id: input.showId,
      status: result.ok ? "sent" : result.suppressed ? "suppressed" : "failed",
      subject,
      type: "custom_message",
    }),
  ]);
}

export async function sendSecretGuestListNotification(
  supabase: SupabaseClient,
  input: {
    customerId: string;
    entry: DemoWaitlistEntry;
    showId: string;
  },
) {
  return sendWaitlistStaffNotification(supabase, {
    ...input,
    source: "secret-guest-list",
  });
}
