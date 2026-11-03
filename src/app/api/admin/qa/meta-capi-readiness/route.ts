import { verifyMetaCapiConfiguration } from "@/lib/advertisingConversionOutbox";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function roleOf(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

async function runReadiness(
  request: Request,
  mode: "identity" | "test_event",
) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("settings:manage")) {
    return Response.json(
      { error: "Management settings access is required." },
      { status: 403 },
    );
  }

  const readiness = await verifyMetaCapiConfiguration({ mode });
  const successful = mode === "identity"
    ? readiness.tokenAccepted === true
    : readiness.accepted;
  return Response.json(readiness, {
    headers: { "Cache-Control": "private, no-store" },
    status: successful ? 200 : 503,
  });
}

export async function GET(request: Request) {
  return runReadiness(request, "identity");
}

export async function POST(request: Request) {
  return runReadiness(request, "test_event");
}
