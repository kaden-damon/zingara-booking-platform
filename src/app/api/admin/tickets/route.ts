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
    .from("tickets")
    .select("id,booking_id,ticket_code,ticket_url,qr_payload,ticket_status,issued_at,updated_at")
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load tickets", error);

    return Response.json(
      { error: "Tickets could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
