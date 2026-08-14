import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  pickAuditFields,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

const staleLockMs = 5 * 60 * 1000;

type BookingEditLockRow = {
  booking_id: string;
  booking_reference: string;
  id: string;
  last_activity_at: string;
  release_reason?: string | null;
  released_at?: string | null;
  session_id: string;
  staff_name: string;
  staff_profile_id?: string | null;
  staff_role: string;
  staff_user_id?: string | null;
  started_at: string;
  takeover_requested_at?: string | null;
  takeover_requested_by?: string | null;
  takeover_requested_by_name?: string | null;
};

type StaffProfileRoleRow = {
  name?: string | null;
};

type StaffProfileWithRoleRow = {
  active: boolean;
  email: string;
  full_name: string;
  id: string;
  roles?: StaffProfileRoleRow | StaffProfileRoleRow[] | null;
  user_id: string;
};

function isLockStale(lock: Pick<BookingEditLockRow, "last_activity_at">) {
  return Date.now() - new Date(lock.last_activity_at).getTime() > staleLockMs;
}

function toClientLock(lock: BookingEditLockRow) {
  return {
    bookingId: lock.booking_id,
    bookingReference: lock.booking_reference,
    id: lock.id,
    isStale: isLockStale(lock),
    lastActivityAt: lock.last_activity_at,
    releaseReason: lock.release_reason,
    releasedAt: lock.released_at,
    sessionId: lock.session_id,
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

function getStaffRole(staffProfile: Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]) {
  const role = Array.isArray(staffProfile?.roles)
    ? staffProfile?.roles[0]
    : staffProfile?.roles;

  return getAdminRoleFromName(role?.name);
}

function getStaffRoleFromRow(staffProfile: StaffProfileWithRoleRow | null) {
  const role = Array.isArray(staffProfile?.roles)
    ? staffProfile?.roles[0]
    : staffProfile?.roles;

  return getAdminRoleFromName(role?.name);
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
    .from("booking_edit_locks")
    .select("*")
    .is("released_at", null)
    .lt("last_activity_at", staleBefore);

  await serviceClient
    .from("booking_edit_locks")
    .update({
      release_reason: "heartbeat-timeout",
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .is("released_at", null)
    .lt("last_activity_at", staleBefore);

  await Promise.all(
    ((staleLocks ?? []) as BookingEditLockRow[]).map((lock) =>
      tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "booking-lock.stale-expired",
        beforeValues: pickAuditFields(lock, [
          "booking_reference",
          "staff_name",
          "staff_role",
          "started_at",
          "last_activity_at",
        ]),
        changedFields: ["released_at", "release_reason"],
        entityId: lock.booking_id,
        entityReference: lock.booking_reference,
        entityType: "booking-lock",
        outcome: "success",
        reason: "Heartbeat timeout older than 5 minutes.",
        request,
        sourceArea: "Bookings",
      }),
    ),
  );
}

async function loadActiveLock(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  bookingReference: string,
) {
  const { data, error } = await serviceClient
    .from("booking_edit_locks")
    .select("*")
    .eq("booking_reference", bookingReference)
    .is("released_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as BookingEditLockRow | null;
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
    .from("booking_edit_locks")
    .select("*")
    .is("released_at", null)
    .order("last_activity_at", { ascending: false });

  if (reference) {
    query = query.eq("booking_reference", reference);
  }

  const { data, error: loadError } = await query;

  if (loadError) {
    console.error("[Zingara API] Failed to load booking edit locks", loadError);

    return Response.json(
      { error: "Booking edit locks could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({
    locks: ((data ?? []) as BookingEditLockRow[]).map(toClientLock),
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
    bookingReference?: string;
    lockId?: string;
    reason?: string;
    sessionId?: string;
  };
  const action = body.action;
  const staffRole = getStaffRole(staffProfile);
  const staffRoleLabel = staffRole
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  const now = new Date().toISOString();

  await expireStaleLocks(serviceClient, request, staffProfile, user);

  if (action === "acquire" || action === "force-takeover") {
    const bookingReference = body.bookingReference?.trim();
    const sessionId = body.sessionId?.trim();

    if (
      action === "force-takeover" &&
      !["super-admin", "venue-manager"].includes(staffRole)
    ) {
      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "booking-lock.force-takeover",
        entityReference: bookingReference || "unknown-booking",
        entityType: "booking-lock",
        outcome: "blocked",
        reason: "Only Super Admin or Venue Manager may force takeover.",
        request,
        sourceArea: "Bookings",
      });

      return Response.json(
        { error: "Only Super Admin or Venue Manager may force takeover." },
        { status: 403 },
      );
    }

    if (!bookingReference || !sessionId) {
      return Response.json(
        { error: "Booking reference and session ID are required." },
        { status: 400 },
      );
    }

    const { data: booking, error: bookingError } = await serviceClient
      .from("bookings")
      .select("id,booking_reference")
      .eq("booking_reference", bookingReference)
      .maybeSingle();

    if (bookingError) {
      throw bookingError;
    }

    if (!booking?.id) {
      return Response.json({ status: "missing" });
    }

    const activeLock = await loadActiveLock(serviceClient, bookingReference);

    if (activeLock?.staff_profile_id === staffProfile.id) {
      const { data: updatedLock, error: updateError } = await serviceClient
        .from("booking_edit_locks")
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
        lock: toClientLock(updatedLock as BookingEditLockRow),
        status: "acquired",
      });
    }

    if (activeLock) {
      if (action !== "force-takeover") {
        await tryRecordAuditEvent(serviceClient, staffProfile, user, {
          action: "booking-lock.acquire",
          beforeValues: pickAuditFields(activeLock, [
            "staff_name",
            "staff_role",
            "started_at",
            "last_activity_at",
          ]),
          entityId: activeLock.booking_id,
          entityReference: activeLock.booking_reference,
          entityType: "booking-lock",
          outcome: "blocked",
          reason: "Another staff member is currently editing this booking.",
          request,
          sourceArea: "Bookings",
        });

        return Response.json({
          lock: toClientLock(activeLock),
          status: "blocked",
        });
      }

      await serviceClient
        .from("booking_edit_locks")
        .update({
          release_reason: "force-takeover",
          released_at: now,
          updated_at: now,
        })
        .eq("id", activeLock.id);

      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "booking-lock.force-takeover",
        beforeValues: pickAuditFields(activeLock, [
          "staff_name",
          "staff_role",
          "started_at",
          "last_activity_at",
        ]),
        changedFields: ["staff_name", "staff_role", "released_at"],
        entityId: activeLock.booking_id,
        entityReference: activeLock.booking_reference,
        entityType: "booking-lock",
        outcome: "success",
        reason: "Existing booking edit lock was force released.",
        request,
        sourceArea: "Bookings",
      });
    }

    const { data: newLock, error: insertError } = await serviceClient
      .from("booking_edit_locks")
      .insert({
        booking_id: booking.id,
        booking_reference: booking.booking_reference,
        last_activity_at: now,
        session_id: sessionId,
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
      const latestLock = await loadActiveLock(serviceClient, bookingReference);

      if (latestLock) {
        return Response.json({
          lock: toClientLock(latestLock),
          status:
            latestLock.staff_profile_id === staffProfile.id
              ? "acquired"
              : "blocked",
        });
      }

      throw insertError;
    }

    await tryRecordAuditEvent(serviceClient, staffProfile, user, {
      action: "booking-lock.acquire",
      afterValues: pickAuditFields(newLock as Record<string, unknown>, [
        "booking_reference",
        "staff_name",
        "staff_role",
        "started_at",
      ]),
      changedFields: ["staff_name", "staff_role", "started_at"],
      entityId: booking.id,
      entityReference: booking.booking_reference,
      entityType: "booking-lock",
      outcome: "success",
      request,
      sourceArea: "Bookings",
    });

    return Response.json({
      lock: toClientLock(newLock as BookingEditLockRow),
      status: "acquired",
    });
  }

  if (action === "heartbeat") {
    const lockId = body.lockId?.trim();

    if (!lockId) {
      return Response.json({ error: "Lock ID is required." }, { status: 400 });
    }

    const { data: updatedLock, error: updateError } = await serviceClient
      .from("booking_edit_locks")
      .update({
        last_activity_at: now,
        session_id: body.sessionId?.trim() || undefined,
        updated_at: now,
      })
      .eq("id", lockId)
      .eq("staff_profile_id", staffProfile.id)
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
      lock: toClientLock(updatedLock as BookingEditLockRow),
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
      .from("booking_edit_locks")
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
        action: "booking-lock.release",
        afterValues: pickAuditFields(releasedLock as Record<string, unknown>, [
          "release_reason",
          "released_at",
        ]),
        changedFields: ["released_at", "release_reason"],
        entityId: (releasedLock as BookingEditLockRow).booking_id,
        entityReference: (releasedLock as BookingEditLockRow).booking_reference,
        entityType: "booking-lock",
        outcome: "success",
        reason: body.reason?.trim() || "released",
        request,
        sourceArea: "Bookings",
      });
    }

    return Response.json({ released: true });
  }

  if (action === "request-takeover") {
    const lockId = body.lockId?.trim();

    if (!lockId) {
      return Response.json({ error: "Lock ID is required." }, { status: 400 });
    }

    const existingLock = await serviceClient
      .from("booking_edit_locks")
      .select("*")
      .eq("id", lockId)
      .is("released_at", null)
      .maybeSingle();

    if (existingLock.error) {
      throw existingLock.error;
    }

    const activeLock = existingLock.data as BookingEditLockRow | null;

    if (!activeLock) {
      return Response.json({ status: "missing" });
    }

    if (activeLock.staff_profile_id === staffProfile.id) {
      return Response.json(
        { error: "You already own this booking edit lock." },
        { status: 409 },
      );
    }

    if (activeLock.takeover_requested_by === staffProfile.id) {
      return Response.json({
        lock: toClientLock(activeLock),
        status: "blocked",
      });
    }

    const { data: updatedLock, error: updateError } = await serviceClient
      .from("booking_edit_locks")
      .update({
        takeover_requested_at: now,
        takeover_requested_by: staffProfile.id,
        takeover_requested_by_name: staffProfile.full_name || staffProfile.email,
        updated_at: now,
      })
      .eq("id", lockId)
      .is("released_at", null)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (updatedLock) {
      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "booking-lock.takeover-requested",
        afterValues: pickAuditFields(updatedLock as Record<string, unknown>, [
          "takeover_requested_at",
          "takeover_requested_by_name",
        ]),
        changedFields: ["takeover_requested_at", "takeover_requested_by_name"],
        entityId: (updatedLock as BookingEditLockRow).booking_id,
        entityReference: (updatedLock as BookingEditLockRow).booking_reference,
        entityType: "booking-lock",
        outcome: "success",
        request,
        sourceArea: "Bookings",
      });
    }

    return Response.json({
      lock: updatedLock ? toClientLock(updatedLock as BookingEditLockRow) : undefined,
      status: "blocked",
    });
  }

  if (action === "accept-takeover" || action === "decline-takeover") {
    const lockId = body.lockId?.trim();

    if (!lockId) {
      return Response.json({ error: "Lock ID is required." }, { status: 400 });
    }

    const { data: activeLock, error: loadError } = await serviceClient
      .from("booking_edit_locks")
      .select("*")
      .eq("id", lockId)
      .is("released_at", null)
      .maybeSingle();

    if (loadError) {
      throw loadError;
    }

    const lock = activeLock as BookingEditLockRow | null;

    if (!lock) {
      return Response.json({ status: "missing" });
    }

    if (lock.staff_profile_id !== staffProfile.id) {
      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action:
          action === "accept-takeover"
            ? "booking-lock.takeover-accept"
            : "booking-lock.takeover-decline",
        beforeValues: pickAuditFields(lock, [
          "booking_reference",
          "staff_name",
          "staff_role",
          "takeover_requested_by_name",
        ]),
        entityId: lock.booking_id,
        entityReference: lock.booking_reference,
        entityType: "booking-lock",
        outcome: "blocked",
        reason: "Only the current lock owner may resolve takeover requests.",
        request,
        sourceArea: "Bookings",
      });

      return Response.json(
        { error: "Only the current editor can resolve this takeover request." },
        { status: 403 },
      );
    }

    if (!lock.takeover_requested_by) {
      return Response.json(
        { error: "No pending takeover request exists for this lock." },
        { status: 409 },
      );
    }

    if (lock.takeover_requested_by === staffProfile.id) {
      return Response.json(
        { error: "You cannot approve your own takeover request." },
        { status: 403 },
      );
    }

    if (action === "decline-takeover") {
      const { data: declinedLock, error: declineError } = await serviceClient
        .from("booking_edit_locks")
        .update({
          takeover_requested_at: null,
          takeover_requested_by: null,
          takeover_requested_by_name: null,
          updated_at: now,
        })
        .eq("id", lock.id)
        .eq("staff_profile_id", staffProfile.id)
        .is("released_at", null)
        .select("*")
        .maybeSingle();

      if (declineError) {
        throw declineError;
      }

      await tryRecordAuditEvent(serviceClient, staffProfile, user, {
        action: "booking-lock.takeover-decline",
        beforeValues: pickAuditFields(lock, [
          "booking_reference",
          "staff_name",
          "staff_role",
          "takeover_requested_by_name",
        ]),
        changedFields: [
          "takeover_requested_at",
          "takeover_requested_by",
          "takeover_requested_by_name",
        ],
        entityId: lock.booking_id,
        entityReference: lock.booking_reference,
        entityType: "booking-lock",
        outcome: "success",
        request,
        sourceArea: "Bookings",
      });

      return Response.json({
        lock: declinedLock
          ? toClientLock(declinedLock as BookingEditLockRow)
          : undefined,
        status: "declined",
      });
    }

    const { data: requesterProfile, error: requesterError } =
      await serviceClient
        .from("staff_profiles")
        .select("id,user_id,full_name,email,role_id,active,roles(name)")
        .eq("id", lock.takeover_requested_by)
        .maybeSingle();

    if (requesterError) {
      throw requesterError;
    }

    const requester = requesterProfile as StaffProfileWithRoleRow | null;

    if (!requester?.active) {
      return Response.json(
        { error: "The requesting staff profile is no longer active." },
        { status: 409 },
      );
    }

    const requesterRole = getStaffRoleFromRow(requester);
    const requesterRoleLabel = requesterRole
      .split("-")
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ");

    const { data: acceptedLock, error: acceptError } = await serviceClient
      .from("booking_edit_locks")
      .update({
        last_activity_at: now,
        session_id: `takeover-${lock.id}-${now}`,
        staff_name: requester.full_name || requester.email,
        staff_profile_id: requester.id,
        staff_role: requesterRoleLabel,
        staff_user_id: requester.user_id,
        takeover_requested_at: null,
        takeover_requested_by: null,
        takeover_requested_by_name: null,
        updated_at: now,
      })
      .eq("id", lock.id)
      .eq("staff_profile_id", staffProfile.id)
      .is("released_at", null)
      .select("*")
      .maybeSingle();

    if (acceptError) {
      throw acceptError;
    }

    await tryRecordAuditEvent(serviceClient, staffProfile, user, {
      action: "booking-lock.takeover-accept",
      afterValues: pickAuditFields(acceptedLock as Record<string, unknown>, [
        "booking_reference",
        "staff_name",
        "staff_role",
      ]),
      beforeValues: pickAuditFields(lock, [
        "booking_reference",
        "staff_name",
        "staff_role",
        "takeover_requested_by_name",
      ]),
      changedFields: [
        "staff_name",
        "staff_role",
        "staff_profile_id",
        "staff_user_id",
        "takeover_requested_at",
        "takeover_requested_by",
        "takeover_requested_by_name",
      ],
      entityId: lock.booking_id,
      entityReference: lock.booking_reference,
      entityType: "booking-lock",
      outcome: "success",
      request,
      sourceArea: "Bookings",
    });

    return Response.json({
      lock: acceptedLock
        ? toClientLock(acceptedLock as BookingEditLockRow)
        : undefined,
      status: "accepted",
    });
  }

  return Response.json({ error: "Unsupported lock action." }, { status: 400 });
}
