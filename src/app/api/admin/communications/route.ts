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
    .from("communications")
    .select(
      "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
    )
    .order("sent_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load communications", error);

    return Response.json(
      { error: "Communications could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
