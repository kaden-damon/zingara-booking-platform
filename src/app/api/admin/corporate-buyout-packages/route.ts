import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  loadCorporateBuyoutPackages,
  resolveCorporateBuyoutPackages,
} from "@/lib/supabase/corporateBuyoutsServer";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const venueKeys = ["cape-town", "johannesburg"] as const;
const packageCodes = ["private-salon", "speakeasy", "grand-society"];

function roleRow(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile?.roles[0]
    : auth.staffProfile?.roles;
}

function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return getRolePermissions(roleRow(auth)).includes("settings:manage");
}

async function payload(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const packages = await loadCorporateBuyoutPackages(auth.serviceClient!);
  return Object.fromEntries(
    venueKeys.map((venueKey) => [
      venueKey,
      resolveCorporateBuyoutPackages(packages, venueKey),
    ]),
  );
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient) return auth.error;
  if (!canManage(auth)) {
    return Response.json({ error: "Settings access is required." }, { status: 403 });
  }
  return Response.json({ packagesByVenue: await payload(auth) });
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManage(auth)) {
    return Response.json({ error: "Settings access is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    description?: string;
    displayName?: string;
    totalAmount?: number;
    venueKey?: string;
  };
  if (
    !venueKeys.includes(body.venueKey as (typeof venueKeys)[number]) ||
    !packageCodes.includes(String(body.code)) ||
    !body.displayName?.trim() ||
    !Number.isFinite(Number(body.totalAmount)) ||
    Number(body.totalAmount) <= 0
  ) {
    return Response.json({ error: "Complete the Buyout package name and price." }, { status: 400 });
  }

  const role = roleRow(auth);
  const { error } = await auth.serviceClient.rpc(
    "save_corporate_buyout_package_version_atomic",
    {
      p_actor_auth_user_id: auth.user.id,
      p_actor_name: auth.staffProfile.full_name ?? auth.user.email ?? "Staff",
      p_actor_role: getActorRoleLabel(role?.name),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_code: body.code,
      p_description: body.description?.trim() ?? "",
      p_display_name: body.displayName.trim(),
      p_request_id:
        request.headers.get("x-vercel-id") ??
        request.headers.get("x-request-id") ??
        crypto.randomUUID(),
      p_total_amount: Math.round(Number(body.totalAmount) * 100) / 100,
      p_user_agent: request.headers.get("user-agent"),
      p_venue_key: body.venueKey,
    },
  );
  if (error) {
    console.error("[Zingara API] Buyout package update failed", error);
    return Response.json({ error: "The Buyout package could not be saved." }, { status: 500 });
  }
  return Response.json({ packagesByVenue: await payload(auth) });
}
