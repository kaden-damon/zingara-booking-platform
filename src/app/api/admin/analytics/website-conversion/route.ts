import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import type { WebsiteConversionReport } from "@/lib/websiteConversionAnalytics";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validVenues = new Set(["all", "cape-town", "johannesburg"]);

function getRole(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(getRole(auth.staffProfile)).includes("analytics:read")) {
    return Response.json({ error: "Analytics access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || dateOffset(-29);
  const to = url.searchParams.get("to") || dateOffset(0);
  const requestedVenue = url.searchParams.get("venue") || "all";

  if (!datePattern.test(from) || !datePattern.test(to) || from > to) {
    return Response.json({ error: "Choose a valid reporting date range." }, { status: 400 });
  }

  const rangeDays = Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
  if (rangeDays > 30) {
    return Response.json({ error: "Website conversion reporting is limited to 31 days." }, { status: 400 });
  }

  if (!validVenues.has(requestedVenue)) {
    return Response.json({ error: "Choose a valid venue." }, { status: 400 });
  }

  const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
  const canSeeAll = scope.includes("all");
  const venue = (
    !canSeeAll && requestedVenue === "all" && scope.length === 1
      ? scope[0]
      : requestedVenue
  ) as WebsiteConversionReport["venue"];
  if (!canSeeAll && !scope.includes(venue)) {
    return Response.json({ error: "This venue is outside your access scope." }, { status: 403 });
  }

  const { data, error } = await auth.serviceClient.rpc(
    "get_website_conversion_analytics_v3",
    { p_from: from, p_to: to, p_venue: venue },
  );

  if (error || !data) {
    console.error("[Zingara Analytics] Website conversion report failed", {
      message: error?.message ?? "No report returned",
    });
    return Response.json(
      { error: "Website conversion analytics could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json(
    { report: data as WebsiteConversionReport },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
