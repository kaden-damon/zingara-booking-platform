import { sendTrainingAcknowledgementEmail } from "@/lib/email/staffTrainingEmail";
import {
  canManageStaffTraining,
  normalizeCompetencies,
  trainingPageSize,
  trainingRecordReference,
} from "@/lib/staffTraining";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

type TrainingRow = {
  acknowledgement_at: string | null;
  acknowledgement_choice: "further_training" | "understood" | null;
  competencies: string[];
  corrects_record_id: string | null;
  correction_reason: string | null;
  created_at: string;
  demonstrated_independently: boolean;
  description: string;
  duration_minutes: number;
  id: string;
  staff_profile_id: string;
  start_time: string;
  status: string;
  title: string;
  trainer_staff_profile_id: string;
  training_date: string;
};

const recordSelect = "id,staff_profile_id,trainer_staff_profile_id,title,training_date,start_time,duration_minutes,description,competencies,demonstrated_independently,acknowledgement_choice,acknowledgement_at,status,corrects_record_id,correction_reason,created_at";

function getRole(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getAdminRoleFromName(role?.name);
}

function venueIntersects(left: string[], right: string[]) {
  const a = normalizeStaffVenueScope(left);
  const b = normalizeStaffVenueScope(right);
  return a.includes("all") || b.includes("all") || a.some((value) => b.includes(value));
}

async function loadVisibleStaff(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const { data, error } = await auth.serviceClient!
    .from("staff_profiles")
    .select("id,full_name,email,active,venue_scope")
    .eq("active", true)
    .order("full_name");
  if (error) throw error;
  const manager = canManageStaffTraining(getRole(auth.staffProfile!));
  return (data ?? []).filter((profile) =>
    manager
      ? venueIntersects(auth.staffProfile!.venue_scope, profile.venue_scope ?? [])
      : profile.id === auth.staffProfile!.id,
  );
}

function serialize(row: TrainingRow, staffById: Map<string, { full_name: string; email: string }>) {
  return {
    acknowledgementAt: row.acknowledgement_at,
    acknowledgementChoice: row.acknowledgement_choice,
    competencies: row.competencies ?? [],
    correctsRecordId: row.corrects_record_id,
    correctionReason: row.correction_reason,
    createdAt: row.created_at,
    demonstratedIndependently: row.demonstrated_independently,
    description: row.description,
    durationMinutes: row.duration_minutes,
    id: row.id,
    staffEmail: staffById.get(row.staff_profile_id)?.email ?? "",
    staffId: row.staff_profile_id,
    staffName: staffById.get(row.staff_profile_id)?.full_name ?? "Staff member",
    startTime: row.start_time,
    status: row.status,
    title: row.title,
    trainerId: row.trainer_staff_profile_id,
    trainerName: staffById.get(row.trainer_staff_profile_id)?.full_name ?? "Trainer",
    trainingDate: row.training_date,
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "list";
    if (mode === "pending") {
      const { data, error } = await auth.serviceClient
        .from("staff_training_records")
        .select(recordSelect)
        .eq("staff_profile_id", auth.staffProfile.id)
        .eq("status", "awaiting_confirmation")
        .order("created_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      const trainerIds = Array.from(new Set((data ?? []).map((row) => row.trainer_staff_profile_id)));
      const { data: trainers, error: trainerError } = trainerIds.length
        ? await auth.serviceClient.from("staff_profiles").select("id,full_name,email").in("id", trainerIds)
        : { data: [], error: null };
      if (trainerError) throw trainerError;
      const staffById = new Map<string, { email: string; full_name: string }>();
      staffById.set(auth.staffProfile.id, {
        email: auth.staffProfile.email,
        full_name: auth.staffProfile.full_name,
      });
      for (const profile of trainers ?? []) {
        staffById.set(profile.id, profile);
      }
      return Response.json({ records: (data ?? []).map((row) => serialize(row as TrainingRow, staffById)) });
    }
    const staff = await loadVisibleStaff(auth);
    const staffIds = staff.map((profile) => profile.id);
    const staffById = new Map(staff.map((profile) => [profile.id, profile]));
    const recordId = url.searchParams.get("id")?.trim();

    if (recordId) {
      const { data, error } = await auth.serviceClient
        .from("staff_training_records")
        .select(recordSelect)
        .eq("id", recordId)
        .in("staff_profile_id", staffIds)
        .maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "Training record not found." }, { status: 404 });
      const { data: events, error: eventError } = await auth.serviceClient
        .from("staff_training_events")
        .select("id,action,actor_staff_profile_id,details,created_at")
        .eq("training_record_id", recordId)
        .order("created_at", { ascending: true });
      if (eventError) throw eventError;
      return Response.json({
        events: (events ?? []).map((event) => ({
          action: event.action,
          actorName: staffById.get(event.actor_staff_profile_id)?.full_name ?? "Staff",
          createdAt: event.created_at,
          details: event.details,
          id: event.id,
        })),
        record: serialize(data as TrainingRow, staffById),
      });
    }

    let query = auth.serviceClient
      .from("staff_training_records")
      .select(recordSelect, { count: "exact" })
      .in("staff_profile_id", staffIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    {
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? trainingPageSize)));
      const status = url.searchParams.get("status")?.trim();
      const staffId = url.searchParams.get("staffId")?.trim();
      const search = url.searchParams.get("search")?.trim().replace(/[%(),]/g, "");
      if (status) query = query.eq("status", status);
      if (staffId && staffIds.includes(staffId)) query = query.eq("staff_profile_id", staffId);
      if (search) {
        const matchingStaffIds = staff
          .filter((profile) =>
            `${profile.full_name} ${profile.email}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((profile) => profile.id);
        const staffClause = matchingStaffIds.length
          ? `,staff_profile_id.in.(${matchingStaffIds.join(",")})`
          : "";
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%${staffClause}`);
      }
      query = query.range((page - 1) * pageSize, page * pageSize - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const statusKeys = [
      "awaiting_confirmation",
      "confirmed_understanding",
      "further_training_required",
      "proficiency_verified",
    ] as const;
    const statusCounts = await Promise.all(
      statusKeys.map((key) =>
        auth.serviceClient!
          .from("staff_training_records")
          .select("id", { count: "exact", head: true })
          .in("staff_profile_id", staffIds)
          .eq("status", key),
      ),
    );
    const summary = Object.fromEntries(
      statusKeys.map((key, index) => [key, statusCounts[index].count ?? 0]),
    );

    return Response.json({
      canManage: canManageStaffTraining(getRole(auth.staffProfile)),
      pageSize: trainingPageSize,
      records: (data ?? []).map((row) => serialize(row as TrainingRow, staffById)),
      staffOptions: staff.map((profile) => ({ id: profile.id, name: profile.full_name })),
      summary,
      total: count ?? 0,
    });
  } catch (error) {
    console.error("[Zingara Training] Load failed", error);
    return Response.json({ error: "Training records couldn't be loaded. Try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManageStaffTraining(getRole(auth.staffProfile))) {
    return Response.json({ error: "Training management access is required." }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const staff = await loadVisibleStaff(auth);
    const staffId = String(body.staffId ?? "");
    if (!staff.some((profile) => profile.id === staffId)) {
      return Response.json({ error: "Select an authorised staff member." }, { status: 400 });
    }
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const trainingDate = String(body.trainingDate ?? "");
    const startTime = String(body.startTime ?? "");
    const durationMinutes = Number(body.durationMinutes);
    if (title.length < 3 || description.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(trainingDate) || !/^\d{2}:\d{2}$/.test(startTime) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      return Response.json({ error: "Complete the training topic, date, time, duration and description." }, { status: 400 });
    }
    const { data, error } = await auth.serviceClient.rpc("create_staff_training_record", {
      p_competencies: normalizeCompetencies(body.competencies),
      p_correction_reason: body.correctionReason ? String(body.correctionReason) : null,
      p_corrects_record_id: body.correctsRecordId ? String(body.correctsRecordId) : null,
      p_demonstrated_independently: body.demonstratedIndependently === true,
      p_description: description,
      p_duration_minutes: durationMinutes,
      p_staff_profile_id: staffId,
      p_start_time: startTime,
      p_title: title,
      p_trainer_staff_profile_id: auth.staffProfile.id,
      p_training_date: trainingDate,
    });
    if (error) throw error;
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: body.correctsRecordId ? "training-record-corrected" : "training-record-created",
      afterValues: { demonstratedIndependently: body.demonstratedIndependently === true, durationMinutes, staffId, title },
      entityId: data.id,
      entityReference: trainingRecordReference(data.id),
      entityType: "staff",
      outcome: "success",
      request,
      sourceArea: "academy-training-register",
    });
    return Response.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error("[Zingara Training] Create failed", error);
    return Response.json({ error: "Training record couldn't be saved. Try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  try {
    const body = await request.json() as { choice?: string; recordId?: string };
    if (!body.recordId || !["understood", "further_training"].includes(body.choice ?? "")) {
      return Response.json({ error: "Choose a training response." }, { status: 400 });
    }
    const { data, error } = await auth.serviceClient.rpc("acknowledge_staff_training", {
      p_choice: body.choice,
      p_record_id: body.recordId,
      p_staff_profile_id: auth.staffProfile.id,
    });
    if (error) {
      const status = error.message.includes("Only the trained") ? 403 : 409;
      return Response.json({ error: status === 403 ? "Only the trained staff member can confirm this record." : "This training record changed. Refresh and try again." }, { status });
    }
    const trainer = await auth.serviceClient.from("staff_profiles").select("full_name").eq("id", data.trainer_staff_profile_id).single();
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: body.choice === "understood" ? "training-understanding-confirmed" : "training-further-support-requested",
      afterValues: { acknowledgementChoice: body.choice ?? null, status: data.status },
      entityId: data.id,
      entityReference: trainingRecordReference(data.id),
      entityType: "staff",
      outcome: "success",
      request,
      sourceArea: "academy-training-register",
    });
    let emailStatus = "sent";
    try {
      const email = await sendTrainingAcknowledgementEmail(auth.serviceClient, {
        acknowledgementLabel: body.choice === "understood" ? "I understand and confirm" : "I need further training",
        acknowledgementTimestamp: data.acknowledgement_at,
        competencies: data.competencies ?? [],
        demonstratedIndependently: data.demonstrated_independently,
        durationMinutes: data.duration_minutes,
        recordId: data.id,
        staffEmail: auth.staffProfile.email,
        staffName: auth.staffProfile.full_name,
        title: data.title,
        trainerName: trainer.data?.full_name ?? "Zingara trainer",
        trainingDate: data.training_date,
        trainingTime: data.start_time,
      });
      if (!email.ok) emailStatus = "failed";
    } catch (emailError) {
      emailStatus = "failed";
      console.error("[Zingara Training] Confirmation email failed", emailError);
    }
    return Response.json({ emailStatus, status: data.status });
  } catch (error) {
    console.error("[Zingara Training] Acknowledgement failed", error);
    return Response.json({ error: "Training response couldn't be saved. Try again." }, { status: 500 });
  }
}
