import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const bookingSelect =
  "id,customer_id,show_id,table_id,booking_reference,booking_source,company_name,guest_count,booking_status,payment_status,section,service_fee,subtotal_amount,discount_amount,addons_total,total_amount,amount_paid,balance_outstanding,notes,dietary_requirements,created_at,updated_at";

export async function GET(request: Request) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");
  let query = serviceClient.from("bookings").select(bookingSelect);

  if (reference) {
    query = query.eq("booking_reference", reference);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load bookings", error);

    return Response.json(
      { error: "Bookings could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}
