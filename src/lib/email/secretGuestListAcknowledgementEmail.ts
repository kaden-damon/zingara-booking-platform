import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import {
  claimOneTimeEmailCommunication,
  completeClaimedEmailCommunication,
} from "@/lib/email/communicationIdempotency";
import {
  sendOperationalCustomerEmail,
  sendZingaraEmail,
} from "@/lib/email/smtp";
import type { DemoWaitlistEntry } from "@/lib/zingaraDemo";

export const secretGuestListAcknowledgementSubject =
  "🎪 You're on Zingara's Secret Guest List!";

const KADEN_STAFF_PROFILE_ID = "e8598359-54a0-4e1f-a635-1ec8ae02cb78";
const workflowKey = "secret_guest_list_customer_acknowledgement";

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPerformance(date: string, time: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${date}T${time}+02:00`));
}

function formatVenue(venue: string) {
  return venue
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export async function createSecretGuestListAcknowledgementEmail(input: {
  date: string;
  guestCount: number;
  isPreview?: boolean;
  time: string;
  venue: string;
}) {
  const performance = formatPerformance(input.date, input.time);
  const venue = formatVenue(input.venue);
  const previewNotice = input.isPreview
    ? "TEST EMAIL — CUSTOMER ACKNOWLEDGEMENT PREVIEW"
    : null;
  const legalNotice =
    "This email acknowledges receipt of an enquiry only. It does not constitute a confirmed booking, reservation or guarantee of availability. No seats have been reserved. A booking is confirmed only upon receipt of an official Zingara booking confirmation.";
  const message = [
    ...(previewNotice ? [previewNotice, ""] : []),
    "YOU'RE ON THE LIST!",
    "A little Zingara magic might be coming your way…",
    "",
    "The tent may be full, but who says the show is over?",
    "",
    "We've received your request to join us, and our Box Office team is seeing whether we can work a little magic and find you a place at the table!",
    "",
    "YOUR SECRET GUEST LIST REQUEST",
    `Performance: ${performance}`,
    `Venue: ${venue}`,
    `Number of guests: ${input.guestCount}`,
    "",
    "WHAT HAPPENS NEXT?",
    "",
    "Our Box Office team will review your request. If we can accommodate you, we'll be in touch using the contact details you provided.",
    "",
    "Keep an eye on your inbox (and your phone) — you never know when a little magic might come knocking!",
    "",
    "Until then, stay curious. Stay extraordinary.",
    "",
    "The Zingara Team",
    "",
    "LEGAL NOTICE",
    legalNotice,
    "",
    "This is a transactional acknowledgement sent because a Secret Guest List enquiry was submitted to Zingara.",
  ].join("\n");
  const html = `
    ${previewNotice ? `<div style="margin:0 0 18px;padding:10px 14px;border:1px solid #d8c36a;border-radius:999px;color:#f2d66c;font-size:11px;font-weight:700;letter-spacing:1.2px;text-align:center;">${escapeHtml(previewNotice)}</div>` : ""}
    <p style="margin:0;color:#d8c36a;font-size:13px;font-weight:700;letter-spacing:1.4px;text-align:center;">A LITTLE ZINGARA MAGIC MIGHT BE COMING YOUR WAY…</p>
    <p style="margin:22px 0 16px;color:#fffaf0;font-size:15px;line-height:1.65;">The tent may be full, but who says the show is over?</p>
    <p style="margin:0 0 22px;color:#fffaf0;font-size:15px;line-height:1.65;">We&#39;ve received your request to join us, and our Box Office team is seeing whether we can work a little magic and find you a place at the table!</p>
    <div style="margin:0 0 24px;padding:18px;border:1px solid #4f4525;border-radius:14px;background:#0e0c0a;">
      <div style="margin-bottom:13px;color:#f2d66c;font-size:12px;font-weight:700;letter-spacing:1.4px;">YOUR SECRET GUEST LIST REQUEST</div>
      <div style="color:#fffaf0;font-size:14px;line-height:1.75;"><strong>Performance:</strong> ${escapeHtml(performance)}<br /><strong>Venue:</strong> ${escapeHtml(venue)}<br /><strong>Number of guests:</strong> ${escapeHtml(input.guestCount)}</div>
    </div>
    <div style="margin:0 0 10px;color:#f2d66c;font-size:12px;font-weight:700;letter-spacing:1.4px;">WHAT HAPPENS NEXT?</div>
    <p style="margin:0 0 16px;color:#fffaf0;font-size:15px;line-height:1.65;">Our Box Office team will review your request. If we can accommodate you, we&#39;ll be in touch using the contact details you provided.</p>
    <p style="margin:0 0 16px;color:#fffaf0;font-size:15px;line-height:1.65;">Keep an eye on your inbox (and your phone) — you never know when a little magic might come knocking!</p>
    <p style="margin:0 0 22px;color:#fffaf0;font-size:15px;line-height:1.65;">Until then, stay curious. Stay extraordinary.<br /><br />The Zingara Team</p>
    <div style="margin:0 0 16px;padding:16px;border:1px solid #4f4525;border-radius:12px;background:#0e0c0a;">
      <div style="color:#f2d66c;font-size:11px;font-weight:700;letter-spacing:1.3px;">LEGAL NOTICE</div>
      <div style="margin-top:8px;color:#c4bfb7;font-size:12px;line-height:1.65;">${escapeHtml(legalNotice)}</div>
    </div>
    <p style="margin:0;color:#8f8a83;font-size:11px;line-height:1.6;">This is a transactional acknowledgement sent because a Secret Guest List enquiry was submitted to Zingara.</p>`;

  const branded = await createBrandedCustomerEmail({
    heading: "YOU'RE ON THE LIST!",
    html,
    includeAgePolicy: false,
    includePrimaryCta: false,
    includeSecurityNotice: false,
    message,
    subject: secretGuestListAcknowledgementSubject,
  });

  return {
    ...branded,
    performance,
    subject: secretGuestListAcknowledgementSubject,
    venue,
  };
}

export async function sendSecretGuestListCustomerAcknowledgement(
  supabase: SupabaseClient,
  input: {
    customerId: string;
    entry: DemoWaitlistEntry;
    showId: string;
  },
) {
  const [{ data: configuration, error: configurationError }, { data: show, error: showError }] =
    await Promise.all([
      supabase
        .from("workflow_configurations")
        .select("enabled")
        .eq("workflow_key", workflowKey)
        .maybeSingle(),
      supabase
        .from("shows")
        .select("date,time,venue")
        .eq("id", input.showId)
        .maybeSingle(),
    ]);

  if (configurationError) throw configurationError;
  if (showError) throw showError;
  if (!configuration?.enabled) return { status: "disabled" as const };
  if (!show) throw new Error("Secret Guest List performance was not found.");

  const email = await createSecretGuestListAcknowledgementEmail({
    date: show.date,
    guestCount: input.entry.partySize,
    time: show.time,
    venue: show.venue,
  });
  const claim = await claimOneTimeEmailCommunication(supabase, {
    booking_id: null,
    channel: "email",
    customer_id: input.customerId,
    message: email.message,
    show_id: input.showId,
    subject: email.subject,
    type: "custom_message",
  });

  if (!claim) return { status: "duplicate" as const };

  const result = await sendOperationalCustomerEmail({
    attachments: email.attachments,
    customerId: input.customerId,
    html: email.html,
    kind: "waitlist_update",
    message: email.message,
    subject: email.subject,
    to: input.entry.customer.email,
  });
  const status = result.ok ? "sent" : result.suppressed ? "suppressed" : "failed";

  await completeClaimedEmailCommunication(supabase, claim.id, {
    message: email.message,
    status,
    subject: email.subject,
  });

  return { error: result.ok ? null : result.error, status } as const;
}

export async function sendSecretGuestListCustomerAcknowledgementPreview(
  supabase: SupabaseClient,
) {
  const { data: kaden, error } = await supabase
    .from("staff_profiles")
    .select("id,user_id,full_name,email")
    .eq("id", KADEN_STAFF_PROFILE_ID)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!kaden?.email) throw new Error("Kaden's verified staff email is unavailable.");

  const email = await createSecretGuestListAcknowledgementEmail({
    date: "2026-11-04",
    guestCount: 4,
    isPreview: true,
    time: "17:00:00",
    venue: "johannesburg",
  });
  const claim = await claimOneTimeEmailCommunication(supabase, {
    booking_id: null,
    channel: "email",
    created_by: kaden.user_id,
    customer_id: null,
    message: email.message,
    show_id: null,
    subject: email.subject,
    type: "custom_message",
  });

  if (!claim) {
    return { email: kaden.email, status: "duplicate" as const };
  }

  const result = await sendZingaraEmail({
    attachments: email.attachments,
    html: email.html,
    message: email.message,
    subject: email.subject,
    to: kaden.email,
  });
  const status = result.ok ? "sent" : "failed";

  await completeClaimedEmailCommunication(supabase, claim.id, {
    message: email.message,
    status,
    subject: email.subject,
  });

  return {
    email: kaden.email,
    error: result.ok ? null : result.error,
    status,
  } as const;
}
