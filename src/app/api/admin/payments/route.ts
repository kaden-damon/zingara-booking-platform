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
    .from("payments")
    .select("id,booking_id,payment_type,payment_status,amount,method,reference,notes,processed_at,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load payments", error);

    return Response.json(
      { error: "Payments could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
