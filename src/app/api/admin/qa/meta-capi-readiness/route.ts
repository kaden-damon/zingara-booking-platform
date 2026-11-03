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

export async function GET(request: Request) {
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

  const readiness = await verifyMetaCapiConfiguration();
  return Response.json(readiness, {
    headers: { "Cache-Control": "private, no-store" },
    status: readiness.accepted ? 200 : 503,
  });
}
