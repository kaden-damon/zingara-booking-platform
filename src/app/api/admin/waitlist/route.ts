import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  loadWaitlistEntries,
  persistWaitlistEntries,
} from "@/lib/supabase/waitlistServer";
import { type DemoWaitlistEntry } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const entries = await loadWaitlistEntries(auth.serviceClient);

    return Response.json({ entries });
  } catch (error) {
    console.error("[Zingara API] Failed to load admin waitlist", error);

    return Response.json(
      { error: "Waitlist entries could not be loaded." },
      { status: 500 },
    );
  }
}

async function saveEntries(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;

  if (!getRolePermissions(role).includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
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
        { error: "Waitlist entries are required." },
        { status: 400 },
      );
    }

    const persistedEntries = await persistWaitlistEntries(
      auth.serviceClient,
      entries,
    );

    return Response.json({ entries: persistedEntries });
  } catch (error) {
    console.error("[Zingara API] Failed to save admin waitlist", error);

    return Response.json(
      { error: "Waitlist entries could not be saved." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return saveEntries(request);
}

export async function PATCH(request: Request) {
  return saveEntries(request);
}
