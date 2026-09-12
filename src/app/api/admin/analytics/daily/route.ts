import {
  dailyAnalyticsFilename,
  dailyAnalyticsReportType,
  getDailyAnalyticsWindow,
} from "@/lib/dailyAnalytics";
import { buildDailyAnalyticsWorkbook } from "@/lib/exports/dailyAnalyticsWorkbook";
import {
  acquireReportGenerationLock,
  releaseReportGenerationLock,
} from "@/lib/supabase/reportGenerationLockServer";
import { loadDailyAnalyticsReport } from "@/lib/supabase/dailyAnalyticsServer";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) {
    return Response.json(
      { error: "Analytics access is required." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const reportDate = url.searchParams.get("date")?.trim() ?? "";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "json";
  try {
    getDailyAnalyticsWindow(reportDate);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Select a valid completed reporting date.",
      },
      { status: 400 },
    );
  }

  const reportScope = {
    format,
    reportDate,
    timezone: "Africa/Johannesburg",
  };
  let lockToken = "";
  let outcome: "failed" | "success" = "failed";

  try {
    const lock = await acquireReportGenerationLock({
      reportScope,
      reportType: dailyAnalyticsReportType,
      request,
      serviceClient: auth.serviceClient,
      staffProfile: auth.staffProfile,
      user: auth.user,
    });
    if (!lock.acquired || !lock.token) {
      return Response.json(
        {
          error: lock.ownerName
            ? `${lock.ownerName} is currently generating a report.`
            : "A report is currently being generated.",
          lock,
        },
        { status: 423 },
      );
    }
    lockToken = lock.token;

    const report = await loadDailyAnalyticsReport(
      auth.serviceClient,
      reportDate,
      auth.staffProfile.venue_scope,
    );
    if (format === "json") {
      outcome = "success";
      return Response.json(
        {
          report: {
            dayNumber: report.dayNumber,
            filename: dailyAnalyticsFilename(report),
            payments: report.payments,
            reportDate: report.reportDate,
            strongestPerformance:
              [...report.showRows].sort(
                (left, right) =>
                  right.grossValue - left.grossValue ||
                  right.bookings - left.bookings,
              )[0] ?? null,
            strongestSeating:
              [...report.seatingRows].sort(
                (left, right) =>
                  right.grossValue - left.grossValue ||
                  right.bookings - left.bookings,
              )[0] ?? null,
            summary: report.summary,
          },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const workbook = await buildDailyAnalyticsWorkbook(report);
    outcome = "success";
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${dailyAnalyticsFilename(report)}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("[Zingara Analytics] Daily report generation failed", error);
    return Response.json(
      {
        error:
          error instanceof Error &&
          error.message.startsWith("Historical show evidence is missing")
            ? "This report could not be generated because the historical show state for the selected date could not be resolved."
            : "The Daily Analytics report could not be generated. Please try again.",
      },
      { status: 500 },
    );
  } finally {
    if (lockToken) {
      await releaseReportGenerationLock({
        lockToken,
        outcome,
        reportScope,
        reportType: dailyAnalyticsReportType,
        request,
        serviceClient: auth.serviceClient,
        staffProfile: auth.staffProfile,
        user: auth.user,
      }).catch((error) => {
        console.error("[Zingara Analytics] Daily report lock release failed", error);
      });
    }
  }
}
