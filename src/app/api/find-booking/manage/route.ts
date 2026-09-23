import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import {
  loadBookingManagementContext,
  toPublicCancellationPreview,
  verifyBookingManagementMobile,
} from "@/lib/bookingManagementServer";
import { getPerformanceStart } from "@/lib/bookingManagementPolicy";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { loadPublicShowAvailabilityBatch } from "@/lib/supabase/publicShowAvailability";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type ManageRequest = {
  action?:
    | "cancel"
    | "cancellation-preview"
    | "move-confirm"
    | "move-options"
    | "move-preview";
  bookingReference?: string;
  destinationShowId?: string;
  expectedUpdatedAt?: string;
  mobileNumber?: string;
  reason?: string;
  stateFingerprint?: string;
};

const genericVerificationError =
  "We couldn't verify this booking for self-service management.";

function requestId(request: Request) {
  return (
    request.headers.get("x-vercel-id") ??
    request.headers.get("x-request-id") ??
    crypto.randomUUID()
  );
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("BOOKING_CHANGED")) {
    return { code: "BOOKING_CHANGED", error: "This booking changed after the preview. Refresh and review it again.", status: 409 };
  }
  if (message.includes("PUBLIC_ZONE_SALES_CLOSED")) {
    return { code: "PUBLIC_ZONE_SALES_CLOSED", error: "This seating zone is no longer available for public booking on that date.", status: 409 };
  }
  if (message.includes("SEATING_ZONE_DISABLED")) {
    return { code: "SEATING_ZONE_DISABLED", error: "This seating zone is not available for new activity.", status: 409 };
  }
  if (message.includes("PUBLIC_ZONE_CAPACITY_EXCEEDED") || message.includes("ZONE_CAPACITY_EXCEEDED")) {
    return { code: "PUBLIC_ZONE_CAPACITY_EXCEEDED", error: "That performance no longer has enough public capacity for all guests on this booking.", status: 409 };
  }
  if (message.includes("DESTINATION_SHOW_NOT_ACTIVE") || message.includes("DESTINATION_SHOW_NOT_FUTURE")) {
    return { code: "DESTINATION_UNAVAILABLE", error: "That performance is no longer available.", status: 409 };
  }
  if (message.includes("GUEST_MANAGEMENT_NOT_ALLOWED") || message.includes("STANDARD_PUBLIC_BOOKING_REQUIRED") || message.includes("BOOKING_NOT_MANAGEABLE")) {
    return { code: "MANAGEMENT_NOT_ALLOWED", error: "This booking cannot be managed through guest self-service. Please contact Box Office.", status: 403 };
  }
  return { code: "MANAGEMENT_FAILED", error: "This booking action could not be completed. No changes were made.", status: 500 };
}

async function getMoveOptions(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  context: NonNullable<Awaited<ReturnType<typeof loadBookingManagementContext>>>,
) {
  if (!context.zoneId) return [];
  const { data, error } = await serviceClient
    .from("shows")
    .select("id,name,date,time,venue,status")
    .eq("venue", context.show.venue)
    .eq("status", "active")
    .neq("id", context.show.id)
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(250);
  if (error) throw error;
  const futureShows = (data ?? []).filter(
    (show) => getPerformanceStart(show.date, show.time).getTime() > Date.now(),
  );
  const availability = await loadPublicShowAvailabilityBatch(
    serviceClient,
    futureShows.map((show) => show.id),
  );

  return futureShows.flatMap((show) => {
    const showAvailability = availability.get(show.id);
    const remaining = showAvailability?.remainingSeatsByZone[context.zoneId!] ?? 0;
    const publicSalesOpen = showAvailability?.publicSalesOpenByZone[context.zoneId!] === true;
    if (!publicSalesOpen || remaining < context.booking.guest_count) return [];
    return [{
      currentValue: Number(context.booking.total_amount),
      date: show.date,
      difference: 0,
      id: show.id,
      name: show.name,
      newValue: Number(context.booking.total_amount),
      partySize: context.booking.guest_count,
      seatingZone: context.metadata?.zoneTitle ?? context.booking.section ?? "Seating",
      time: show.time.slice(0, 5),
      venue: show.venue,
    }];
  });
}

export async function POST(request: Request) {
  const serviceClient = getServiceClient();
  if (!serviceClient) {
    return Response.json({ error: "Booking management is temporarily unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ManageRequest;
    const bookingReference = body.bookingReference?.trim().toUpperCase() ?? "";
    const mobileNumber = body.mobileNumber?.trim() ?? "";
    if (!bookingReference || !mobileNumber || !body.action) {
      return Response.json({ error: genericVerificationError }, { status: 404 });
    }

    const limit = await checkRateLimit(
      request,
      { limit: 10, scope: "find_booking_manage", windowSeconds: 300 },
      [bookingReference],
      serviceClient,
    );
    if (!limit.allowed) {
      return rateLimitResponse(limit.retryAfterSeconds, {
        bookingReference,
        operation: "find_booking_manage",
        route: "/api/find-booking/manage",
        safeFingerprint: "find_booking_manage_rate_limited",
      }, serviceClient);
    }

    const context = await loadBookingManagementContext(serviceClient, bookingReference);
    if (
      !context ||
      !context.guestSelfServiceEligible ||
      !(await verifyBookingManagementMobile(serviceClient, context, mobileNumber))
    ) {
      return Response.json({ error: genericVerificationError }, { status: 404 });
    }

    if (body.action === "cancellation-preview") {
      return Response.json({ preview: toPublicCancellationPreview(context) });
    }

    if (body.action === "move-options") {
      return Response.json({
        current: {
          date: context.show.date,
          id: context.show.id,
          name: context.show.name,
          time: context.show.time.slice(0, 5),
          venue: context.show.venue,
        },
        options: await getMoveOptions(serviceClient, context),
        stateFingerprint: context.stateFingerprint,
        updatedAt: context.booking.updated_at,
      });
    }

    if (body.stateFingerprint !== context.stateFingerprint || body.expectedUpdatedAt !== context.booking.updated_at) {
      return Response.json(
        { code: "BOOKING_CHANGED", error: "This booking changed after the preview. Refresh and review it again." },
        { status: 409 },
      );
    }

    if (body.action === "cancel") {
      const reason = body.reason?.trim();
      if (!reason || reason.length < 3 || reason.length > 255) {
        return Response.json({ error: "Please provide a cancellation reason." }, { status: 400 });
      }
      const { data, error } = await serviceClient.rpc("cancel_managed_booking_atomic", {
        p_action_origin: "guest-self-service",
        p_booking_reference: bookingReference,
        p_expected_updated_at: body.expectedUpdatedAt,
        p_policy: {
          cutoffAt: context.policy.cutoffAt,
          cutoffDays: context.policy.cutoffDays,
          forfeitedAmount: context.policy.forfeitedAmount,
          fullRefundWindow: context.policy.fullRefundWindow,
          paidAmount: context.policy.paidAmount,
          refundableAmount: context.policy.refundableAmount,
          refundState: context.policy.refundState,
        },
        p_reason: reason,
        p_request_id: requestId(request),
        p_user_agent: request.headers.get("user-agent"),
      });
      if (error) throw error;
      await notifyAppleWalletBooking(serviceClient, context.booking.id);
      return Response.json({
        message: context.policy.refundableAmount > 0
          ? "Booking cancelled. The refundable amount now requires the stated refund workflow."
          : "Booking cancelled. The cancellation policy does not produce a refundable amount.",
        preview: toPublicCancellationPreview(context),
        result: data,
      });
    }

    if (body.action === "move-preview" || body.action === "move-confirm") {
      const option = (await getMoveOptions(serviceClient, context)).find(
        (candidate) => candidate.id === body.destinationShowId,
      );
      if (!option) {
        return Response.json({ code: "DESTINATION_UNAVAILABLE", error: "That performance is no longer publicly available for this booking." }, { status: 409 });
      }
      if (body.action === "move-preview") {
        return Response.json({
          preview: {
            current: { date: context.show.date, id: context.show.id, name: context.show.name, time: context.show.time.slice(0, 5), venue: context.show.venue },
            destination: option,
            stateFingerprint: context.stateFingerprint,
            updatedAt: context.booking.updated_at,
          },
        });
      }
      const { data, error } = await serviceClient.rpc("move_public_standard_booking_atomic", {
        p_action_origin: "guest-self-service",
        p_booking_reference: bookingReference,
        p_destination_show_id: option.id,
        p_expected_show_id: context.show.id,
        p_expected_updated_at: body.expectedUpdatedAt,
        p_request_id: requestId(request),
        p_user_agent: request.headers.get("user-agent"),
      });
      if (error) throw error;
      await notifyAppleWalletBooking(serviceClient, context.booking.id);
      return Response.json({ message: "Booking moved successfully.", result: data });
    }

    return Response.json({ error: "Unsupported booking action." }, { status: 400 });
  } catch (error) {
    console.error("[Zingara API] Find My Booking management failed", error);
    const response = publicError(error);
    return Response.json({ code: response.code, error: response.error }, { status: response.status });
  }
}
