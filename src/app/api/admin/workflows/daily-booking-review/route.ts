import { getAdminRoleFromName, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";
import {
  loadDailyBookingReviewConfiguration,
  previewDailyBookingReviews,
  saveDailyBookingReviewConfiguration,
} from "@/lib/workflows/dailyBookingReview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getAdminRoleFromName(role?.name);
}

async function requireSuperAdmin(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return { auth, error: auth.error };
  if (roleOf(auth.staffProfile) !== "super-admin") {
    return { auth, error: Response.json({ error: "Daily Booking Review configuration is restricted to Super Admin." }, { status: 403 }) };
  }
  return { auth, error: null };
}

export async function GET(request: Request) {
  const access = await requireSuperAdmin(request);
  if (access.error) return access.error;
  if (!access.auth.serviceClient) {
    return Response.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }
  try {
    return Response.json(await previewDailyBookingReviews(access.auth.serviceClient));
  } catch (error) {
    console.error("[Daily Booking Review] Preview failed", error);
    return Response.json({ error: "Daily Booking Review preview could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = await requireSuperAdmin(request);
  if (access.error) return access.error;
  if (!access.auth.serviceClient || !access.auth.staffProfile) {
    return Response.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }
  try {
    const before = await loadDailyBookingReviewConfiguration(access.auth.serviceClient);
    const body = (await request.json()) as { enabled?: boolean; scheduledTime?: string; subject?: string };
    const after = await saveDailyBookingReviewConfiguration(
      access.auth.serviceClient,
      {
        enabled: Boolean(body.enabled),
        scheduledTime: body.scheduledTime ?? "08:00",
        subject: body.subject ?? "",
      },
      access.auth.user?.id ?? null,
    );
    await recordAuditEvent(access.auth.serviceClient, access.auth.staffProfile, access.auth.user, {
      action: "workflow.daily-booking-review.configuration-updated",
      afterValues: after,
      beforeValues: before,
      changedFields: ["enabled", "scheduledTime", "subject", "activatedAt"],
      entityReference: "daily-booking-review",
      entityType: "workflow",
      outcome: "success",
      request,
      sourceArea: "Automated Workflows",
    });
    return Response.json({ configuration: after });
  } catch (error) {
    console.error("[Daily Booking Review] Save failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Daily Booking Review could not be saved." }, { status: 400 });
  }
}
