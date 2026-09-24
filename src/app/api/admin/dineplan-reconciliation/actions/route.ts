import {
  buildDineplanActionDigest,
  canReceiveDineplanVenue,
  isDineplanReminderEligible,
  isDineplanSnapshotStale,
  routeDineplanDigestAudiences,
  type DineplanActionSettings,
} from "@/lib/dineplanActions";
import {
  dineplanActionSelect,
  loadDineplanActionSettings,
  mapDineplanActionRow,
  recordDineplanActionEvent,
} from "@/lib/dineplanActionStore";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const productionAdminOrigin = "https://book.zingara.co.za";

function roleOf(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(staffProfile.roles) ? staffProfile.roles[0] : staffProfile.roles;
}

function permissionsOf(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return getRolePermissions(roleOf(staffProfile));
}

function canReconcile(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const permissions = permissionsOf(staffProfile);
  return permissions.includes("bookings:reconcile") || permissions.includes("settings:manage");
}

function canManageSettings(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return permissionsOf(staffProfile).includes("settings:manage");
}

function canAccessVenue(staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>, venue: string) {
  const location = normalizeShowLocation(venue);
  return Boolean(location && canReceiveDineplanVenue(staffProfile.venue_scope ?? [], location));
}

function forbidden() {
  return Response.json({ error: "You do not have permission to use the Dineplan Action Centre." }, { status: 403 });
}

function settingsResponse(settings: DineplanActionSettings, includeRecipients: boolean) {
  return includeRecipients ? settings : {
    ...settings,
    actionRecipientStaffIds: [],
    corporateRecipientStaffIds: [],
    managementCcStaffIds: [],
  };
}

async function loadActionRows(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>,
) {
  const { data, error } = await serviceClient
    .from("dineplan_reconciliation_actions")
    .select(dineplanActionSelect)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []).filter((row) => canAccessVenue(staffProfile, row.venue));
  const staffIds = [...new Set(rows.flatMap((row) => [row.acknowledged_by, row.no_action_by]).filter(Boolean))];
  const staffNames = new Map<string, string>();
  if (staffIds.length) {
    const { data: staff, error: staffError } = await serviceClient
      .from("staff_profiles")
      .select("id,full_name")
      .in("id", staffIds);
    if (staffError) throw staffError;
    for (const member of staff ?? []) staffNames.set(member.id, member.full_name);
  }
  return rows.map((row) => mapDineplanActionRow(row, staffNames));
}

async function loadLatestSource(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  staffProfile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>,
) {
  const scope = staffProfile.venue_scope ?? [];
  const permittedVenues = (["cape-town", "johannesburg"] as const).filter((venue) =>
    canReceiveDineplanVenue(scope, venue),
  );
  if (!permittedVenues.length) return null;
  const { data, error } = await serviceClient
    .from("dineplan_reconciliation_snapshots")
    .select("source_generated_at")
    .eq("status", "reconciled")
    .in("venue", permittedVenues)
    .not("source_generated_at", "is", null)
    .order("source_generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.source_generated_at ?? null;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile || !auth.serviceClient) return auth.error;
  if (!canReconcile(auth.staffProfile)) return forbidden();
  try {
    const [settings, actions, latestSource] = await Promise.all([
      loadDineplanActionSettings(auth.serviceClient),
      loadActionRows(auth.serviceClient, auth.staffProfile),
      loadLatestSource(auth.serviceClient, auth.staffProfile),
    ]);
    const canConfigure = canManageSettings(auth.staffProfile);
    const previewRequested = new URL(request.url).searchParams.get("preview") === "1";
    let previews: Array<{
      audience: "corporate" | "general";
      cc: string[];
      digest: NonNullable<ReturnType<typeof buildDineplanActionDigest>>;
      to: string[];
    }> = [];
    if (previewRequested) {
      const recipientIds = [...new Set([
        ...settings.actionRecipientStaffIds,
        ...settings.corporateRecipientStaffIds,
        ...settings.managementCcStaffIds,
      ])];
      const { data: recipientRows, error: recipientError } = recipientIds.length
        ? await auth.serviceClient.from("staff_profiles").select("id,full_name,email,venue_scope").in("id", recipientIds).eq("active", true).not("email", "is", null)
        : { data: [], error: null };
      if (recipientError) throw recipientError;
      const recipientById = new Map((recipientRows ?? []).map((staff) => [staff.id, staff]));
      const recipients = (ids: string[]) => ids.flatMap((id) => {
        const staff = recipientById.get(id);
        return staff ? [{ id, venueScope: staff.venue_scope ?? [] }] : [];
      });
      previews = routeDineplanDigestAudiences({
        actions: actions.filter((action) => isDineplanReminderEligible(action, settings)),
        corporateRecipients: recipients(settings.corporateRecipientStaffIds),
        generalRecipients: recipients(settings.actionRecipientStaffIds),
        managementRecipients: recipients(settings.managementCcStaffIds),
      }).flatMap((audience) => {
        const digest = buildDineplanActionDigest({ actions: audience.actions, adminBaseUrl: productionAdminOrigin, settings });
        return digest ? [{
          audience: audience.audience,
          cc: audience.ccIds.map((id) => recipientById.get(id)?.email).filter((email): email is string => Boolean(email)),
          digest,
          to: audience.toIds.map((id) => recipientById.get(id)?.email).filter((email): email is string => Boolean(email)),
        }] : [];
      });
    }
    let staffOptions: Array<{ email: string; id: string; name: string }> = [];
    if (canConfigure) {
      const { data, error } = await auth.serviceClient
        .from("staff_profiles")
        .select("id,full_name,email")
        .eq("active", true)
        .not("email", "is", null)
        .order("full_name");
      if (error) throw error;
      staffOptions = (data ?? []).map((staff) => ({ email: staff.email, id: staff.id, name: staff.full_name }));
    }
    return Response.json({
      actions,
      canConfigure,
      latestSource,
      preview: previews[0]?.digest ?? null,
      previews,
      settings: settingsResponse(settings, canConfigure),
      snapshotStale: isDineplanSnapshotStale(latestSource, settings),
      staffOptions,
    });
  } catch (error) {
    console.error("[Dineplan Action Centre] Load failed", error);
    return Response.json({ error: "The Dineplan Action Centre could not be loaded. The Stage 1 migration may still need to be applied." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile || !auth.serviceClient || !auth.user) return auth.error;
  if (!canReconcile(auth.staffProfile)) return forbidden();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.action === "update_settings") {
    if (!canManageSettings(auth.staffProfile)) return forbidden();
    const actionRecipientStaffIds = Array.isArray(body.actionRecipientStaffIds) ? [...new Set(body.actionRecipientStaffIds.map(String))] : [];
    const corporateRecipientStaffIds = Array.isArray(body.corporateRecipientStaffIds) ? [...new Set(body.corporateRecipientStaffIds.map(String))] : [];
    const managementCcStaffIds = Array.isArray(body.managementCcStaffIds) ? [...new Set(body.managementCcStaffIds.map(String))] : [];
    const overlappingBoxOfficeIds = corporateRecipientStaffIds.filter((id) => actionRecipientStaffIds.includes(id));
    if (overlappingBoxOfficeIds.length) {
      return Response.json({ error: "Choose either General or Corporate only for each Box Office recipient." }, { status: 400 });
    }
    const normalAcknowledgedCadenceHours = Number(body.normalAcknowledgedCadenceHours);
    const preShowEscalationHours = Number(body.preShowEscalationHours);
    const snapshotStaleHours = Number(body.snapshotStaleHours);
    if (
      !Number.isInteger(normalAcknowledgedCadenceHours) || normalAcknowledgedCadenceHours < 1 || normalAcknowledgedCadenceHours > 24 ||
      !Number.isInteger(preShowEscalationHours) || preShowEscalationHours < 1 || preShowEscalationHours > 24 ||
      !Number.isInteger(snapshotStaleHours) || snapshotStaleHours < 1 || snapshotStaleHours > 168
    ) return Response.json({ error: "Enter valid reminder and stale-data thresholds." }, { status: 400 });
    const recipientIds = [...new Set([...actionRecipientStaffIds, ...corporateRecipientStaffIds, ...managementCcStaffIds])];
    if (Boolean(body.hourlyRemindersEnabled) && !actionRecipientStaffIds.length) {
      return Response.json({ error: "Choose at least one active Box Office action recipient before enabling reminders." }, { status: 400 });
    }
    if (recipientIds.length) {
      const { data, error } = await auth.serviceClient
        .from("staff_profiles")
        .select("id,email")
        .in("id", recipientIds)
        .eq("active", true)
        .not("email", "is", null);
      if (error) throw error;
      if ((data ?? []).length !== recipientIds.length) {
        return Response.json({ error: "Every digest recipient must be an active staff profile with an email address." }, { status: 400 });
      }
    }
    const settings = {
      actionRecipientStaffIds,
      corporateRecipientStaffIds,
      hourlyRemindersEnabled: Boolean(body.hourlyRemindersEnabled),
      managementCcStaffIds,
      normalAcknowledgedCadenceHours,
      preShowEscalationHours,
      snapshotStaleHours,
    } satisfies DineplanActionSettings;
    const { error } = await auth.serviceClient
      .from("dineplan_reconciliation_settings")
      .update({
        action_recipient_staff_ids: settings.actionRecipientStaffIds,
        corporate_recipient_staff_ids: settings.corporateRecipientStaffIds,
        hourly_reminders_enabled: settings.hourlyRemindersEnabled,
        management_cc_staff_ids: settings.managementCcStaffIds,
        normal_acknowledged_cadence_hours: settings.normalAcknowledgedCadenceHours,
        pre_show_escalation_hours: settings.preShowEscalationHours,
        snapshot_stale_hours: settings.snapshotStaleHours,
        updated_at: new Date().toISOString(),
        updated_by: auth.staffProfile.id,
      })
      .eq("id", 1);
    if (error) throw error;
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "Dineplan action digest settings updated",
      afterValues: { hourlyRemindersEnabled: settings.hourlyRemindersEnabled, recipientCount: recipientIds.length },
      entityReference: "dineplan-action-settings",
      entityType: "data-portability-import",
      outcome: "success",
      request,
      sourceArea: "Dineplan Reconciliation",
    });
    return Response.json({ settings });
  }

  const actionId = typeof body?.actionId === "string" ? body.actionId : "";
  const disposition = body?.action === "acknowledge" ? "acknowledged" : body?.action === "no_action" ? "no_action" : null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!actionId || !disposition || (disposition === "no_action" && !note)) {
    return Response.json({ error: "Choose a valid action outcome and include a reason for No Action Required." }, { status: 400 });
  }
  const { data: action, error: actionError } = await auth.serviceClient
    .from("dineplan_reconciliation_actions")
    .select("id,status,venue,booking_reference")
    .eq("id", actionId)
    .single();
  if (actionError || !action) return Response.json({ error: "The reconciliation action could not be found." }, { status: 404 });
  if (!canAccessVenue(auth.staffProfile, action.venue)) return forbidden();
  if (action.status === "resolved") return Response.json({ error: "A later reconciliation snapshot has already resolved this action." }, { status: 409 });
  if (action.status === disposition) return Response.json({ unchanged: true });
  const now = new Date().toISOString();
  const updates = disposition === "acknowledged"
    ? { acknowledged_at: now, acknowledged_by: auth.staffProfile.id, acknowledgement_note: note || null, status: disposition, updated_at: now }
    : { no_action_at: now, no_action_by: auth.staffProfile.id, no_action_reason: note, status: disposition, updated_at: now };
  const { data: updated, error: updateError } = await auth.serviceClient
    .from("dineplan_reconciliation_actions")
    .update(updates)
    .eq("id", actionId)
    .neq("status", "resolved")
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return Response.json({ error: "A later reconciliation snapshot resolved this action before your update." }, { status: 409 });
  await recordDineplanActionEvent(auth.serviceClient, {
    actionId,
    actorStaffProfileId: auth.staffProfile.id,
    eventType: disposition,
    metadata: note ? { note } : {},
  });
  await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
    action: disposition === "acknowledged" ? "Dineplan discrepancy acknowledged" : "Dineplan discrepancy marked no action required",
    afterValues: { disposition, note: note || null },
    entityId: actionId,
    entityLocation: action.venue,
    entityReference: action.booking_reference ?? actionId,
    entityType: "data-portability-import",
    outcome: "success",
    request,
    sourceArea: "Dineplan Reconciliation",
  });
  return Response.json({ status: disposition, updatedAt: now });
}
