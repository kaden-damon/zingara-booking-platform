import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import {
  normalizeStaffVenueScope,
  type StaffLocationValue,
} from "@/lib/staffLocations";
import type { BookingFailureRecoveryReport } from "@/lib/bookingFailureRecovery";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const venues = new Set(["all", "cape-town", "johannesburg"]);
const reasons = new Set([
  "all",
  "application-error",
  "booking-cutoff",
  "booking-validation",
  "concurrency-conflict",
  "payment-initiation-failed",
  "show-closed",
  "show-sold-out",
  "two-seater-limit",
  "zone-capacity-exhausted",
  "zone-unavailable",
]);

function getRole(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(date);
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
    return Response.json({ error: "Management reporting access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || dateOffset(-29);
  const to = url.searchParams.get("to") || dateOffset(0);
  const requestedVenue = url.searchParams.get("venue") || "all";
  const performanceDate = url.searchParams.get("performanceDate") || null;
  const zone = url.searchParams.get("zone") || "all";
  const reason = url.searchParams.get("reason") || "all";
  const page = Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0);

  if (!datePattern.test(from) || !datePattern.test(to) || from > to) {
    return Response.json({ error: "Choose a valid reporting date range." }, { status: 400 });
  }
  if (performanceDate && !datePattern.test(performanceDate)) {
    return Response.json({ error: "Choose a valid performance date." }, { status: 400 });
  }
  if (!venues.has(requestedVenue) || !reasons.has(reason)) {
    return Response.json({ error: "Choose valid report filters." }, { status: 400 });
  }

  const rangeDays = Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
  if (rangeDays > 92) {
    return Response.json({ error: "Booking failure reporting is limited to 93 days." }, { status: 400 });
  }

  const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
  const canSeeAll = scope.includes("all");
  const venue = !canSeeAll && requestedVenue === "all" && scope.length === 1
    ? scope[0]
    : requestedVenue as StaffLocationValue;
  if (!canSeeAll && !scope.includes(venue)) {
    return Response.json({ error: "This venue is outside your access scope." }, { status: 403 });
  }

  const { data, error } = await auth.serviceClient.rpc(
    "get_booking_failure_recovery_report",
    {
      p_failure_reason: reason,
      p_from: from,
      p_page: page,
      p_page_size: 25,
      p_performance_date: performanceDate,
      p_to: to,
      p_venue: venue,
      p_zone: zone,
    },
  );
  if (error || !data) {
    console.error("[Zingara Analytics] Booking failure report failed", {
      message: error?.message ?? "No report returned",
    });
    return Response.json({ error: "Booking failure reporting could not be loaded." }, { status: 500 });
  }

  return Response.json(
    { report: data as BookingFailureRecoveryReport },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
