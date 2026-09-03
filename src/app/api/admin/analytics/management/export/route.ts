import { buildManagementAnalyticsWorkbook } from "@/lib/exports/managementAnalyticsWorkbook";
import { filtersFromSearchParams } from "@/lib/managementAnalytics";
import { loadManagementAnalyticsDataset } from "@/lib/supabase/managementAnalyticsServer";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import {
  acquireReportGenerationLock,
  releaseReportGenerationLock,
} from "@/lib/supabase/reportGenerationLockServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) return Response.json({ error: "Analytics access is required." }, { status: 403 });

  const filters = filtersFromSearchParams(new URL(request.url).searchParams);
  const reportType = "Management Analytics Workbook";
  const reportScope = { filters };
  let lockToken = "";
  let outcome: "failed" | "success" = "failed";

  try {
    const lock = await acquireReportGenerationLock({
      reportScope,
      reportType,
      request,
      serviceClient: auth.serviceClient,
      staffProfile: auth.staffProfile,
      user: auth.user,
    });
    if (!lock.acquired || !lock.token) {
      return Response.json(
        { error: lock.ownerName ? `${lock.ownerName} is currently generating a report.` : "A report is currently being generated." },
        { status: 423 },
      );
    }
    lockToken = lock.token;

    const dataset = await loadManagementAnalyticsDataset(auth.serviceClient, auth.staffProfile.venue_scope);
    const workbook = await buildManagementAnalyticsWorkbook(dataset, filters);
    const buffer = await workbook.xlsx.writeBuffer();
    outcome = "success";
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
  } finally {
    if (lockToken) {
      await releaseReportGenerationLock({
        lockToken,
        outcome,
        reportScope,
        reportType,
        request,
        serviceClient: auth.serviceClient,
        staffProfile: auth.staffProfile,
        user: auth.user,
      }).catch((releaseError) => {
        console.error("[Zingara Analytics] Workbook lock release failed", releaseError);
      });
    }
  }
}
