import { after } from "next/server";
import { sendSecretGuestListNotification } from "@/lib/email/secretGuestListEmail";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { createSecretGuestListEntry } from "@/lib/supabase/waitlistServer";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
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
      email?: unknown;
      firstName?: unknown;
      mobile?: unknown;
      partySize?: unknown;
      showId?: unknown;
      surname?: unknown;
    };
    const entryInput = {
      email: typeof body.email === "string" ? body.email.trim().toLowerCase() : "",
      firstName: typeof body.firstName === "string" ? body.firstName.trim() : "",
      mobile: typeof body.mobile === "string" ? body.mobile.trim() : "",
      partySize: Number(body.partySize),
      showId: typeof body.showId === "string" ? body.showId.trim() : "",
      surname: typeof body.surname === "string" ? body.surname.trim() : "",
    };

    const ipLimit = await checkRateLimit(
      request,
      {
        limit: 20,
        scope: "waitlist_ip",
        windowSeconds: 300,
      },
      [entryInput.showId],
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
      [entryInput.email, entryInput.mobile],
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
      !entryInput.showId ||
      !Number.isInteger(entryInput.partySize) ||
      entryInput.partySize < 1 ||
      entryInput.partySize >= 20 ||
      entryInput.firstName.length < 1 ||
      entryInput.surname.length < 1 ||
      entryInput.firstName.length > 80 ||
      entryInput.surname.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        entryInput.email,
      ) ||
      entryInput.email.length > 254 ||
      entryInput.mobile.length > 30 ||
      entryInput.mobile.replace(/\D/g, "").length < 7
    ) {
      return Response.json(
        { error: "Complete all required Secret Guest List details." },
        { status: 400 },
      );
    }

    const result = await createSecretGuestListEntry(serviceClient, entryInput);

    if (result.created) {
      after(async () => {
        try {
          await sendSecretGuestListNotification(serviceClient, {
            customerId: result.customerId,
            entry: result.entry,
            showId: result.showId,
          });
        } catch (error) {
          console.error("[Secret Guest List] Staff notification failed", error);
        }
      });
    }

    return Response.json(
      { duplicate: !result.created, entry: result.entry },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    console.error("[Zingara API] Failed to save waitlist entry", error);

    return Response.json(
      { error: "Waitlist entry could not be saved." },
      { status: 500 },
    );
  }
}
