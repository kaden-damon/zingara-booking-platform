import {
  sendGuestPushNotification,
  type GuestPushTrigger,
} from "@/lib/supabase/staffPush";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
import {
  recordPlatformFailureEventBestEffort,
  recoverPlatformIncidentBestEffort,
} from "@/lib/platformTelemetry";
import {
  getRolePermissions,
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const guestPushTriggers = new Set<GuestPushTrigger>([
  "custom-message",
  "payment-received",
  "reservation-cancelled",
  "reservation-confirmed",
  "reservation-pending-payment",
  "ticket-resend",
  "waitlist-promoted",
]);

export async function POST(request: Request) {
  const serviceClient = getServiceClient();

  try {
    const auth = await requireActiveStaff(request);

    if (auth.error || !auth.staffProfile) {
      return auth.error;
    }

    const role = Array.isArray(auth.staffProfile.roles)
      ? auth.staffProfile.roles[0]
      : auth.staffProfile.roles;

    if (!getRolePermissions(role).includes("communications:manage")) {
      return Response.json(
        { error: "Communication management access is required." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      bookingReference?: string;
      message?: string;
      title?: string;
      trigger?: GuestPushTrigger;
    };

    if (!body.trigger || !guestPushTriggers.has(body.trigger)) {
      return Response.json(
        { error: "A valid guest push trigger is required." },
        { status: 400 },
      );
    }

    if (!body.bookingReference) {
      return Response.json(
        { error: "A booking reference is required." },
        { status: 400 },
      );
    }

    const ipLimit = await checkRateLimit(
      request,
      {
        limit: 30,
        scope: "guest_push_ip",
        windowSeconds: 300,
      },
      [],
      serviceClient,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(
        ipLimit.retryAfterSeconds,
        {
          bookingReference: body.bookingReference,
          operation: "send_guest_push",
          route: "/api/guest-push",
          safeFingerprint: "guest_push_rate_limited_ip",
        },
        serviceClient,
      );
    }

    const bookingLimit = await checkRateLimit(
      request,
      {
        limit: 8,
        scope: "guest_push_booking",
        windowSeconds: 600,
      },
      [body.bookingReference, body.trigger],
      serviceClient,
    );

    if (!bookingLimit.allowed) {
      return rateLimitResponse(
        bookingLimit.retryAfterSeconds,
        {
          bookingReference: body.bookingReference,
          operation: "send_guest_push",
          route: "/api/guest-push",
          safeFingerprint: "guest_push_rate_limited_booking",
        },
        serviceClient,
      );
    }

    const result = await sendGuestPushNotification({
      bookingReference: body.bookingReference,
      body: body.message,
      title: body.title,
      trigger: body.trigger,
    });

    recoverPlatformIncidentBestEffort(
      {
        fingerprint: "guest_push_unavailable",
        service: "PUSH",
        summary: "Guest push notification delivery recovered.",
      },
      serviceClient,
    );

    return Response.json(result);
  } catch (error) {
    console.error("[Zingara API] Failed to send guest push", error);
    recordPlatformFailureEventBestEffort(
      {
        operation: "send_guest_push",
        route: "/api/guest-push",
        safeFingerprint: "guest_push_unavailable",
        service: "PUSH",
        statusCode: 500,
        summary: "Guest push notification failures are recurring.",
      },
      serviceClient,
    );

    return Response.json(
      { error: "Guest push notification could not be sent." },
      { status: 500 },
    );
  }
}
