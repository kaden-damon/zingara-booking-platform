import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  sendCorporateEnquiryEmails,
} from "@/lib/email/corporateEnquiryEmail";
import { resolveCorporateEnquiryLocation } from "@/lib/corporateEnquiryRouting";
import {
  loadCorporateRequestRecord,
  loadCorporateRequests,
  persistCorporateRequests,
} from "@/lib/supabase/corporateRequestsServer";
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
  const serviceClient = getRouteClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const requests = await loadCorporateRequests(serviceClient);

    return Response.json({ requests });
  } catch (error) {
    console.error("[Zingara API] Failed to load corporate requests", error);

    return Response.json(
      { error: "Corporate requests could not be loaded." },
      { status: 500 },
    );
  }
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
    const body = (await request.json()) as {
      request?: CorporateRequest;
      requests?: CorporateRequest[];
    };
    const requests = body.requests ?? (body.request ? [body.request] : []);

    if (requests.length === 0) {
      return Response.json(
        { error: "A corporate request is required." },
        { status: 400 },
      );
    }

    if (
      requests.some(
        (corporateRequest) =>
          !resolveCorporateEnquiryLocation(
            corporateRequest.locationAcknowledgement,
          ),
      )
    ) {
      return Response.json(
        { error: "A valid Corporate enquiry venue is required." },
        { status: 400 },
      );
    }

    const existingRequests = await Promise.all(
      requests.map((corporateRequest) =>
        loadCorporateRequestRecord(serviceClient, corporateRequest.id),
      ),
    );
    const persistedRequests = await persistCorporateRequests(
      serviceClient,
      requests,
    );
    const createdRequests = requests.filter(
      (_corporateRequest, index) => !existingRequests[index],
    );

    if (createdRequests.length > 0) {
      try {
        const settings = await loadVenueSettings(serviceClient);
        const notificationResults = await Promise.allSettled(
          createdRequests.map(async (corporateRequest) => {
            await Promise.all([
              sendCorporateEnquiryEmails(
                serviceClient,
                corporateRequest,
                settings,
              ),
              sendStaffPushNotification({
                corporateRequestId: corporateRequest.id,
                trigger: "new-corporate-request",
              }),
            ]);
          }),
        );

        notificationResults.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              "[Zingara API] Corporate enquiry notification failed",
              {
                corporateRequestId: createdRequests[index]?.id,
                error:
                  result.reason instanceof Error
                    ? result.reason.message
                    : "Unknown notification failure.",
              },
            );
          }
        });
      } catch (error) {
        console.error(
          "[Zingara API] Corporate enquiry notifications could not start",
          error,
        );
      }
    }

    return Response.json({ requests: persistedRequests });
  } catch (error) {
    console.error("[Zingara API] Failed to save corporate request", error);

    return Response.json(
      { error: "Corporate request could not be saved." },
      { status: 500 },
    );
  }
}
