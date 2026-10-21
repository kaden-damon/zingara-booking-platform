import { sendZingaraEmail } from "@/lib/email/smtp";
import { createPlatformFeedbackEmail } from "@/lib/email/platformFeedbackEmail";
import { platformFeedbackCampaignKey } from "@/lib/platformFeedback";
import { loadPlatformFeedbackCampaignConfiguration } from "@/lib/platformFeedbackConfiguration";
import {
  createPlatformFeedbackToken,
  hashPlatformFeedbackToken,
  openPlatformFeedbackToken,
  sealPlatformFeedbackToken,
} from "@/lib/platformFeedbackTokenVault";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function hasApprovalAccess(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Boolean(
    auth.staffProfile &&
      getRolePermissions(roleOf(auth.staffProfile)).includes("settings:manage"),
  );
}

async function loadCampaign(client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>) {
  const { data, error } = await client
    .from("platform_feedback_campaigns")
    .select("id,campaign_key,status,created_at,updated_at")
    .eq("campaign_key", platformFeedbackCampaignKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The platform-feedback campaign is not configured.");
  return data;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!hasApprovalAccess(auth)) {
    return Response.json({ error: "Management settings access is required." }, { status: 403 });
  }
  try {
    const campaign = await loadCampaign(auth.serviceClient);
    const { data: deliveries, error } = await auth.serviceClient
      .from("platform_feedback_approval_deliveries")
      .select("recipient_email,status,attempt_count,accepted_at,last_error,updated_at")
      .eq("campaign_id", campaign.id)
      .order("recipient_email");
    if (error) throw error;
    return Response.json({ campaign, deliveries: deliveries ?? [] });
  } catch (error) {
    console.error("[Platform Feedback] Approval status failed", error);
    return Response.json({ error: "Approval status could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!hasApprovalAccess(auth)) {
    return Response.json({ error: "Management settings access is required." }, { status: 403 });
  }
  try {
    const campaign = await loadPlatformFeedbackCampaignConfiguration(auth.serviceClient);
    if (campaign.status !== "awaiting_approval") {
      return Response.json({ error: "The customer campaign is not awaiting approval." }, { status: 409 });
    }
    const body = (await request.json().catch(() => null)) as {
      idempotencyKey?: unknown;
      recipientStaffProfileIds?: unknown;
    } | null;
    const idempotencyKey =
      typeof body?.idempotencyKey === "string" && /^[0-9a-f-]{36}$/i.test(body.idempotencyKey)
        ? body.idempotencyKey
        : null;
    if (!idempotencyKey) {
      return Response.json({ error: "A valid send identity is required." }, { status: 400 });
    }
    const requestedIds = Array.isArray(body?.recipientStaffProfileIds)
      ? [...new Set(body.recipientStaffProfileIds.map(String))].slice(0, 10)
      : [];
    let staffQuery = auth.serviceClient
      .from("staff_profiles")
      .select("id,full_name,email,active")
      .eq("active", true)
      .not("email", "is", null);
    staffQuery = requestedIds.length
      ? staffQuery.in("id", requestedIds)
      : staffQuery.or("full_name.ilike.Kaden Damon,full_name.ilike.Nicky-Anne De Beer");
    const { data: staff, error: staffError } = await staffQuery;
    if (staffError) throw staffError;
    const recipients = staff ?? [];
    if (
      recipients.length === 0 ||
      (requestedIds.length > 0 && recipients.length !== requestedIds.length) ||
      (requestedIds.length === 0 && recipients.length !== 2)
    ) {
      return Response.json(
        { error: "Choose active staff recipients with verified email addresses." },
        { status: 409 },
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || "https://book.zingara.co.za";
    const results: Array<{ accepted: boolean; email: string; reason: string }> = [];
    for (const recipient of recipients) {
      if (!recipient?.email) continue;
      const normalizedEmail = recipient.email.trim().toLowerCase();
      const { data: existingDelivery, error: deliveryLoadError } = await auth.serviceClient
        .from("platform_feedback_approval_deliveries")
        .select("id,status,attempt_count")
        .eq("campaign_id", campaign.id)
        .eq("staff_profile_id", recipient.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (deliveryLoadError) throw deliveryLoadError;
      if (existingDelivery?.status === "accepted") {
        results.push({ accepted: true, email: normalizedEmail, reason: "already_accepted" });
        continue;
      }

      const { data: existingLink, error: linkError } = await auth.serviceClient
        .from("platform_feedback_approval_links")
        .select("id,token_envelope,expires_at")
        .eq("campaign_id", campaign.id)
        .eq("staff_profile_id", recipient.id)
        .maybeSingle();
      if (linkError) throw linkError;
      let token =
        existingLink && new Date(existingLink.expires_at) > new Date()
          ? openPlatformFeedbackToken(existingLink.token_envelope)
          : null;
      token ??= createPlatformFeedbackToken();
      const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
      const linkPayload = {
        campaign_id: campaign.id,
        expires_at: expiresAt,
        staff_profile_id: recipient.id,
        token_envelope: sealPlatformFeedbackToken(token),
        token_hash: hashPlatformFeedbackToken(token),
      };
      const { error: linkWriteError } = existingLink
        ? await auth.serviceClient.from("platform_feedback_approval_links").update(linkPayload).eq("id", existingLink.id)
        : await auth.serviceClient.from("platform_feedback_approval_links").insert(linkPayload);
      if (linkWriteError) throw linkWriteError;

      const deliveryPayload = {
        campaign_id: campaign.id,
        idempotency_key: idempotencyKey,
        last_error: null,
        recipient_email: normalizedEmail,
        staff_profile_id: recipient.id,
        status: "processing",
        updated_at: new Date().toISOString(),
      };
      const { data: delivery, error: deliveryError } = existingDelivery
        ? await auth.serviceClient
            .from("platform_feedback_approval_deliveries")
            .update({ ...deliveryPayload, attempt_count: existingDelivery.attempt_count + 1 })
            .eq("id", existingDelivery.id)
            .select("id")
            .single()
        : await auth.serviceClient
            .from("platform_feedback_approval_deliveries")
            .insert({ ...deliveryPayload, attempt_count: 1 })
            .select("id")
            .single();
      if (deliveryError) throw deliveryError;

      const firstName = recipient.full_name.trim().split(/\s+/)[0] || null;
      const feedbackUrl = new URL(`/feedback/approval/${token}`, origin).toString();
      const email = await createPlatformFeedbackEmail({
        feedbackUrl,
        firstName,
        template: campaign.template,
      });
      const sent = await sendZingaraEmail({
        attachments: email.attachments,
        html: email.html,
        message: email.message,
        subject: email.subject,
        to: normalizedEmail,
      });
      await auth.serviceClient
        .from("platform_feedback_approval_deliveries")
        .update({
          accepted_at: sent.ok ? new Date().toISOString() : null,
          last_error: sent.ok ? null : sent.error?.slice(0, 1000),
          status: sent.ok ? "accepted" : "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      results.push({
        accepted: sent.ok,
        email: normalizedEmail,
        reason: sent.ok ? "provider_accepted" : "provider_failed",
      });
    }

    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "platform_feedback.approval_emails",
      afterValues: {
        accepted: results.filter((result) => result.accepted).length,
        campaignStatus: campaign.status,
        recipientCount: results.length,
      },
      entityId: campaign.id,
      entityReference: platformFeedbackCampaignKey,
      entityType: "workflow",
      outcome: results.every((result) => result.accepted) ? "success" : "failed",
      request,
      sourceArea: "reviews",
    });
    return Response.json({ campaignStatus: campaign.status, results });
  } catch (error) {
    console.error("[Platform Feedback] Approval email send failed", error);
    return Response.json({ error: "The approval emails could not be sent." }, { status: 500 });
  }
}
