import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  pickAuditFields,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";
import {
  canReuseShowLock,
  type ShowLockPurpose,
} from "@/lib/showBookingCreation";

export const dynamic = "force-dynamic";

const staleLockMs = 5 * 60 * 1000;
const metadataPrefix = "__zingara_show_meta__:";

type ShowEditLockRow = {
  id: string;
  last_activity_at: string;
  lock_purpose?: ShowLockPurpose | null;
  release_reason?: string | null;
  released_at?: string | null;
  session_id: string;
  show_id: string;
  show_reference: string;
  staff_name: string;
  staff_profile_id?: string | null;
  staff_role: string;
  staff_user_id?: string | null;
  started_at: string;
  takeover_requested_at?: string | null;
  takeover_requested_by?: string | null;
  takeover_requested_by_name?: string | null;
};

function isLockStale(lock: Pick<ShowEditLockRow, "last_activity_at">) {
  return Date.now() - new Date(lock.last_activity_at).getTime() > staleLockMs;
}

function toClientLock(lock: ShowEditLockRow) {
  return {
    id: lock.id,
    isStale: isLockStale(lock),
    lastActivityAt: lock.last_activity_at,
    lockPurpose: lock.lock_purpose ?? "show-edit",
    releaseReason: lock.release_reason,
    releasedAt: lock.released_at,
    sessionId: lock.session_id,
    showId: lock.show_id,
    showReference: lock.show_reference,
    staffName: lock.staff_name,
    staffProfileId: lock.staff_profile_id,
    staffRole: lock.staff_role,
    staffUserId: lock.staff_user_id,
    startedAt: lock.started_at,
    takeoverRequestedAt: lock.takeover_requested_at,
    takeoverRequestedBy: lock.takeover_requested_by,
    takeoverRequestedByName: lock.takeover_requested_by_name,
  };
}

function getStaffRole(
  staffProfile: Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"],
) {
  const role = Array.isArray(staffProfile?.roles)
    ? staffProfile?.roles[0]
    : staffProfile?.roles;

  return getAdminRoleFromName(role?.name);
}

function getStaffRoleLabel(staffRole: string) {
  return staffRole
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getShowReference(row: { id: string; notes?: string | null }) {
  if (!row.notes?.startsWith(metadataPrefix)) {
    return row.id;
  }

  try {
    const parsed = JSON.parse(row.notes.slice(metadataPrefix.length)) as {
      legacyId?: string;
    };

    return parsed.legacyId || row.id;
  } catch {
    return row.id;
  }
}

async function loadShowByReference(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  showReference: string,
) {
  const { data, error } = await serviceClient
    .from("shows")
    .select("id,notes")
    .limit(500);

  if (error) {
    throw error;
  }

  return (
    ((data ?? []) as Array<{ id: string; notes?: string | null }>).find(
      (row) => getShowReference(row) === showReference,
    ) ?? null
  );
}

async function expireStaleLocks(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  request?: Request,
  staffProfile?: Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"],
  user?: Awaited<ReturnType<typeof requireActiveStaff>>["user"],
) {
  const staleBefore = new Date(Date.now() - staleLockMs).toISOString();
  const { data: staleLocks } = await serviceClient
    .from("show_edit_locks")
    .select("*")
    .is("released_at", null)
    .lt("last_activity_at", staleBefore);

  await serviceClient
    .from("show_edit_locks")
    .update({
      release_reason: "heartbeat-timeout",
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .is("released_at", null)
    .lt("last_activity_at", staleBefore);

  await Promise.all(
    ((staleLocks ?? []) as ShowEditLockRow[]).map((lock) =>
      tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "show-lock.stale-expired",
        beforeValues: pickAuditFields(lock, [
          "show_reference",
          "staff_name",
          "staff_role",
          "started_at",
          "last_activity_at",
        ]),
        changedFields: ["released_at", "release_reason"],
        entityId: lock.show_id,
        entityReference: lock.show_reference,
        entityType: "show",
        outcome: "success",
        reason: "Heartbeat timeout older than 5 minutes.",
        request,
        sourceArea: "Shows",
      }),
    ),
  );
}

async function loadActiveLock(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  showReference: string,
) {
  const { data, error } = await serviceClient
    .from("show_edit_locks")
    .select("*")
    .eq("show_reference", showReference)
    .is("released_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ShowEditLockRow | null;
}

export async function GET(request: Request) {
  const { error, serviceClient } = await requireActiveStaff(request);

  if (error || !serviceClient) {
    return error;
  }

  await expireStaleLocks(serviceClient, request);

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference")?.trim();
  let query = serviceClient
    .from("show_edit_locks")
    .select("*")
    .is("released_at", null)
    .order("last_activity_at", { ascending: false });

  if (reference) {
    query = query.eq("show_reference", reference);
  }

  const { data, error: loadError } = await query;

  if (loadError) {
    console.error("[Zingara API] Failed to load show edit locks", loadError);

    return Response.json(
      { error: "Show edit locks could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({
    locks: ((data ?? []) as ShowEditLockRow[]).map(toClientLock),
  });
}

export async function POST(request: Request) {
  const { error, serviceClient, staffProfile, user } =
    await requireActiveStaff(request);

  if (error || !serviceClient || !staffProfile || !user) {
    return error;
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    lockId?: string;
    purpose?: ShowLockPurpose;
    reason?: string;
    sessionId?: string;
    showReference?: string;
  };
  const action = body.action;
  const staffRole = getStaffRole(staffProfile);
  const staffRoleLabel = getStaffRoleLabel(staffRole);
  const now = new Date().toISOString();

  await expireStaleLocks(serviceClient, request, staffProfile, user);

  if (action === "acquire" || action === "force-takeover") {
    const showReference = body.showReference?.trim();
    const sessionId = body.sessionId?.trim();
    const purpose = body.purpose ?? "show-edit";

    if (!(["show-edit", "booking-creation"] as string[]).includes(purpose)) {
      return Response.json({ error: "Invalid show lock purpose." }, { status: 400 });
    }

    if (
      action === "force-takeover" &&
      !["super-admin", "venue-manager"].includes(staffRole)
    ) {
      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "show-lock.force-takeover",
        entityReference: showReference || "unknown-show",
        entityType: "show",
        outcome: "blocked",
        reason: "Only Super Admin or Venue Manager may force takeover.",
        request,
        sourceArea: "Shows",
      });

      return Response.json(
        { error: "Only Super Admin or Venue Manager may force takeover." },
        { status: 403 },
      );
    }

    if (!showReference || !sessionId) {
      return Response.json(
        { error: "Show reference and session ID are required." },
        { status: 400 },
      );
    }

    const show = await loadShowByReference(serviceClient, showReference);

    if (!show?.id) {
      return Response.json({ status: "missing" });
    }

    const activeLock = await loadActiveLock(serviceClient, showReference);

    if (
      activeLock?.staff_profile_id === staffProfile.id &&
      canReuseShowLock({
        existingPurpose: activeLock.lock_purpose ?? "show-edit",
        existingSessionId: activeLock.session_id,
        requestedPurpose: purpose,
        requestedSessionId: sessionId,
      })
    ) {
      const { data: updatedLock, error: updateError } = await serviceClient
        .from("show_edit_locks")
        .update({
          last_activity_at: now,
          session_id: sessionId,
          updated_at: now,
        })
        .eq("id", activeLock.id)
        .select("*")
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      return Response.json({
        lock: toClientLock(updatedLock as ShowEditLockRow),
        status: "acquired",
      });
    }

    if (activeLock) {
      if (action !== "force-takeover") {
        await tryRecordAuditEvent(serviceClient, staffProfile, user, {
          action: "show-lock.acquire",
          beforeValues: pickAuditFields(activeLock, [
            "staff_name",
            "staff_role",
            "started_at",
            "last_activity_at",
          ]),
          entityId: activeLock.show_id,
          entityReference: activeLock.show_reference,
          entityType: "show",
          outcome: "blocked",
          reason: `An exclusive ${activeLock.lock_purpose ?? "show-edit"} lock is active for this show.`,
          request,
          sourceArea: "Shows",
        });

        return Response.json({
          lock: toClientLock(activeLock),
          status: "blocked",
        });
      }

      await serviceClient
        .from("show_edit_locks")
        .update({
          release_reason: "force-takeover",
          released_at: now,
          updated_at: now,
        })
        .eq("id", activeLock.id);

      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "show-lock.force-takeover",
        beforeValues: pickAuditFields(activeLock, [
          "staff_name",
          "staff_role",
          "started_at",
          "last_activity_at",
        ]),
        changedFields: ["staff_name", "staff_role", "released_at"],
        entityId: activeLock.show_id,
        entityReference: activeLock.show_reference,
        entityType: "show",
        outcome: "success",
        reason: "Existing show edit lock was force released.",
        request,
        sourceArea: "Shows",
      });
    }

    const { data: newLock, error: insertError } = await serviceClient
      .from("show_edit_locks")
      .insert({
        last_activity_at: now,
        lock_purpose: purpose,
        session_id: sessionId,
        show_id: show.id,
        show_reference: showReference,
        staff_name: staffProfile.full_name || staffProfile.email,
        staff_profile_id: staffProfile.id,
        staff_role: staffRoleLabel,
        staff_user_id: user.id,
        started_at: now,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();

    if (insertError) {
      const latestLock = await loadActiveLock(serviceClient, showReference);

      if (latestLock) {
        const ownsLatestLock =
          latestLock.staff_profile_id === staffProfile.id &&
          canReuseShowLock({
            existingPurpose: latestLock.lock_purpose ?? "show-edit",
            existingSessionId: latestLock.session_id,
            requestedPurpose: purpose,
            requestedSessionId: sessionId,
          });

        return Response.json({
          lock: toClientLock(latestLock),
          status: ownsLatestLock ? "acquired" : "blocked",
        });
      }

      throw insertError;
    }

    await tryRecordAuditEvent(serviceClient, staffProfile, user, {
      action: "show-lock.acquire",
      afterValues: pickAuditFields(newLock as Record<string, unknown>, [
        "show_reference",
        "lock_purpose",
        "staff_name",
        "staff_role",
        "started_at",
      ]),
      changedFields: ["staff_name", "staff_role", "started_at"],
      entityId: show.id,
      entityReference: showReference,
      entityType: "show",
      outcome: "success",
      request,
      sourceArea: "Shows",
    });

    return Response.json({
      lock: toClientLock(newLock as ShowEditLockRow),
      status: "acquired",
    });
  }

  if (action === "heartbeat") {
    const lockId = body.lockId?.trim();
    const sessionId = body.sessionId?.trim();

    if (!lockId || !sessionId) {
      return Response.json(
        { error: "Lock ID and session ID are required." },
        { status: 400 },
      );
    }

    const { data: updatedLock, error: updateError } = await serviceClient
      .from("show_edit_locks")
      .update({
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", lockId)
      .eq("staff_profile_id", staffProfile.id)
      .eq("session_id", sessionId)
      .is("released_at", null)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!updatedLock) {
      return Response.json({ status: "blocked" });
    }

    return Response.json({
      lock: toClientLock(updatedLock as ShowEditLockRow),
      status: "acquired",
    });
  }

  if (action === "release") {
    const lockId = body.lockId?.trim();
    const sessionId = body.sessionId?.trim();

    if (!lockId || !sessionId) {
      return Response.json(
        { error: "Lock ID and session ID are required." },
        { status: 400 },
      );
    }

    const { data: releasedLock } = await serviceClient
      .from("show_edit_locks")
      .update({
        release_reason: body.reason?.trim() || "released",
        released_at: now,
        updated_at: now,
      })
      .eq("id", lockId)
      .eq("staff_profile_id", staffProfile.id)
      .eq("session_id", sessionId)
      .is("released_at", null)
      .select("*")
      .maybeSingle();

    if (releasedLock) {
      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "show-lock.release",
        afterValues: pickAuditFields(releasedLock as Record<string, unknown>, [
          "release_reason",
          "released_at",
        ]),
        changedFields: ["released_at", "release_reason"],
        entityId: (releasedLock as ShowEditLockRow).show_id,
        entityReference: (releasedLock as ShowEditLockRow).show_reference,
        entityType: "show",
        outcome: "success",
        reason: body.reason?.trim() || "released",
        request,
        sourceArea: "Shows",
      });
    }

    return Response.json({ released: true });
  }

  return Response.json({ error: "Unsupported lock action." }, { status: 400 });
}
