import { insertCommunicationPayload } from "@/lib/email/communicationIdempotency";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import {
  getManualReviewEligibilityReason,
  manualReviewInvitationLimitPerHour,
  normalizeReviewRecipientEmail,
  validateManualReviewRecipient,
} from "@/lib/reviews/manualReviewInvitations";
import {
  loadWorkflowConfigurations,
  renderConfiguredWorkflowEmail,
} from "@/lib/workflows/automatedWorkflows";
import {
  getReviewApplicationOrigin,
} from "@/lib/reviews/reviewServer";
import {
  buildVerifiedReviewUrl,
  createReviewToken,
  hashReviewToken,
  reviewInvitationLifetimeDays,
} from "@/lib/reviews/reviews";
import { openReviewToken, sealReviewToken } from "@/lib/reviews/reviewTokenVault";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvitationRow = {
  created_at: string;
  expires_at: string;
  id: string;
  invitation_type: "automated_verified" | "manual_email" | "manual_link";
  last_link_copied_at: string | null;
  recipient_email: string | null;
  recipient_name: string;
  revision: number;
  sent_at: string | null;
  status: "active" | "expired" | "revoked" | "submitted";
  submitted_at: string | null;
  token_envelope: unknown;
};

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function hasAccess(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const permissions = auth.staffProfile
    ? getRolePermissions(roleOf(auth.staffProfile))
    : [];
  return permissions.includes("bookings:manage") && permissions.includes("communications:manage");
}

function invitationStatus(row: InvitationRow) {
  if (row.status === "submitted") return "Review received";
  if (row.status === "revoked") return "Revoked";
  if (row.status === "expired" || new Date(row.expires_at) <= new Date()) return "Expired";
  if (row.invitation_type === "manual_link") return "Link copied";
  if (row.sent_at) return "Sent";
  return "Ready";
}

function publicInvitation(row: InvitationRow) {
  return {
    createdAt: row.created_at,
    id: row.id,
    invitationType: row.invitation_type,
    recipientName: row.recipient_name,
    revision: row.revision,
    sentAt: row.sent_at,
    status: invitationStatus(row),
    submittedAt: row.submitted_at,
  };
}

async function loadBooking(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  reference: string,
) {
  const { data: booking, error } = await serviceClient
    .from("bookings")
    .select("id,booking_reference,booking_status,payment_status,archived_at,customer_id,show_id,guest_count,section,total_amount,amount_paid,balance_outstanding,table_id")
    .eq("booking_reference", reference)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const { data: show, error: showError } = await serviceClient
    .from("shows")
    .select("id,name,date,time,venue,status")
    .eq("id", booking.show_id)
    .maybeSingle();
  if (showError) throw showError;
  if (!show) return null;
  return { booking, show };
}

function hasVenueAccess(scope: string[], venue: string) {
  const normalizedVenue = normalizeShowLocation(venue);
  const normalizedScope = normalizeStaffVenueScope(scope ?? []);
  return Boolean(
    normalizedVenue &&
      (normalizedScope.includes("all") || normalizedScope.includes(normalizedVenue)),
  );
}

async function listInvitations(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  bookingId: string,
) {
  const { data, error } = await serviceClient
    .from("review_invitations")
    .select("id,invitation_type,recipient_name,recipient_email,status,expires_at,sent_at,submitted_at,last_link_copied_at,created_at,token_envelope,revision")
    .eq("booking_id", bookingId)
    .in("invitation_type", ["manual_email", "manual_link"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InvitationRow[];
}

async function recordInvitationEvent(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  invitationId: string,
  eventType: "created" | "email_failed" | "email_sent" | "link_copied",
  staffProfileId: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await serviceClient.from("review_invitation_events").insert({
    actor_staff_profile_id: staffProfileId,
    event_type: eventType,
    invitation_id: invitationId,
    metadata,
  });
  if (error) throw error;
}

async function saveInvitation(input: {
  action: "create_link" | "send_email";
  bookingId: string;
  email: string | null;
  name: string;
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>;
  showId: string;
  staffProfileId: string;
}) {
  const invitationType = input.action === "send_email" ? "manual_email" : "manual_link";
  const normalizedEmail = input.email ? normalizeReviewRecipientEmail(input.email) : null;
  let existing: InvitationRow | null = null;

  if (normalizedEmail) {
    const result = await input.serviceClient
      .from("review_invitations")
      .select("id,invitation_type,recipient_name,recipient_email,status,expires_at,sent_at,submitted_at,last_link_copied_at,created_at,token_envelope,revision")
      .eq("booking_id", input.bookingId)
      .eq("invitation_type", "manual_email")
      .eq("normalized_email", normalizedEmail)
      .in("status", ["active", "submitted"])
      .maybeSingle();
    if (result.error) throw result.error;
    existing = result.data as InvitationRow | null;
  }

  if (existing?.status === "submitted") {
    throw new Error("REVIEW_ALREADY_SUBMITTED");
  }
  if (existing?.sent_at && existing.status === "active" && new Date(existing.expires_at) > new Date()) {
    throw new Error("REVIEW_ALREADY_SENT");
  }

  const existingToken = existing ? openReviewToken(existing.token_envelope) : null;
  const token =
    existingToken && existing && existing.status === "active" && new Date(existing.expires_at) > new Date()
      ? existingToken
      : createReviewToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + reviewInvitationLifetimeDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const values = {
    booking_id: input.bookingId,
    created_by_staff_profile_id: input.staffProfileId,
    expires_at: expiresAt,
    invitation_type: invitationType,
    normalized_email: normalizedEmail,
    recipient_email: input.email,
    recipient_name: input.name,
    revoked_at: null,
    show_id: input.showId,
    status: "active",
    submitted_at: null,
    sent_at: null,
    token_envelope: sealReviewToken(token),
    token_hash: hashReviewToken(token),
    updated_at: now.toISOString(),
  };
  const query = existing
    ? input.serviceClient.from("review_invitations").update(values).eq("id", existing.id)
    : input.serviceClient.from("review_invitations").insert(values);
  const { data, error } = await query
    .select("id,invitation_type,recipient_name,recipient_email,status,expires_at,sent_at,submitted_at,last_link_copied_at,created_at,token_envelope,revision")
    .single();
  if (error?.code === "23505" && normalizedEmail) {
    throw new Error("REVIEW_ALREADY_SENT");
  }
  if (error) throw error;
  if (!existing) {
    await recordInvitationEvent(
      input.serviceClient,
      data.id,
      "created",
      input.staffProfileId,
      { invitationType },
    );
  }
  return { invitation: data as InvitationRow, token };
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return { auth, error: auth.error };
  if (!hasAccess(auth)) {
    return {
      auth,
      error: Response.json(
        { error: "Booking and communications management access is required." },
        { status: 403 },
      ),
    };
  }
  return { auth, error: null };
}

export async function GET(request: Request) {
  const { auth, error } = await authorize(request);
  if (error || !auth.serviceClient || !auth.staffProfile) {
    return error ?? Response.json({ error: "Authentication is required." }, { status: 401 });
  }
  const reference = new URL(request.url).searchParams.get("bookingReference")?.trim().toUpperCase() ?? "";
  if (!reference) return Response.json({ error: "Booking reference is required." }, { status: 400 });

  try {
    const context = await loadBooking(auth.serviceClient, reference);
    if (!context) return Response.json({ error: "Booking not found." }, { status: 404 });
    if (!hasVenueAccess(auth.staffProfile.venue_scope, context.show.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    const reason = getManualReviewEligibilityReason({
      archivedAt: context.booking.archived_at,
      bookingReference: context.booking.booking_reference,
      bookingStatus: context.booking.booking_status,
      paymentStatus: context.booking.payment_status,
      showDate: context.show.date,
      showTime: context.show.time,
    });
    const invitations = await listInvitations(auth.serviceClient, context.booking.id);
    return Response.json({
      eligible: !reason,
      invitations: invitations.map(publicInvitation),
      reason,
    });
  } catch (loadError) {
    console.error("[Guest Reviews] Manual invitation list failed", loadError);
    return Response.json({ error: "Review invitations could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, error } = await authorize(request);
  if (error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return error ?? Response.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: "copy_existing" | "create_link" | "revoke" | "send_email";
      bookingReference?: string;
      email?: unknown;
      invitationId?: string;
      name?: unknown;
      revision?: number;
    };
    const reference = body.bookingReference?.trim().toUpperCase() ?? "";
    if (!reference || !body.action) {
      return Response.json({ error: "Choose a valid review invitation action." }, { status: 400 });
    }
    const context = await loadBooking(auth.serviceClient, reference);
    if (!context) return Response.json({ error: "Booking not found." }, { status: 404 });
    if (!hasVenueAccess(auth.staffProfile.venue_scope, context.show.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    const limit = await checkRateLimit(
      request,
      { limit: manualReviewInvitationLimitPerHour, scope: "manual_review_invitation", windowSeconds: 3600 },
      [auth.staffProfile.id, context.booking.id],
      auth.serviceClient,
    );
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

    if (body.action === "revoke") {
      if (!body.invitationId || !Number.isInteger(body.revision) || Number(body.revision) < 1) {
        return Response.json({ error: "Invitation revision is required." }, { status: 400 });
      }
      const { data, error: revokeError } = await auth.serviceClient.rpc(
        "revoke_manual_review_invitation_atomic",
        {
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_booking_id: context.booking.id,
          p_expected_revision: body.revision,
          p_invitation_id: body.invitationId,
        },
      );
      if (revokeError) {
        if (revokeError.message.includes("REVIEW_INVITATION_ALREADY_SUBMITTED")) {
          return Response.json(
            { error: "A review has already been submitted from this invitation." },
            { status: 409 },
          );
        }
        if (revokeError.message.includes("REVIEW_INVITATION_STALE_REVISION")) {
          return Response.json(
            { error: "This invitation changed. Refresh and try again." },
            { status: 409 },
          );
        }
        if (revokeError.message.includes("REVIEW_INVITATION_NOT_FOUND")) {
          return Response.json({ error: "Invitation not found." }, { status: 404 });
        }
        throw revokeError;
      }
      const result = data as { idempotent?: boolean; revision?: number; status?: string } | null;
      if (!result?.idempotent) {
        await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
          action: "manual_review_invitation_revoked",
          afterValues: {
            invitationId: body.invitationId,
            invitationType: "manual",
            status: result?.status ?? "revoked",
          },
          beforeValues: {},
          changedFields: ["reviewInvitationStatus"],
          entityId: context.booking.id,
          entityLocation: context.show.venue,
          entityReference: context.booking.booking_reference,
          entityType: "booking",
          outcome: "success",
          request,
          sourceArea: "Booking Details",
        });
      }
      return Response.json({
        idempotent: result?.idempotent === true,
        revision: result?.revision,
        status: "Revoked",
      });
    }

    const eligibilityReason = getManualReviewEligibilityReason({
      archivedAt: context.booking.archived_at,
      bookingReference: context.booking.booking_reference,
      bookingStatus: context.booking.booking_status,
      paymentStatus: context.booking.payment_status,
      showDate: context.show.date,
      showTime: context.show.time,
    });
    if (eligibilityReason) {
      return Response.json({ error: "Review invitations are only available for eligible completed bookings." }, { status: 409 });
    }

    if (body.action === "copy_existing") {
      if (!body.invitationId) return Response.json({ error: "Invitation is required." }, { status: 400 });
      const { data, error: invitationError } = await auth.serviceClient
        .from("review_invitations")
        .select("id,booking_id,status,expires_at,token_envelope")
        .eq("id", body.invitationId)
        .eq("booking_id", context.booking.id)
        .in("invitation_type", ["manual_email", "manual_link"])
        .maybeSingle();
      if (invitationError) throw invitationError;
      if (!data || data.status !== "active" || new Date(data.expires_at) <= new Date()) {
        return Response.json({ error: "This invitation link is no longer available." }, { status: 409 });
      }
      const token = openReviewToken(data.token_envelope);
      if (!token) return Response.json({ error: "This invitation link is unavailable." }, { status: 503 });
      const copiedAt = new Date().toISOString();
      const { error: updateError } = await auth.serviceClient
        .from("review_invitations")
        .update({ last_link_copied_at: copiedAt, updated_at: copiedAt })
        .eq("id", data.id);
      if (updateError) throw updateError;
      await recordInvitationEvent(auth.serviceClient, data.id, "link_copied", auth.staffProfile.id);
      return Response.json({ reviewUrl: buildVerifiedReviewUrl(getReviewApplicationOrigin(), token) });
    }

    const validated = validateManualReviewRecipient({
      action: body.action,
      email: body.email,
      name: body.name,
    });
    if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
    const saved = await saveInvitation({
      action: body.action,
      bookingId: context.booking.id,
      email: validated.value.email,
      name: validated.value.name,
      serviceClient: auth.serviceClient,
      showId: context.show.id,
      staffProfileId: auth.staffProfile.id,
    });
    const reviewUrl = buildVerifiedReviewUrl(getReviewApplicationOrigin(), saved.token);

    if (body.action === "create_link") {
      const copiedAt = new Date().toISOString();
      const { error: copyUpdateError } = await auth.serviceClient
        .from("review_invitations")
        .update({ last_link_copied_at: copiedAt, updated_at: copiedAt })
        .eq("id", saved.invitation.id);
      if (copyUpdateError) throw copyUpdateError;
      await recordInvitationEvent(auth.serviceClient, saved.invitation.id, "link_copied", auth.staffProfile.id);
      await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "review.manual_link_created",
        afterValues: { invitationId: saved.invitation.id, recipientName: validated.value.name },
        beforeValues: {},
        changedFields: ["manualReviewInvitation"],
        entityId: context.booking.id,
        entityLocation: context.show.venue,
        entityReference: context.booking.booking_reference,
        entityType: "booking",
        outcome: "success",
        request,
        sourceArea: "Booking Details",
      });
      return Response.json({ invitation: publicInvitation(saved.invitation), reviewUrl }, { status: 201 });
    }

    const reviewWorkflow = (await loadWorkflowConfigurations(auth.serviceClient)).find(
      (workflow) => workflow.workflowKey === "post_show_review",
    );
    if (!reviewWorkflow) {
      throw new Error("REVIEW_WORKFLOW_UNAVAILABLE");
    }
    const email = await renderConfiguredWorkflowEmail({
      booking: context.booking,
      configuration: reviewWorkflow,
      recipientName: validated.value.name,
      reviewUrl,
      show: context.show,
    });
    const sendResult = await sendZingaraEmail({
      attachments: email.attachments,
      html: email.html,
      message: email.message,
      sender: "review",
      subject: email.subject,
      to: validated.value.email,
    });
    await insertCommunicationPayload(auth.serviceClient, {
      booking_id: context.booking.id,
      channel: "email",
      customer_id: context.booking.customer_id,
      message: email.message,
      sent_at: sendResult.ok ? new Date().toISOString() : null,
      show_id: context.show.id,
      status: sendResult.ok ? "sent" : "failed",
      subject: email.subject,
      type: "post_show_review_manual",
    });
    await recordInvitationEvent(
      auth.serviceClient,
      saved.invitation.id,
      sendResult.ok ? "email_sent" : "email_failed",
      auth.staffProfile.id,
      { recipientEmail: validated.value.email },
    );
    if (!sendResult.ok) {
      return Response.json({ error: "The review request could not be sent. The invitation is ready to retry." }, { status: 502 });
    }
    const sentAt = new Date().toISOString();
    const { data: sentInvitation, error: updateError } = await auth.serviceClient
      .from("review_invitations")
      .update({ sent_at: sentAt, updated_at: sentAt })
      .eq("id", saved.invitation.id)
      .select("id,invitation_type,recipient_name,recipient_email,status,expires_at,sent_at,submitted_at,last_link_copied_at,created_at,token_envelope,revision")
      .single();
    if (updateError) throw updateError;
    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "review.manual_email_sent",
      afterValues: { invitationId: saved.invitation.id, recipientEmail: validated.value.email, recipientName: validated.value.name },
      beforeValues: {},
      changedFields: ["manualReviewInvitation", "communication"],
      entityId: context.booking.id,
      entityLocation: context.show.venue,
      entityReference: context.booking.booking_reference,
      entityType: "booking",
      outcome: "success",
      request,
      sourceArea: "Booking Details",
    });
    return Response.json({ invitation: publicInvitation(sentInvitation as InvitationRow) }, { status: 201 });
  } catch (postError) {
    const message = postError instanceof Error ? postError.message : "";
    if (message === "REVIEW_ALREADY_SUBMITTED") {
      return Response.json({ error: "This guest has already submitted a review." }, { status: 409 });
    }
    if (message === "REVIEW_ALREADY_SENT") {
      return Response.json({ error: "A review invitation has already been sent to this email for this booking." }, { status: 409 });
    }
    console.error("[Guest Reviews] Manual invitation action failed", postError);
    return Response.json({ error: "The review invitation could not be prepared." }, { status: 500 });
  }
}
