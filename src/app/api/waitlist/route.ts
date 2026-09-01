import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  loadWaitlistEntries,
  persistWaitlistEntries,
} from "@/lib/supabase/waitlistServer";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
import { type DemoWaitlistEntry } from "@/lib/zingaraDemo";
import { requirePublicMaintenanceAvailable } from "@/lib/platformMaintenance";

export const dynamic = "force-dynamic";

function getRouteClient() {
  return getServiceClient();
}

export async function GET() {
  const serviceClient = getRouteClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Waitlist is temporarily unavailable." },
      { status: 503 },
    );
  }

  const maintenanceResponse = await requirePublicMaintenanceAvailable(
    serviceClient,
    "booking",
  );

  if (maintenanceResponse) return maintenanceResponse;

  try {
    const entries = await loadWaitlistEntries(serviceClient);

    return Response.json({ entries });
  } catch (error) {
    console.error("[Zingara API] Failed to load waitlist entries", error);

    return Response.json(
      { error: "Waitlist entries could not be loaded." },
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
      entries?: DemoWaitlistEntry[];
      entry?: DemoWaitlistEntry;
    };
    const entries = body.entries ?? (body.entry ? [body.entry] : []);

    if (entries.length === 0) {
      return Response.json(
        { error: "A waitlist entry is required." },
        { status: 400 },
      );
    }

    const primaryEntry = entries[0];
    const ipLimit = await checkRateLimit(
      request,
      {
        limit: 20,
        scope: "waitlist_ip",
        windowSeconds: 300,
      },
      [primaryEntry?.showId],
      serviceClient,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(
        ipLimit.retryAfterSeconds,
        {
          operation: "save_waitlist_entry",
          route: "/api/waitlist",
          safeFingerprint: "waitlist_rate_limited_ip",
        },
        serviceClient,
      );
    }

    const contactLimit = await checkRateLimit(
      request,
      {
        limit: 6,
        scope: "waitlist_contact",
        windowSeconds: 600,
      },
      [primaryEntry?.customer.email, primaryEntry?.customer.phone],
      serviceClient,
    );

    if (!contactLimit.allowed) {
      return rateLimitResponse(
        contactLimit.retryAfterSeconds,
        {
          operation: "save_waitlist_entry",
          route: "/api/waitlist",
          safeFingerprint: "waitlist_rate_limited_contact",
        },
        serviceClient,
      );
    }

    const persistedEntries = await persistWaitlistEntries(serviceClient, entries);

    return Response.json({ entries: persistedEntries });
  } catch (error) {
    console.error("[Zingara API] Failed to save waitlist entry", error);

    return Response.json(
      { error: "Waitlist entry could not be saved." },
      { status: 500 },
    );
  }
}
