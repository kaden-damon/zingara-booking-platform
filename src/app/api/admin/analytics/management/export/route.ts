import { buildManagementAnalyticsWorkbook } from "@/lib/exports/managementAnalyticsWorkbook";
import { filtersFromSearchParams } from "@/lib/managementAnalytics";
import { loadManagementAnalyticsDataset } from "@/lib/supabase/managementAnalyticsServer";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) return Response.json({ error: "Analytics access is required." }, { status: 403 });

  try {
    const dataset = await loadManagementAnalyticsDataset(auth.serviceClient, auth.staffProfile.venue_scope);
    const workbook = await buildManagementAnalyticsWorkbook(dataset, filtersFromSearchParams(new URL(request.url).searchParams));
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="Zingara_Management_Analytics_${dataset.asOf.slice(0, 10)}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("[Zingara Analytics] Workbook export failed", error);
    return Response.json({ error: "Management analytics export could not be generated." }, { status: 500 });
  }
}
