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
    .from("booking_lifecycle_events")
    .select("id,booking_id,from_status,to_status,note,reason,changed_by,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load lifecycle events", error);

    return Response.json(
      { error: "Lifecycle events could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
