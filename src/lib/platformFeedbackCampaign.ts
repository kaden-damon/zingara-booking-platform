import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import { createPlatformFeedbackEmail } from "@/lib/email/platformFeedbackEmail";
import {
  dedupePlatformFeedbackCandidates,
  type PlatformFeedbackCandidate,
} from "@/lib/platformFeedback";
import {
  createPlatformFeedbackToken,
  hashPlatformFeedbackToken,
  openPlatformFeedbackToken,
  sealPlatformFeedbackToken,
} from "@/lib/platformFeedbackTokenVault";
import { loadPlatformFeedbackCampaignConfiguration } from "@/lib/platformFeedbackConfiguration";

const batchSize = 25;

export async function loadPlatformFeedbackCandidates(client: SupabaseClient) {
  const candidates: PlatformFeedbackCandidate[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await client
      .from("bookings")
      .select("id,customer_id,show_id,booking_origin,booking_source,booking_status,payment_status,archived_at,created_at,customers(first_name,email),shows(venue)")
      .eq("booking_origin", "customer_public")
      .eq("booking_source", "online")
      .order("created_at", { ascending: false })
      .range(from, from + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      const customerValue = row.customers as unknown as { email?: string | null; first_name?: string | null } | Array<{ email?: string | null; first_name?: string | null }> | null;
      const showValue = row.shows as unknown as { venue?: string | null } | Array<{ venue?: string | null }> | null;
      const customer = Array.isArray(customerValue) ? customerValue[0] : customerValue;
      const show = Array.isArray(showValue) ? showValue[0] : showValue;
      candidates.push({
        archivedAt: row.archived_at,
        bookingId: row.id,
        bookingOrigin: row.booking_origin,
        bookingSource: row.booking_source,
        bookingStatus: row.booking_status,
        customerId: row.customer_id,
        email: customer?.email ?? null,
        firstName: customer?.first_name ?? null,
        paymentStatus: row.payment_status,
        showId: row.show_id,
        venue: show?.venue ?? "",
      });
    }
    if ((data?.length ?? 0) < 500) break;
  }
  return dedupePlatformFeedbackCandidates(candidates);
}

export async function preparePlatformFeedbackCampaign(client: SupabaseClient) {
  const current = await loadPlatformFeedbackCampaignConfiguration(client);
  if (current.status !== "approved") throw new Error("PLATFORM_FEEDBACK_CAMPAIGN_NOT_APPROVED");
  if (!current.automationEnabled) throw new Error("PLATFORM_FEEDBACK_AUTOMATION_DISABLED");
  const candidates = await loadPlatformFeedbackCandidates(client);
  let created = 0;
  for (const candidate of candidates) {
    const token = createPlatformFeedbackToken();
    const { error } = await client.from("platform_feedback_invitations").insert({
      booking_id: candidate.bookingId,
      campaign_id: current.id,
      customer_id: candidate.customerId,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      first_name: candidate.firstName?.trim() || null,
      recipient_email: candidate.email?.trim().toLowerCase(),
      show_id: candidate.showId,
      token_envelope: sealPlatformFeedbackToken(token),
      token_hash: hashPlatformFeedbackToken(token),
      venue: candidate.venue,
    });
    if (error?.code === "23505") continue;
    if (error) throw error;
    created += 1;
  }
  const { error: statusError } = await client
    .from("platform_feedback_campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .eq("status", "approved");
  if (statusError) throw statusError;
  return { created, eligible: candidates.length };
}

export async function sendPlatformFeedbackCampaignBatch(client: SupabaseClient, origin: string) {
  const current = await loadPlatformFeedbackCampaignConfiguration(client);
  if (!["approved", "sending"].includes(current.status)) throw new Error("PLATFORM_FEEDBACK_CAMPAIGN_NOT_APPROVED");
  if (!current.automationEnabled) throw new Error("PLATFORM_FEEDBACK_AUTOMATION_DISABLED");
  const { data: invitations, error } = await client
    .from("platform_feedback_invitations")
    .select("id,customer_id,recipient_email,first_name,token_envelope")
    .eq("campaign_id", current.id)
    .eq("status", "active")
    .is("sent_at", null)
    .order("created_at")
    .limit(batchSize);
  if (error) throw error;
  if (!invitations?.length) {
    const { error: completionError } = await client
      .from("platform_feedback_campaigns")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .eq("status", "sending");
    if (completionError) throw completionError;
    return { accepted: 0, attempted: 0, failed: 0, suppressed: 0 };
  }
  let accepted = 0;
  let failed = 0;
  let suppressed = 0;
  for (const invitation of invitations ?? []) {
    const token = openPlatformFeedbackToken(invitation.token_envelope);
    if (!token) {
      failed += 1;
      continue;
    }
    const feedbackUrl = new URL(`/feedback/${token}`, origin).toString();
    const email = await createPlatformFeedbackEmail({
      feedbackUrl,
      firstName: invitation.first_name,
      template: current.template,
    });
    const sent = await sendOperationalCustomerEmail({
      attachments: email.attachments,
      customerId: invitation.customer_id,
      html: email.html,
      kind: "booking_feedback",
      message: email.message,
      subject: email.subject,
      to: invitation.recipient_email,
    });
    if (sent.ok) {
      accepted += 1;
      await client.from("platform_feedback_invitations").update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", invitation.id).is("sent_at", null);
    } else if (sent.suppressed) {
      suppressed += 1;
    } else {
      failed += 1;
      break;
    }
  }
  return { accepted, attempted: invitations?.length ?? 0, failed, suppressed };
}

export async function runApprovedPlatformFeedbackCampaign(
  client: SupabaseClient,
  origin: string,
) {
  const current = await loadPlatformFeedbackCampaignConfiguration(client);
  if (!current.automationEnabled) return { reason: "disabled" as const };
  if (!["approved", "sending"].includes(current.status)) {
    return { reason: current.status as "awaiting_approval" | "cancelled" | "completed" };
  }
  const prepared = current.status === "approved"
    ? await preparePlatformFeedbackCampaign(client)
    : null;
  const batch = await sendPlatformFeedbackCampaignBatch(client, origin);
  return { batch, prepared, reason: "processed" as const };
}
