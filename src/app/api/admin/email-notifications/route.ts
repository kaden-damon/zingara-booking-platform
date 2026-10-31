import {
  loadManagementEmailRoute,
  loadPersonalEmailSubscriptions,
  staffEmailNotificationRegistry,
  type PersonalEmailNotificationKey,
  type StaffEmailRouteKey,
} from "@/lib/email/staffEmailNotifications";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";
import { loadPlatformFeedbackCampaignConfiguration } from "@/lib/platformFeedbackConfiguration";

export const dynamic = "force-dynamic";

function permissionsOf(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;
  return getRolePermissions(role);
}

function canManageOrganisation(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return permissionsOf(staffProfile).includes("settings:manage");
}

function isPersonalKey(value: unknown): value is PersonalEmailNotificationKey {
  return staffEmailNotificationRegistry.some(
    (item) => item.mode === "personal" && item.key === value,
  );
}

function isRoutedKey(
  value: unknown,
): value is StaffEmailRouteKey {
  return staffEmailNotificationRegistry.some(
    (item) => item.routed && item.key === value,
  );
}

async function responsePayload(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
  includeStaffOptions = true,
) {
  const canManage = canManageOrganisation(auth.staffProfile!);
  const routedKeys = staffEmailNotificationRegistry
    .filter((item) => item.routed)
    .map((item) => item.key);
  const [personal, managementRoutes, staffOptions, bookingExperienceFeedback] = await Promise.all([
    loadPersonalEmailSubscriptions(auth.serviceClient!, auth.staffProfile!.id),
    Promise.all(routedKeys.map((key) => loadManagementEmailRoute(auth.serviceClient!, key))),
    canManage && includeStaffOptions
      ? auth.serviceClient!
          .from("staff_profiles")
          .select("id,full_name,email,venue_scope")
          .eq("active", true)
          .not("email", "is", null)
          .order("full_name")
      : Promise.resolve({ data: [], error: null }),
    canManage
      ? loadPlatformFeedbackCampaignConfiguration(auth.serviceClient!)
      : Promise.resolve(null),
  ]);
  if (staffOptions.error) throw staffOptions.error;

  return {
    canManageOrganisation: canManage,
    bookingExperienceFeedback: bookingExperienceFeedback
      ? {
          enabled: bookingExperienceFeedback.automationEnabled,
          status: bookingExperienceFeedback.status,
        }
      : null,
    management: managementRoutes.map((route) =>
      canManage ? route : { ...route, cc: [], to: [] },
    ),
    personal,
    staffOptions: (staffOptions.data ?? []).map((staff) => ({
      email: staff.email,
      id: staff.id,
      name: staff.full_name,
      venueScope: staff.venue_scope ?? [],
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;

  try {
    return Response.json(
      await responsePayload(
        auth,
        new URL(request.url).searchParams.get("details") === "true",
      ),
    );
  } catch (error) {
    console.error("[Email Notifications] Settings could not be loaded", error);
    return Response.json(
      { error: "Email notification settings couldn't be loaded. Try again." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          action?: "booking-feedback-automation" | "management" | "personal";
          ccStaffProfileIds?: unknown;
          enabled?: unknown;
          notificationKey?: unknown;
          toStaffProfileIds?: unknown;
        }
      | null;

    if (body?.action === "booking-feedback-automation") {
      if (!canManageOrganisation(auth.staffProfile)) {
        return Response.json(
          { error: "Management access is required to change organisation email settings." },
          { status: 403 },
        );
      }
      if (typeof body.enabled !== "boolean") {
        return Response.json({ error: "Choose whether this email is on or off." }, { status: 400 });
      }
      const before = await loadPlatformFeedbackCampaignConfiguration(auth.serviceClient);
      const { error } = await auth.serviceClient
        .from("platform_feedback_campaigns")
        .update({ automation_enabled: body.enabled, updated_at: new Date().toISOString() })
        .eq("id", before.id);
      if (error) throw error;
      await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "Booking Experience Feedback automation updated",
        afterValues: { enabled: body.enabled },
        beforeValues: { enabled: before.automationEnabled },
        entityId: before.id,
        entityReference: "booking-experience-feedback",
        entityType: "workflow",
        outcome: "success",
        request,
        sourceArea: "Email Notifications",
      });
      return Response.json(await responsePayload(auth));
    }

    if (body?.action === "personal" && isPersonalKey(body.notificationKey)) {
      if (typeof body.enabled !== "boolean") {
        return Response.json(
          { error: "Choose whether this email is on or off." },
          { status: 400 },
        );
      }
      const { error } = await auth.serviceClient
        .from("staff_email_subscriptions")
        .upsert(
          {
            enabled: body.enabled,
            notification_key: body.notificationKey,
            staff_profile_id: auth.staffProfile.id,
            updated_at: new Date().toISOString(),
            updated_by: auth.staffProfile.id,
          },
          { onConflict: "staff_profile_id,notification_key" },
        );
      if (error) throw error;
      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: "Personal email subscription updated",
          afterValues: {
            enabled: body.enabled,
            notificationKey: body.notificationKey,
          },
          entityId: auth.staffProfile.id,
          entityReference: auth.staffProfile.email,
          entityType: "staff",
          outcome: "success",
          request,
          sourceArea: "Email Notifications",
        },
      );
      return Response.json(await responsePayload(auth));
    }

    if (body?.action === "management" && isRoutedKey(body.notificationKey)) {
      if (!canManageOrganisation(auth.staffProfile)) {
        return Response.json(
          { error: "Management access is required to change email routing." },
          { status: 403 },
        );
      }
      const toStaffProfileIds = Array.isArray(body.toStaffProfileIds)
        ? [...new Set(body.toStaffProfileIds.map(String))]
        : [];
      const ccStaffProfileIds = Array.isArray(body.ccStaffProfileIds)
        ? [...new Set(body.ccStaffProfileIds.map(String))].filter(
            (id) => !toStaffProfileIds.includes(id),
          )
        : [];
      if (
        typeof body.enabled !== "boolean" ||
        (body.enabled && toStaffProfileIds.length === 0)
      ) {
        return Response.json(
          { error: "Choose at least one primary recipient before enabling this email." },
          { status: 400 },
        );
      }
      const recipientIds = [...toStaffProfileIds, ...ccStaffProfileIds];
      const { data: recipients, error: recipientError } = recipientIds.length
        ? await auth.serviceClient
            .from("staff_profiles")
            .select("id")
            .in("id", recipientIds)
            .eq("active", true)
            .not("email", "is", null)
        : { data: [], error: null };
      if (recipientError) throw recipientError;
      if ((recipients ?? []).length !== recipientIds.length) {
        return Response.json(
          { error: "Every recipient must be an active staff member with an email address." },
          { status: 400 },
        );
      }

      const before = await loadManagementEmailRoute(
        auth.serviceClient,
        body.notificationKey,
      );
      const { error } = await auth.serviceClient
        .from("management_email_notification_routes")
        .update({
          cc_staff_profile_ids: ccStaffProfileIds,
          enabled: body.enabled,
          to_staff_profile_ids: toStaffProfileIds,
          updated_at: new Date().toISOString(),
          updated_by: auth.staffProfile.id,
        })
        .eq("notification_key", body.notificationKey);
      if (error) throw error;
      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: "Management email routing updated",
          afterValues: {
            ccStaffProfileIds,
            enabled: body.enabled,
            notificationKey: body.notificationKey,
            toStaffProfileIds,
          },
          beforeValues: {
            ccStaffProfileIds: before.cc.map((member) => member.id),
            enabled: before.enabled,
            notificationKey: before.key,
            toStaffProfileIds: before.to.map((member) => member.id),
          },
          entityReference: body.notificationKey,
          entityType: "workflow",
          outcome: "success",
          request,
          sourceArea: "Email Notifications",
        },
      );
      return Response.json(await responsePayload(auth));
    }

    return Response.json(
      { error: "Choose a valid email notification setting." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[Email Notifications] Settings could not be saved", error);
    return Response.json(
      { error: "Email notification settings couldn't be saved. Try again." },
      { status: 500 },
    );
  }
}
