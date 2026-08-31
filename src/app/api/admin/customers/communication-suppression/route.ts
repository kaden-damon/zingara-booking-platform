import {
  canManageCustomerCommunicationState,
  canViewCustomerCommunicationState,
  getOperationalPauseExpiry,
  getOperationalPauseReason,
  operationalPauseDurations,
  operationalPauseReasons,
  type OperationalCommunicationChannel,
  type OperationalPauseDuration,
} from "@/lib/customerCommunicationPreferences";
import { getCustomerCommunicationSuppressions } from "@/lib/supabase/customerCommunicationSuppression";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const supportedChannels = new Set<OperationalCommunicationChannel>([
  "email",
  "push",
]);
const supportedDurations = new Set(
  operationalPauseDurations.map((duration) => duration.value),
);
const supportedReasons = new Set<string>(operationalPauseReasons);

function hasCustomerCommunicationAccess(
  profile: Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"],
  mutation: boolean,
) {
  const role = Array.isArray(profile?.roles) ? profile.roles[0] : profile?.roles;
  const permissions = getRolePermissions(role);

  return mutation
    ? canManageCustomerCommunicationState(permissions)
    : canViewCustomerCommunicationState(permissions);
}

async function authorize(request: Request, mutation = false) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile || !auth.user || !auth.serviceClient) {
    return {
      auth: null,
      error: auth.error ??
        Response.json(
          { error: "Active staff authentication is required." },
          { status: 401 },
        ),
    };
  }

  if (!hasCustomerCommunicationAccess(auth.staffProfile, mutation)) {
    return {
      auth: null,
      error: Response.json(
        { error: "Customer communication management access is required." },
        { status: 403 },
      ),
    };
  }

  return { auth, error: null };
}

export async function GET(request: Request) {
  const authorization = await authorize(request);

  if (!authorization.auth) {
    return authorization.error;
  }

  const customerId = new URL(request.url).searchParams.get("customerId")?.trim();

  if (!customerId) {
    return Response.json(
      { error: "Customer id is required." },
      { status: 400 },
    );
  }

  try {
    const rows = await getCustomerCommunicationSuppressions(
      authorization.auth.serviceClient,
      customerId,
    );

    return Response.json({ rows });
  } catch (error) {
    console.error("[Zingara API] Failed to load customer communication state", error);
    return Response.json(
      { error: "Customer communication state could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorization = await authorize(request, true);

  if (!authorization.auth) {
    return authorization.error;
  }

  try {
    const body = (await request.json()) as {
      action?: "pause" | "resume";
      channel?: OperationalCommunicationChannel;
      customerId?: string;
      duration?: OperationalPauseDuration;
      otherReason?: string;
      reason?: string;
    };
    const customerId = body.customerId?.trim();
    const action = body.action;
    const channel = body.channel;

    if (!customerId || !action || !channel || !supportedChannels.has(channel)) {
      return Response.json(
        { error: "Customer, channel and action are required." },
        { status: 400 },
      );
    }

    if (action !== "pause" && action !== "resume") {
      return Response.json(
        { error: "Unsupported communication action." },
        { status: 400 },
      );
    }

    let reason = "Resumed by authorised staff";
    let pausedUntil = new Date().toISOString();

    if (action === "pause") {
      if (
        !body.duration ||
        !supportedDurations.has(body.duration) ||
        !body.reason ||
        !supportedReasons.has(body.reason)
      ) {
        return Response.json(
          { error: "Choose a pause reason and duration." },
          { status: 400 },
        );
      }

      reason = getOperationalPauseReason(body.reason, body.otherReason ?? "");

      if (reason.length < 3 || reason.length > 240) {
        return Response.json(
          { error: "Enter a concise operational pause reason." },
          { status: 400 },
        );
      }

      pausedUntil = getOperationalPauseExpiry(body.duration);
    }

    const { error } = await authorization.auth.serviceClient.rpc(
      "set_customer_communication_suppression",
      {
        p_action: action,
        p_actor_auth_user_id: authorization.auth.user.id,
        p_actor_staff_profile_id: authorization.auth.staffProfile.id,
        p_channel: channel,
        p_customer_id: customerId,
        p_paused_until: pausedUntil,
        p_reason: reason,
        p_request_id:
          request.headers.get("x-vercel-id") ??
          request.headers.get("x-request-id") ??
          crypto.randomUUID(),
        p_user_agent: request.headers.get("user-agent"),
      },
    );

    if (error) {
      throw error;
    }

    const rows = await getCustomerCommunicationSuppressions(
      authorization.auth.serviceClient,
      customerId,
    );

    return Response.json({ rows });
  } catch (error) {
    console.error("[Zingara API] Failed to update customer communication state", error);
    return Response.json(
      { error: "Customer communication state could not be updated." },
      { status: 500 },
    );
  }
}
