import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage")) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }
  let replyId: string | null = null;
  let providerAccepted = false;
  try {
    const body = (await request.json()) as { feedbackId?: string; idempotencyKey?: string; message?: string };
    const message = body.message?.trim() ?? "";
    if (!body.feedbackId || !body.idempotencyKey || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey) || message.length < 1 || message.length > 4000) {
      return Response.json({ error: "Enter a reply before sending." }, { status: 400 });
    }
    const { data: feedback, error: feedbackError } = await auth.serviceClient
      .from("platform_feedback_submissions")
      .select("id,booking_id,customer_id,venue")
      .eq("id", body.feedbackId)
      .maybeSingle();
    if (feedbackError) throw feedbackError;
    if (!feedback) return Response.json({ error: "Platform feedback was not found." }, { status: 404 });
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
    if (!scope.includes("all") && !scope.includes(feedback.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    const [{ data: customer, error: customerError }, { data: booking, error: bookingError }] = await Promise.all([
      auth.serviceClient.from("customers").select("first_name,email").eq("id", feedback.customer_id).maybeSingle(),
      auth.serviceClient.from("bookings").select("booking_reference").eq("id", feedback.booking_id).maybeSingle(),
    ]);
    if (customerError || bookingError) throw customerError || bookingError;
    if (!customer?.email) return Response.json({ error: "This guest does not have an email address." }, { status: 409 });
    const actorName = auth.staffProfile.full_name;
    const actorEmail = auth.staffProfile.email;
    const claim = await auth.serviceClient.rpc("claim_platform_feedback_reply", {
      p_actor_email: actorEmail,
      p_actor_name: actorName,
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_feedback_id: feedback.id,
      p_idempotency_key: body.idempotencyKey,
      p_message: message,
      p_recipient_email: customer.email,
    });
    if (claim.error) throw claim.error;
    replyId = typeof claim.data === "string" ? claim.data : null;
    if (!replyId) return Response.json({ duplicate: true });
    const subject = "A reply from Zingara about your booking experience";
    const plain = `Hi ${customer.first_name || "there"},\n\n${message}\n\n${actorName}\n${actorEmail}`;
    const branded = await createBrandedCustomerEmail({
      heading: "A reply from Zingara",
      html: `<p style="margin:0 0 18px;color:#e7e5e4;line-height:1.7;">Hi ${escapeHtml(customer.first_name || "there")},</p><div style="white-space:pre-wrap;color:#fffaf0;line-height:1.7;">${escapeHtml(message)}</div><p style="margin:22px 0 0;color:#d8c36a;line-height:1.6;"><strong>${escapeHtml(actorName)}</strong><br />${escapeHtml(actorEmail)}</p>`,
      includeAgePolicy: false,
      message: plain,
      subject,
    });
    const sent = await sendZingaraEmail({
      attachments: branded.attachments,
      html: branded.html,
      message: branded.message,
      replyTo: actorEmail,
      sender: "review",
      subject,
      to: customer.email,
    });
    providerAccepted = sent.ok;
    await auth.serviceClient.rpc("complete_platform_feedback_reply", {
      p_error: sent.ok ? null : sent.error,
      p_reply_id: replyId,
      p_status: sent.ok ? "sent" : "failed",
    });
    if (!sent.ok) throw new Error(sent.error);
    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "platform_feedback.reply_sent",
      afterValues: { replyId },
      changedFields: ["reply"],
      entityId: feedback.id,
      entityLocation: feedback.venue,
      entityReference: booking?.booking_reference ?? feedback.id,
      entityType: "review",
      outcome: "success",
      request,
      sourceArea: "Reviews",
    });
    return Response.json({ sent: true });
  } catch (error) {
    if (replyId && !providerAccepted) {
      await auth.serviceClient.rpc("complete_platform_feedback_reply", {
        p_error: error instanceof Error ? error.message : "Unknown email failure",
        p_reply_id: replyId,
        p_status: "failed",
      });
    }
    console.error("[Platform Feedback] Reply could not be sent", error);
    return Response.json({ error: "The reply couldn't be sent. Try again." }, { status: 500 });
  }
}
