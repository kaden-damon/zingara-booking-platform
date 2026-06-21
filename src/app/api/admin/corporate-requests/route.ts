import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  loadCorporateRequests,
  persistCorporateRequests,
} from "@/lib/supabase/corporateRequestsServer";
import { type CorporateRequest } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

function getRouteClient() {
  return getServiceClient();
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
    console.error("[Zingara API] Failed to load admin corporate requests", error);

    return Response.json(
      { error: "Corporate requests could not be loaded." },
      { status: 500 },
    );
  }
}

async function saveRequests(request: Request) {
  const serviceClient = getRouteClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
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
      serviceClient,
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
