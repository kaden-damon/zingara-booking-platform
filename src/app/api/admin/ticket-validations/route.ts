import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  const { data, error } = await auth.serviceClient
    .from("ticket_validations")
    .select("id,ticket_id,booking_id,result,device_label,notes,validated_at")
    .order("validated_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load ticket validations", error);

    return Response.json(
      { error: "Ticket validations could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
