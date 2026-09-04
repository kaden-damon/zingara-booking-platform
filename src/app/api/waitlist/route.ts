import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { persistWaitlistEntries } from "@/lib/supabase/waitlistServer";
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
  return Response.json(
    { error: "Waitlist records are available through authenticated Admin." },
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

  const maintenanceResponse = await requirePublicMaintenanceAvailable(
    serviceClient,
    "booking",
  );

  if (maintenanceResponse) return maintenanceResponse;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      entries?: DemoWaitlistEntry[];
      entry?: DemoWaitlistEntry;
    };
    const submittedEntry = body.entry;

    if (!submittedEntry || body.entries) {
      return Response.json(
        { error: "One waitlist entry is required." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const entry: DemoWaitlistEntry = {
      ...submittedEntry,
      bookingReference: undefined,
      communicationHistory: [],
      convertedAt: undefined,
      createdAt: now,
      id: `WLT-${crypto.randomUUID()}`,
      promotedAt: undefined,
      status: "waiting",
    };

    const ipLimit = await checkRateLimit(
      request,
      {
        limit: 20,
        scope: "waitlist_ip",
        windowSeconds: 300,
      },
      [entry.showId],
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
      [entry.customer.email, entry.customer.phone],
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

    if (
      !entry.showId ||
      !Number.isInteger(entry.partySize) ||
      entry.partySize < 1 ||
      entry.partySize >= 20 ||
      entry.customer.name.trim().length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        entry.customer.email.trim().toLowerCase(),
      ) ||
      entry.customer.phone.replace(/\D/g, "").length < 7
    ) {
      return Response.json(
        { error: "Complete all required waitlist details." },
        { status: 400 },
      );
    }

    const persistedEntries = await persistWaitlistEntries(serviceClient, [
      entry,
    ]);
    const createdEntry = persistedEntries.find(
      (candidate) => candidate.id === entry.id,
    );

    return Response.json({ entry: createdEntry ?? entry }, { status: 201 });
  } catch (error) {
    console.error("[Zingara API] Failed to save waitlist entry", error);

    return Response.json(
      { error: "Waitlist entry could not be saved." },
      { status: 500 },
    );
  }
}
