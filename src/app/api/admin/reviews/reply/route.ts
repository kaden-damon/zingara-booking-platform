import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Boolean(auth.staffProfile && getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage"));
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Communications management access is required." }, { status: 403 });

  let replyId: string | null = null;
  let providerAccepted = false;
  try {
    const body = await request.json() as { idempotencyKey?: string; message?: string; reviewId?: string };
    const message = body.message?.trim() ?? "";
    if (!body.reviewId || !/^[0-9a-f-]{36}$/i.test(body.reviewId) || !body.idempotencyKey || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey) || message.length < 1 || message.length > 4000) {
      return Response.json({ error: "Enter a reply before sending." }, { status: 400 });
    }
    const { data: review, error: reviewError } = await auth.serviceClient
      .from("guest_reviews")
      .select("id,booking_id,venue,public_display_name")
      .eq("id", body.reviewId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return Response.json({ error: "Review not found." }, { status: 404 });
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
    if (!scope.includes("all") && !scope.includes(review.venue)) return Response.json({ error: "You do not have access to this venue." }, { status: 403 });

    const { data: booking, error: bookingError } = await auth.serviceClient.from("bookings").select("customer_id,booking_reference").eq("id", review.booking_id).maybeSingle();
    if (bookingError) throw bookingError;
    const { data: customer, error: customerError } = booking?.customer_id
      ? await auth.serviceClient.from("customers").select("first_name,email").eq("id", booking.customer_id).maybeSingle()
      : { data: null, error: null };
    if (customerError) throw customerError;
    if (!customer?.email) return Response.json({ error: "This guest does not have an email address." }, { status: 409 });

    const actorName = auth.staffProfile.full_name;
    const actorEmail = auth.staffProfile.email;
    if (!actorName || !actorEmail) return Response.json({ error: "Your staff profile needs a name and email address." }, { status: 409 });
    const claim = await auth.serviceClient.rpc("claim_guest_review_reply", {
      p_actor_email: actorEmail,
      p_actor_name: actorName,
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_idempotency_key: body.idempotencyKey,
      p_message: message,
      p_recipient_email: customer.email,
      p_review_id: review.id,
    });
    if (claim.error) throw claim.error;
    replyId = typeof claim.data === "string" ? claim.data : null;
    if (!replyId) return Response.json({ duplicate: true });

    const subject = "A reply from Zingara about your review";
    const plain = `Hi ${customer.first_name || "there"},\n\n${message}\n\n${actorName}\n${actorEmail}`;
    const branded = await createBrandedCustomerEmail({
      heading: "A reply from Zingara",
      html: `<p style="margin:0 0 18px;color:#e7e5e4;line-height:1.7;">Hi ${escapeHtml(customer.first_name || "there")},</p><div style="white-space:pre-wrap;color:#fffaf0;line-height:1.7;">${escapeHtml(message)}</div><p style="margin:22px 0 0;color:#d8c36a;line-height:1.6;"><strong>${escapeHtml(actorName)}</strong><br />${escapeHtml(actorEmail)}</p>`,
      includeAgePolicy: false,
      message: plain,
      subject,
    });
    const sent = await sendZingaraEmail({ attachments: branded.attachments, html: branded.html, message: branded.message, replyTo: actorEmail, sender: "review", subject, to: customer.email });
    providerAccepted = sent.ok;
    await auth.serviceClient.rpc("complete_guest_review_reply", { p_error: sent.ok ? null : sent.error, p_reply_id: replyId, p_status: sent.ok ? "sent" : "failed" });
    if (!sent.ok) throw new Error(sent.error);
    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "review.reply_sent", afterValues: { replyId }, changedFields: ["reply"],
      entityId: review.id, entityLocation: review.venue, entityReference: booking?.booking_reference ?? review.id,
      entityType: "review", outcome: "success", request, sourceArea: "Guest Reviews",
    });
    return Response.json({ sent: true });
  } catch (error) {
    if (replyId && !providerAccepted) await auth.serviceClient.rpc("complete_guest_review_reply", { p_error: error instanceof Error ? error.message : "Unknown email failure", p_reply_id: replyId, p_status: "failed" });
    console.error("[Guest Reviews] Reply could not be sent", error);
    return Response.json({ error: "The reply couldn't be sent. Try again." }, { status: 500 });
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
