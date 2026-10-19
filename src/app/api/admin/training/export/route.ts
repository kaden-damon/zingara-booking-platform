import ExcelJS from "exceljs";
import { canManageStaffTraining, trainingStatusLabels } from "@/lib/staffTraining";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getAdminRoleFromName, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getAdminRoleFromName(role?.name);
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManageStaffTraining(roleOf(auth.staffProfile))) {
    return Response.json({ error: "Training management access is required." }, { status: 403 });
  }

  try {
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
    const { data: staff, error: staffError } = await auth.serviceClient
      .from("staff_profiles")
      .select("id,full_name,email,venue_scope")
      .eq("active", true)
      .order("full_name");
    if (staffError) throw staffError;
    const visible = (staff ?? []).filter((member) => {
      const memberScope = normalizeStaffVenueScope(member.venue_scope ?? []);
      return scope.includes("all") || memberScope.includes("all") || scope.some((value) => memberScope.includes(value));
    });
    const byId = new Map(visible.map((member) => [member.id, member]));
    const { data: records, error } = await auth.serviceClient
      .from("staff_training_records")
      .select("id,staff_profile_id,trainer_staff_profile_id,title,training_date,start_time,duration_minutes,description,competencies,demonstrated_independently,status,acknowledgement_at,created_at")
      .in("staff_profile_id", visible.map((member) => member.id))
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Zingara";
    const sheet = workbook.addWorksheet("Training Register", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Staff Member", key: "staff", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Training Topic", key: "title", width: 32 },
      { header: "Training Date", key: "date", width: 16 },
      { header: "Start Time", key: "time", width: 14 },
      { header: "Duration (minutes)", key: "duration", width: 19 },
      { header: "Trainer", key: "trainer", width: 24 },
      { header: "Status", key: "status", width: 28 },
      { header: "Demonstrated Independently", key: "demonstrated", width: 27 },
      { header: "Competencies", key: "competencies", width: 42 },
      { header: "Description", key: "description", width: 55 },
      { header: "Acknowledged At", key: "acknowledged", width: 23 },
    ];
    for (const record of records ?? []) {
      sheet.addRow({
        acknowledged: record.acknowledgement_at ? new Date(record.acknowledgement_at) : "",
        competencies: (record.competencies ?? []).join("; "),
        date: record.training_date,
        demonstrated: record.demonstrated_independently ? "Yes" : "No",
        description: record.description,
        duration: record.duration_minutes,
        email: byId.get(record.staff_profile_id)?.email ?? "",
        staff: byId.get(record.staff_profile_id)?.full_name ?? "Staff",
        status: trainingStatusLabels[record.status as keyof typeof trainingStatusLabels] ?? record.status,
        time: record.start_time,
        title: record.title,
        trainer: byId.get(record.trainer_staff_profile_id)?.full_name ?? "Trainer",
      });
    }
    sheet.autoFilter = { from: "A1", to: "L1" };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8C36A" } };
      cell.font = { bold: true, color: { argb: "FF090909" } };
    });
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
    });
    const bytes = await workbook.xlsx.writeBuffer();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Disposition": `attachment; filename="Zingara_Staff_Training_Register_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("[Zingara Training] Export failed", error);
    return Response.json({ error: "Training register couldn't be exported." }, { status: 500 });
  }
}
