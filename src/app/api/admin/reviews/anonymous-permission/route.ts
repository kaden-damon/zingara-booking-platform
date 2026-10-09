import { insertCommunicationPayload } from "@/lib/email/communicationIdempotency";
import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import {
  buildAnonymousReviewPermissionUrl,
  createReviewToken,
  hashReviewToken,
  reviewInvitationLifetimeDays,
} from "@/lib/reviews/reviews";
import { getReviewApplicationOrigin } from "@/lib/reviews/reviewServer";
import { sealReviewToken } from "@/lib/reviews/reviewTokenVault";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function allowedVenues(scope: string[]) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  if (normalized.includes("all")) return ["cape-town", "johannesburg"];
  return normalized.filter((venue) => venue === "cape-town" || venue === "johannesburg");
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage")) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { reviewId?: string };
    if (!body.reviewId || !/^[0-9a-f-]{36}$/i.test(body.reviewId)) {
      return Response.json({ error: "Choose a valid review." }, { status: 400 });
    }

    const { data: review, error: reviewError } = await auth.serviceClient
      .from("guest_reviews")
      .select("id,booking_id,customer_id,venue,moderation_status,publication_consent_mode")
      .eq("id", body.reviewId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return Response.json({ error: "Review not found." }, { status: 404 });
    if (!allowedVenues(auth.staffProfile.venue_scope).includes(review.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    if (review.publication_consent_mode !== "private") {
      return Response.json({ error: "This review already has a publication choice." }, { status: 409 });
    }

    const [{ data: booking, error: bookingError }, { data: customer, error: customerError }] =
      await Promise.all([
        auth.serviceClient
          .from("bookings")
          .select("id,booking_reference,show_id,customer_id")
          .eq("id", review.booking_id)
          .maybeSingle(),
        review.customer_id
          ? auth.serviceClient
              .from("customers")
              .select("id,email,first_name")
              .eq("id", review.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (bookingError || customerError) throw bookingError ?? customerError;
    const email = customer?.email?.trim().toLowerCase();
    if (!booking || !customer || !email) {
      return Response.json({ error: "This guest does not have an email address." }, { status: 409 });
    }

    const { data: existing, error: existingError } = await auth.serviceClient
      .from("review_anonymous_permission_requests")
      .select("id,status,sent_at,expires_at")
      .eq("review_id", review.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.status !== "failed") {
      return Response.json({ request: existing, reused: true });
    }

    const token = createReviewToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + reviewInvitationLifetimeDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const values = {
      expires_at: expiresAt,
      recipient_email: email,
      requested_at: now.toISOString(),
      requested_by_staff_profile_id: auth.staffProfile.id,
      review_id: review.id,
      sent_at: null,
      status: "pending",
      token_envelope: sealReviewToken(token),
      token_hash: hashReviewToken(token),
      updated_at: now.toISOString(),
    };
    const requestQuery = existing
      ? auth.serviceClient.from("review_anonymous_permission_requests").update(values).eq("id", existing.id)
      : auth.serviceClient.from("review_anonymous_permission_requests").insert(values);
    const { data: permissionRequest, error: saveError } = await requestQuery
      .select("id,status,sent_at,expires_at")
      .single();
    if (saveError?.code === "23505") {
      return Response.json({ error: "An anonymous permission request already exists." }, { status: 409 });
    }
    if (saveError) throw saveError;

    const permissionUrl = buildAnonymousReviewPermissionUrl(getReviewApplicationOrigin(), token);
    const guestName = customer.first_name?.trim() || "Guest";
    const message = `Dear ${guestName}, you asked us to keep your Zingara review private. May we publish the review without your name? This is optional. Choose your preference here: ${permissionUrl}`;
    const subject = "May Zingara publish your review anonymously?";
    const sendResult = await sendOperationalCustomerEmail({
      ctaLabel: "CHOOSE MY PREFERENCE",
      customerId: customer.id,
      hidePrimaryUrlInHtml: true,
      kind: "post_show_review",
      message,
      subject,
      to: email,
    });
    const deliveryStatus = sendResult.ok ? "sent" : sendResult.suppressed ? "suppressed" : "failed";
    const [requestUpdate, communication, event] = await Promise.all([
      auth.serviceClient
        .from("review_anonymous_permission_requests")
        .update({
          sent_at: sendResult.ok ? new Date().toISOString() : null,
          status: sendResult.ok ? "pending" : "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", permissionRequest.id),
      insertCommunicationPayload(auth.serviceClient, {
        booking_id: booking.id,
        channel: "email",
        customer_id: customer.id,
        message,
        sent_at: new Date().toISOString(),
        show_id: booking.show_id,
        status: deliveryStatus,
        subject,
        type: "review_anonymous_permission",
      }),
      auth.serviceClient.from("guest_review_events").insert({
        actor_staff_profile_id: auth.staffProfile.id,
        event_type: sendResult.ok ? "anonymous_permission_requested" : "anonymous_permission_request_failed",
        from_status: review.moderation_status,
        metadata: { permission_request_id: permissionRequest.id },
        review_id: review.id,
        to_status: review.moderation_status,
      }),
    ]);
    if (requestUpdate.error || event.error) {
      throw requestUpdate.error ?? event.error;
    }
    if (!communication) {
      throw new Error("Permission communication evidence could not be recorded.");
    }

    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "review.request_anonymous_permission",
      afterValues: { deliveryStatus, permissionRequestId: permissionRequest.id },
      beforeValues: { publicationConsentMode: review.publication_consent_mode },
      changedFields: ["anonymousPermissionRequest"],
      entityId: review.id,
      entityLocation: review.venue,
      entityReference: booking.booking_reference,
      entityType: "review",
      outcome: sendResult.ok ? "success" : "failed",
      request,
      sourceArea: "Guest Reviews",
    });

    if (!sendResult.ok) {
      return Response.json(
        { error: sendResult.suppressed ? "Customer emails are temporarily paused." : "The permission request could not be sent." },
        { status: sendResult.suppressed ? 409 : 502 },
      );
    }
    return Response.json({ request: { ...permissionRequest, sent_at: new Date().toISOString() } });
  } catch (error) {
    console.error("[Guest Reviews] Anonymous permission request failed", error);
    return Response.json({ error: "The permission request could not be sent." }, { status: 500 });
  }
}
