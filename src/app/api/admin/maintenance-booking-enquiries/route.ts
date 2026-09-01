import { isSuperAdminProfile, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const selectFields =
  "id,reference,full_name,mobile,email,preferred_city,preferred_show_date,pax,seating_preference,notes,status,submitted_at,updated_at";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const { data, error } = await auth.serviceClient
    .from("maintenance_booking_enquiries")
    .select(selectFields)
    .order("submitted_at", { ascending: false })
    .limit(250);

  if (error) {
    console.error("[Zingara Maintenance] Enquiry queue load failed", error);
    return Response.json(
      { error: "Maintenance enquiries could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ enquiries: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
  };

  if (!body.id || !["new", "contacted", "resolved"].includes(body.status ?? "")) {
    return Response.json(
      { error: "A valid enquiry and status are required." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.serviceClient
    .from("maintenance_booking_enquiries")
    .update({
      status: body.status,
      updated_at: new Date().toISOString(),
      updated_by_staff_profile_id: auth.staffProfile.id,
    })
    .eq("id", body.id)
    .select(selectFields)
    .single();

  if (error) {
    console.error("[Zingara Maintenance] Enquiry status update failed", error);
    return Response.json(
      { error: "Maintenance enquiry status could not be updated." },
      { status: 500 },
    );
  }

  return Response.json({ enquiry: data });
}
