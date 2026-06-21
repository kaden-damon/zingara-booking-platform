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
    .from("customers")
    .select(
      "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load customers", error);

    return Response.json(
      { error: "Customers could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
