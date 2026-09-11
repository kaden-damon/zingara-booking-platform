import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  resolveServerSecretPassword,
  notifySecretPasswordWalletUpdates,
  toSecretPasswordSchedule,
  type SecretPasswordScope,
} from "@/lib/secretPassword";
import {
  defaultVenueSettings,
  normalizeShowLocation,
  normalizeVenueSettings,
  type DemoVenueSettings,
  type EntryLocationKey,
} from "@/lib/zingaraDemo";
import {
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";
import { getSecretPasswordLifecycleStatus } from "@/lib/secretPasswordLifecycle";

export const dynamic = "force-dynamic";

const scheduleSelect =
  "id,venue_location,scope_type,show_id,start_date,end_date,start_time,end_time,phrase,enabled,created_at,updated_at";

type ScheduleBody = {
  enabled?: boolean;
  endDate?: string;
  endTime?: string | null;
  id?: string;
  lifecycleAction?: "disable" | "enable";
  phrase?: string;
  scopeType?: SecretPasswordScope;
  showId?: string | null;
  startDate?: string;
  startTime?: string | null;
  venueLocation?: EntryLocationKey;
};

function canAccessVenue(scope: string[], venue: EntryLocationKey) {
  const normalized = normalizeStaffVenueScope(scope);
  return normalized.includes("all") || normalized.includes(venue);
}

function isDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isTime(value: string | null | undefined) {
  return value == null || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function todayInJohannesburg() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date());
}

function validateBody(body: ScheduleBody) {
  const phrase = body.phrase?.trim() ?? "";
  if (!body.venueLocation || !["cape-town", "johannesburg"].includes(body.venueLocation)) {
    return "Select a valid venue.";
  }
  if (!body.scopeType || !["show", "date", "range"].includes(body.scopeType)) {
    return "Select a valid schedule type.";
  }
  if (phrase.length < 2 || phrase.length > 80 || /[\u0000-\u001f\u007f]/.test(phrase)) {
    return "Enter a password phrase between 2 and 80 printable characters.";
  }
  if (!isDate(body.startDate) || !isDate(body.endDate) || body.endDate! < body.startDate!) {
    return "Enter a valid schedule date or date range.";
  }
  if (!isTime(body.startTime) || !isTime(body.endTime) || Boolean(body.startTime) !== Boolean(body.endTime)) {
    return "Enter both an effective start and end time, or leave both blank.";
  }
  if (body.startTime && body.endTime && body.endTime <= body.startTime) {
    return "Effective end time must be after the start time.";
  }
  if (body.scopeType === "show" && !body.showId) return "Select a performance.";
  if (body.scopeType !== "show" && body.showId) return "Only performance overrides may reference a show.";
  if (body.scopeType === "date" && body.startDate !== body.endDate) return "A daily schedule must use one date.";
  return null;
}

async function loadSettings(client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>) {
  const { data, error } = await client
    .from("venue_settings")
    .select("settings")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return normalizeVenueSettings((data?.settings as DemoVenueSettings | null) ?? defaultVenueSettings);
}

async function loadShow(client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>, showId: string) {
  const { data, error } = await client
    .from("shows")
    .select("id,date,time,venue")
    .eq("id", showId)
    .maybeSingle();
  if (error) throw error;
  return data as { date: string; id: string; time: string; venue: string | null } | null;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;

  try {
    const url = new URL(request.url);
    const showId = url.searchParams.get("showId");
    if (showId) {
      const show = await loadShow(auth.serviceClient, showId);
      const venue = normalizeShowLocation(show?.venue) as EntryLocationKey | null;
      if (!show || !venue) return Response.json({ error: "Performance not found." }, { status: 404 });
      if (!canAccessVenue(auth.staffProfile.venue_scope ?? [], venue)) {
        return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
      }
      const settings = await loadSettings(auth.serviceClient);
      const resolved = await resolveServerSecretPassword({
        client: auth.serviceClient,
        settings,
        show,
        venueLocation: venue,
      });
      return Response.json({ enabled: settings.operationalSettings.secretPasswordExperience[venue].enabled, resolved });
    }

    const { data, error } = await auth.serviceClient
      .from("venue_secret_password_schedules")
      .select(scheduleSelect)
      .gte("end_date", todayInJohannesburg())
      .order("start_date", { ascending: true })
      .limit(250);
    if (error) throw error;
    const schedules = (data ?? [])
      .map((row) => toSecretPasswordSchedule(row as Parameters<typeof toSecretPasswordSchedule>[0]))
      .filter((row) => canAccessVenue(auth.staffProfile!.venue_scope ?? [], row.venueLocation));
    return Response.json({ canEdit: isSuperAdminProfile(auth.staffProfile), schedules });
  } catch (error) {
    console.error("[Zingara Secret Password] Load failed", error);
    return Response.json({ error: "Secret Password schedules could not be loaded." }, { status: 500 });
  }
}

async function saveSchedule(request: Request, method: "POST" | "PATCH") {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as ScheduleBody;
    if (method === "PATCH" && body.lifecycleAction) {
      if (!body.id) return Response.json({ error: "Schedule ID is required." }, { status: 400 });
      const { data: before, error: loadError } = await auth.serviceClient
        .from("venue_secret_password_schedules")
        .select(scheduleSelect)
        .eq("id", body.id)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!before) return Response.json({ error: "Schedule not found." }, { status: 404 });

      const existing = toSecretPasswordSchedule(before as Parameters<typeof toSecretPasswordSchedule>[0]);
      if (!canAccessVenue(auth.staffProfile.venue_scope ?? [], existing.venueLocation)) {
        return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
      }
      const previousState = getSecretPasswordLifecycleStatus(existing);
      if (previousState === "expired") {
        return Response.json({ error: "Expired Secret Password schedules are historical and cannot be reactivated. Create a new future schedule instead." }, { status: 409 });
      }
      const enabled = body.lifecycleAction === "enable";
      if (existing.enabled === enabled) return Response.json({ schedule: existing });

      const { data, error } = await auth.serviceClient
        .from("venue_secret_password_schedules")
        .update({ enabled })
        .eq("id", body.id)
        .eq("enabled", existing.enabled)
        .select(scheduleSelect)
        .maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "This schedule changed while you were editing it. Refresh and try again." }, { status: 409 });

      const updated = toSecretPasswordSchedule(data as Parameters<typeof toSecretPasswordSchedule>[0]);
      const newState = getSecretPasswordLifecycleStatus(updated);
      await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: enabled ? "Secret Password schedule enabled" : "Secret Password schedule disabled",
        afterValues: { enabled, lifecycleState: newState },
        beforeValues: { enabled: existing.enabled, lifecycleState: previousState },
        entityId: existing.id,
        entityLocation: existing.venueLocation,
        entityReference: existing.id,
        entityType: "show",
        outcome: "success",
        request,
        sourceArea: "venue-secret-passwords",
      });
      await notifySecretPasswordWalletUpdates({
        client: auth.serviceClient,
        endDate: existing.endDate,
        showId: existing.showId,
        startDate: existing.startDate,
        venueLocation: existing.venueLocation,
      });
      return Response.json({ schedule: updated });
    }

    const validation = validateBody(body);
    if (validation) return Response.json({ error: validation }, { status: 400 });
    if (!canAccessVenue(auth.staffProfile.venue_scope ?? [], body.venueLocation!)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    if (body.endDate! < todayInJohannesburg()) {
      return Response.json({ error: "Historical Secret Password schedules cannot be changed." }, { status: 409 });
    }
    const show = body.showId ? await loadShow(auth.serviceClient, body.showId) : null;
    if (body.showId && normalizeShowLocation(show?.venue) !== body.venueLocation) {
      return Response.json({ error: "The selected performance does not belong to this venue." }, { status: 400 });
    }

    const payload = {
      enabled: true,
      end_date: body.endDate,
      end_time: body.endTime || null,
      phrase: body.phrase!.trim(),
      scope_type: body.scopeType!,
      show_id: body.scopeType === "show" ? body.showId : null,
      start_date: body.startDate,
      start_time: body.startTime || null,
      venue_location: body.venueLocation,
    };
    let before: Record<string, unknown> | null = null;
    if (method === "PATCH") {
      if (!body.id) return Response.json({ error: "Schedule ID is required." }, { status: 400 });
      const result = await auth.serviceClient.from("venue_secret_password_schedules").select(scheduleSelect).eq("id", body.id).maybeSingle();
      if (result.error) throw result.error;
      before = result.data;
      if (!before) return Response.json({ error: "Schedule not found." }, { status: 404 });
      const existing = toSecretPasswordSchedule(before as Parameters<typeof toSecretPasswordSchedule>[0]);
      if (!canAccessVenue(auth.staffProfile.venue_scope ?? [], existing.venueLocation)) {
        return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
      }
      payload.enabled = existing.enabled;
    }
    const query = method === "POST"
      ? auth.serviceClient.from("venue_secret_password_schedules").insert({ ...payload, created_by_staff_id: auth.staffProfile.id })
      : auth.serviceClient.from("venue_secret_password_schedules").update(payload).eq("id", body.id!);
    const { data, error } = await query.select(scheduleSelect).single();
    if (error) throw error;
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: method === "POST" ? "Secret Password schedule created" : (payload.enabled ? "Secret Password schedule updated" : "Secret Password schedule disabled"),
      afterValues: { phrase: payload.phrase, scope: payload.scope_type, startDate: payload.start_date!, endDate: payload.end_date!, enabled: payload.enabled },
      beforeValues: before ? { phrase: String(before.phrase ?? ""), scope: String(before.scope_type ?? ""), startDate: String(before.start_date ?? ""), endDate: String(before.end_date ?? ""), enabled: Boolean(before.enabled) } : {},
      entityId: data.id,
      entityLocation: payload.venue_location,
      entityReference: data.id,
      entityType: "show",
      outcome: "success",
      request,
      sourceArea: "venue-secret-passwords",
    });
    await notifySecretPasswordWalletUpdates({
      client: auth.serviceClient,
      endDate: payload.end_date!,
      showId: payload.show_id,
      startDate: payload.start_date!,
      venueLocation: payload.venue_location!,
    });
    return Response.json({ schedule: toSecretPasswordSchedule(data as Parameters<typeof toSecretPasswordSchedule>[0]) });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
    if (message.includes("SECRET_PASSWORD_SCHEDULE_OVERLAP") || message.includes("venue_secret_password_one_show_override")) {
      return Response.json({ error: "This venue already has an overlapping active password schedule. Edit or disable it first." }, { status: 409 });
    }
    console.error("[Zingara Secret Password] Save failed", error);
    return Response.json({ error: "Secret Password schedule could not be saved." }, { status: 500 });
  }
}

export function POST(request: Request) { return saveSchedule(request, "POST"); }
export function PATCH(request: Request) { return saveSchedule(request, "PATCH"); }
