import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
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
