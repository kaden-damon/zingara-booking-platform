import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { buildManagementForecastWorkbook } from "@/lib/exports/managementForecastWorkbook";
import {
  filtersFromSearchParams,
  type ManagementForecastScope,
} from "@/lib/managementAnalytics";
import { loadManagementAnalyticsDataset } from "@/lib/supabase/managementAnalyticsServer";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

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

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) {
    return Response.json(
      { error: "Analytics access is required." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("view") === "management-forecast") {
    try {
      const filters = filtersFromSearchParams(url.searchParams);
      const scope: ManagementForecastScope =
        url.searchParams.get("scope") === "all" ? "all" : "future";
      const dataset = await loadManagementAnalyticsDataset(
        auth.serviceClient,
        auth.staffProfile.venue_scope,
      );
      const report = await buildManagementForecastWorkbook(
        dataset,
        filters,
        scope,
      );

      await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "analytics.management_forecast_exported",
        afterValues: {
          performance_count: report.rows.length,
          scope,
          venue: filters.venue,
        },
        entityReference: "management-forecast",
        entityType: "data-portability-export",
        outcome: "success",
        reason: "Authorised self-service management forecast download.",
        request,
        sourceArea: "Management Analytics",
      });

      return new Response(new Uint8Array(report.buffer), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${report.filename}"`,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
    } catch (error) {
      console.error("[Zingara Analytics] Management forecast export failed", error);
      return Response.json(
        { error: "The Management Forecast workbook could not be generated." },
        { status: 500 },
      );
    }
  }

  await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
    action: "analytics.management_export.blocked",
    entityReference: "management-analytics",
    entityType: "data-portability-export",
    outcome: "blocked",
    reason: "Broad management data export is disabled.",
    request,
    sourceArea: "Management Analytics",
  });

  return Response.json(
    { error: "Management data export is disabled." },
    { status: 403 },
  );
}
