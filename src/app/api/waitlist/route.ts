import { after } from "next/server";
import { sendWaitlistCustomerAcknowledgement } from "@/lib/email/secretGuestListAcknowledgementEmail";
import { sendWaitlistStaffNotification } from "@/lib/email/secretGuestListEmail";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  createPublicWaitlistEntry,
  type PublicWaitlistSource,
} from "@/lib/supabase/waitlistServer";
import type { DemoWaitlistEntry } from "@/lib/zingaraDemo";
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
      entry?: Partial<DemoWaitlistEntry>;
      firstName?: unknown;
      mobile?: unknown;
      partySize?: unknown;
      showId?: unknown;
      surname?: unknown;
    };
    const standardEntry =
      body.entry && typeof body.entry === "object" ? body.entry : null;
    const standardCustomer =
      standardEntry?.customer && typeof standardEntry.customer === "object"
        ? standardEntry.customer
        : null;
    const source: PublicWaitlistSource = standardEntry
      ? "waitlist"
      : "secret-guest-list";
    const entryInput = {
      customerName: standardEntry
        ? String(standardCustomer?.name ?? "").trim()
        : `${typeof body.firstName === "string" ? body.firstName.trim() : ""} ${typeof body.surname === "string" ? body.surname.trim() : ""}`.trim(),
      desiredZoneId:
        standardEntry && typeof standardEntry.desiredZoneId === "string"
          ? standardEntry.desiredZoneId
          : undefined,
      desiredZoneTitle:
        standardEntry && typeof standardEntry.desiredZoneTitle === "string"
          ? standardEntry.desiredZoneTitle.trim()
          : undefined,
      email: standardEntry
        ? String(standardCustomer?.email ?? "").trim().toLowerCase()
        : typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : "",
      mobile: standardEntry
        ? String(standardCustomer?.phone ?? "").trim()
        : typeof body.mobile === "string"
          ? body.mobile.trim()
          : "",
      notes:
        standardEntry && typeof standardEntry.notes === "string"
          ? standardEntry.notes.trim()
          : "",
      partySize: Number(standardEntry?.partySize ?? body.partySize),
      showId: standardEntry
        ? String(standardEntry.showId ?? "").trim()
        : typeof body.showId === "string"
          ? body.showId.trim()
          : "",
      source,
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
      entryInput.customerName.length < 2 ||
      entryInput.customerName.length > 160 ||
      (source === "secret-guest-list" && !entryInput.customerName.includes(" ")) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        entryInput.email,
      ) ||
      entryInput.email.length > 254 ||
      entryInput.mobile.length > 30 ||
      entryInput.mobile.replace(/\D/g, "").length < 7
    ) {
      return Response.json(
        { error: "Complete all required Waitlist details." },
        { status: 400 },
      );
    }

    const result = await createPublicWaitlistEntry(serviceClient, entryInput);

    if (result.created) {
      after(async () => {
        const notifications = await Promise.allSettled([
          sendWaitlistStaffNotification(serviceClient, {
            customerId: result.customerId,
            entry: result.entry,
            showId: result.showId,
            source,
          }),
          sendWaitlistCustomerAcknowledgement(serviceClient, {
            customerId: result.customerId,
            entry: result.entry,
            showId: result.showId,
            source,
          }),
        ]);

        notifications.forEach((notification, index) => {
          if (notification.status === "rejected") {
            console.error(
              index === 0
                ? "[Waitlist] Staff notification failed"
                : "[Waitlist] Customer acknowledgement failed",
              notification.reason,
            );
          }
        });
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
