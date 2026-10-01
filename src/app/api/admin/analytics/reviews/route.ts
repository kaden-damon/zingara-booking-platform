import type { AnalyticsVenue } from "@/lib/managementAnalytics";
import type { ReviewAnalyticsFilters } from "@/lib/reviews/reviewAnalytics";
import { loadReviewAnalyticsReport } from "@/lib/supabase/reviewAnalyticsServer";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function dateValue(value: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseFilters(url: URL) {
  const allowed = new Set([
    "performanceFrom",
    "performanceId",
    "performanceTo",
    "submittedFrom",
    "submittedTo",
    "venue",
  ]);
  const unknown = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (unknown) {
    return { error: "Unsupported filter: " + unknown + "." } as const;
  }

  const venueValue = url.searchParams.get("venue") ?? "all";
  if (!["all", "cape-town", "johannesburg"].includes(venueValue)) {
    return { error: "Invalid venue." } as const;
  }
  const submittedFrom = dateValue(url.searchParams.get("submittedFrom"));
  const submittedTo = dateValue(url.searchParams.get("submittedTo"));
  const performanceFrom = dateValue(url.searchParams.get("performanceFrom"));
  const performanceTo = dateValue(url.searchParams.get("performanceTo"));
  if (
    submittedFrom === null ||
    submittedTo === null ||
    performanceFrom === null ||
    performanceTo === null
  ) {
    return { error: "Analytics dates must use YYYY-MM-DD." } as const;
  }
  if (
    (submittedFrom && submittedTo && submittedFrom > submittedTo) ||
    (performanceFrom && performanceTo && performanceFrom > performanceTo)
  ) {
    return { error: "The start date must not be after the end date." } as const;
  }
  const performanceId = url.searchParams.get("performanceId")?.trim() ?? "";
  if (performanceId && !/^[0-9a-f-]{36}$/i.test(performanceId)) {
    return { error: "Invalid performance." } as const;
  }

  return {
    value: {
      performanceFrom,
      performanceId,
      performanceTo,
      submittedFrom,
      submittedTo,
      venue: venueValue as "all" | AnalyticsVenue,
    } satisfies ReviewAnalyticsFilters,
  } as const;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) {
    return Response.json({ error: "Analytics access is required." }, { status: 403 });
  }

  const parsed = parseFilters(new URL(request.url));
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const report = await loadReviewAnalyticsReport(
      auth.serviceClient,
      auth.staffProfile.venue_scope,
      parsed.value,
    );
    return Response.json(
      { report },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[Zingara Analytics] Review analytics failed", error);
    return Response.json(
      { error: "Guest review analytics could not be loaded." },
      { status: 500 },
    );
  }
}
