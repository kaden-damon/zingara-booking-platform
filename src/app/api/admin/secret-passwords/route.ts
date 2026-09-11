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

export const dynamic = "force-dynamic";

const scheduleSelect =
  "id,venue_location,scope_type,show_id,start_date,end_date,start_time,end_time,phrase,enabled,created_at,updated_at";

type ScheduleBody = {
  enabled?: boolean;
  endDate?: string;
  endTime?: string | null;
  id?: string;
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
    const validation = validateBody(body);
    if (validation) return Response.json({ error: validation }, { status: 400 });
    if (body.endDate! < todayInJohannesburg()) {
      return Response.json({ error: "Historical Secret Password schedules cannot be changed." }, { status: 409 });
    }
    const show = body.showId ? await loadShow(auth.serviceClient, body.showId) : null;
    if (body.showId && normalizeShowLocation(show?.venue) !== body.venueLocation) {
      return Response.json({ error: "The selected performance does not belong to this venue." }, { status: 400 });
    }

    const payload = {
      enabled: body.enabled ?? true,
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
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SECRET_PASSWORD_SCHEDULE_OVERLAP") || message.includes("venue_secret_password_one_show_override")) {
      return Response.json({ error: "This venue already has an overlapping active password schedule. Edit or disable it first." }, { status: 409 });
    }
    console.error("[Zingara Secret Password] Save failed", error);
    return Response.json({ error: "Secret Password schedule could not be saved." }, { status: 500 });
  }
}

export function POST(request: Request) { return saveSchedule(request, "POST"); }
export function PATCH(request: Request) { return saveSchedule(request, "PATCH"); }

export async function DELETE(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!isSuperAdminProfile(auth.staffProfile)) return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Schedule ID is required." }, { status: 400 });
    const { data: before, error: loadError } = await auth.serviceClient.from("venue_secret_password_schedules").select(scheduleSelect).eq("id", id).maybeSingle();
    if (loadError) throw loadError;
    if (!before) return Response.json({ error: "Schedule not found." }, { status: 404 });
    const today = todayInJohannesburg();
    if (String(before.start_date) <= today) return Response.json({ error: "Current or historical schedules must be disabled, not deleted." }, { status: 409 });
    const { error } = await auth.serviceClient.from("venue_secret_password_schedules").delete().eq("id", id);
    if (error) throw error;
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "Future Secret Password schedule deleted",
      beforeValues: { phrase: String(before.phrase), scope: String(before.scope_type), startDate: String(before.start_date), endDate: String(before.end_date), enabled: Boolean(before.enabled) },
      entityId: id,
      entityLocation: String(before.venue_location),
      entityReference: id,
      entityType: "show",
      outcome: "success",
      request,
      sourceArea: "venue-secret-passwords",
    });
    await notifySecretPasswordWalletUpdates({
      client: auth.serviceClient,
      endDate: String(before.end_date),
      showId: before.show_id ? String(before.show_id) : null,
      startDate: String(before.start_date),
      venueLocation: String(before.venue_location) as EntryLocationKey,
    });
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("[Zingara Secret Password] Delete failed", error);
    return Response.json({ error: "Secret Password schedule could not be deleted." }, { status: 500 });
  }
}
