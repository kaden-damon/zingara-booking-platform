import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  sendCorporateEnquiryEmails,
} from "@/lib/email/corporateEnquiryEmail";
import { resolveCorporateEnquiryLocation } from "@/lib/corporateEnquiryRouting";
import { corporatePartySizeThreshold } from "@/lib/bookingClassification";
import { persistCorporateRequests } from "@/lib/supabase/corporateRequestsServer";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { sendStaffPushNotification } from "@/lib/supabase/staffPush";
import {
  defaultVenueSettings,
  normalizeVenueSettings,
  type CorporateRequest,
  type DemoVenueSettings,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

function getRouteClient() {
  return getServiceClient();
}

async function loadVenueSettings(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
) {
  const { data, error } = await serviceClient
    .from("venue_settings")
    .select("settings")
    .eq("venue_key", defaultVenueSettings.venueId)
    .maybeSingle();

  if (error) throw error;

  return normalizeVenueSettings(
    (data as { settings?: DemoVenueSettings | null } | null)?.settings,
  );
}

export async function GET() {
  return Response.json(
    { error: "Corporate requests are available through authenticated Admin." },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const serviceClient = getRouteClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      request?: CorporateRequest;
      requests?: CorporateRequest[];
    };
    const submittedRequest = body.request;

    if (!submittedRequest || body.requests) {
      return Response.json(
        { error: "One Corporate enquiry is required." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const corporateRequest: CorporateRequest = {
      ...submittedRequest,
      archivedAt: undefined,
      assignedConsultant: undefined,
      cancelledAt: undefined,
      cancellationReason: undefined,
      communicationHistory: [],
      createdAt: now,
      id: `CORP-${crypto.randomUUID()}`,
      linkedBookingReference: undefined,
      paymentLinkSentAt: undefined,
      paymentLinkToken: undefined,
      source: "Corporate Direct",
      status: "corporate-tentative",
      updatedAt: now,
    };

    const ipLimit = await checkRateLimit(
      request,
      { limit: 8, scope: "corporate_enquiry_ip", windowSeconds: 600 },
      [],
      serviceClient,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit.retryAfterSeconds);
    }

    const contactLimit = await checkRateLimit(
      request,
      { limit: 3, scope: "corporate_enquiry_contact", windowSeconds: 3600 },
      [corporateRequest.email, corporateRequest.contactNumber],
      serviceClient,
    );

    if (!contactLimit.allowed) {
      return rateLimitResponse(contactLimit.retryAfterSeconds);
    }

    if (
      !resolveCorporateEnquiryLocation(
        corporateRequest.locationAcknowledgement,
      )
    ) {
      return Response.json(
        { error: "A valid Corporate enquiry venue is required." },
        { status: 400 },
      );
    }

    if (
      typeof corporateRequest.guestCount !== "number" ||
      !Number.isInteger(corporateRequest.guestCount) ||
      corporateRequest.guestCount < corporatePartySizeThreshold ||
      corporateRequest.guestCount > 2000
    ) {
      return Response.json(
        {
          error: `Corporate enquiries require at least ${corporatePartySizeThreshold} guests. Use Standard Booking for smaller parties.`,
        },
        { status: 400 },
      );
    }

    if (
      corporateRequest.contactName.trim().length < 2 ||
      corporateRequest.companyName.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        corporateRequest.email.trim().toLowerCase(),
      ) ||
      corporateRequest.contactNumber.replace(/\D/g, "").length < 7
    ) {
      return Response.json(
        { error: "Complete all required Corporate enquiry contact details." },
        { status: 400 },
      );
    }

    const persistedRequests = await persistCorporateRequests(
      serviceClient,
      [corporateRequest],
    );
    const createdRequest = persistedRequests.find(
      (candidate) => candidate.id === corporateRequest.id,
    );

    if (createdRequest) {
      try {
        const settings = await loadVenueSettings(serviceClient);
        await Promise.all([
          sendCorporateEnquiryEmails(serviceClient, createdRequest, settings),
          sendStaffPushNotification({
            corporateRequestId: createdRequest.id,
            trigger: "new-corporate-request",
          }),
        ]);
      } catch (error) {
        console.error(
          "[Zingara API] Corporate enquiry notifications could not start",
          error,
        );
      }
    }

    return Response.json(
      { request: createdRequest ?? corporateRequest },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Zingara API] Failed to save corporate request", error);

    return Response.json(
      { error: "Corporate request could not be saved." },
      { status: 500 },
    );
  }
}
