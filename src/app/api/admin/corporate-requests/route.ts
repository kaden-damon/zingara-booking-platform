import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  loadCorporateRequests,
  persistCorporateRequests,
} from "@/lib/supabase/corporateRequestsServer";
import { type CorporateRequest } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const requests = await loadCorporateRequests(auth.serviceClient);

    return Response.json({ requests });
  } catch (error) {
    console.error("[Zingara API] Failed to load admin corporate requests", error);

    return Response.json(
      { error: "Corporate requests could not be loaded." },
      { status: 500 },
    );
  }
}

async function saveRequests(request: Request) {
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
      replace?: boolean;
      request?: CorporateRequest;
      requests?: CorporateRequest[];
    };
    const requests = body.requests ?? (body.request ? [body.request] : []);

    if (requests.length === 0) {
      return Response.json(
        { error: "Corporate requests are required." },
        { status: 400 },
      );
    }

    const persistedRequests = await persistCorporateRequests(
      auth.serviceClient,
      requests,
      { replace: body.replace },
    );

    return Response.json({ requests: persistedRequests });
  } catch (error) {
    console.error("[Zingara API] Failed to save admin corporate requests", error);

    return Response.json(
      { error: "Corporate requests could not be saved." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return saveRequests(request);
}

export async function PATCH(request: Request) {
  return saveRequests(request);
}
