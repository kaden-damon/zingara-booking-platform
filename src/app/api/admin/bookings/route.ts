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

  const rows = data ?? [];
  const bookingIds = rows
    .map((booking) => booking.id)
    .filter((id): id is string => Boolean(id));

  if (bookingIds.length === 0) {
    return Response.json({ rows });
  }

  const [
    { data: communications, error: communicationsError },
    { data: lifecycleEvents, error: lifecycleError },
  ] = await Promise.all([
    serviceClient
      .from("communications")
      .select(
        "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
      )
      .in("booking_id", bookingIds)
      .order("sent_at", { ascending: false }),
    serviceClient
      .from("booking_lifecycle_events")
      .select("id,booking_id,from_status,to_status,note,reason,changed_by,created_at")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false }),
  ]);

  if (communicationsError) {
    console.error(
      "[Zingara API] Failed to load booking communications aggregate",
      communicationsError,
    );
  }

  if (lifecycleError) {
    console.error(
      "[Zingara API] Failed to load booking lifecycle aggregate",
      lifecycleError,
    );
  }

  const communicationsByBookingId = new Map<string, unknown[]>();

  for (const communication of communications ?? []) {
    if (!communication.booking_id) {
      continue;
    }

    communicationsByBookingId.set(communication.booking_id, [
      ...(communicationsByBookingId.get(communication.booking_id) ?? []),
      communication,
    ]);
  }

  const lifecycleByBookingId = new Map<string, unknown[]>();

  for (const lifecycleEvent of lifecycleEvents ?? []) {
    if (!lifecycleEvent.booking_id) {
      continue;
    }

    lifecycleByBookingId.set(lifecycleEvent.booking_id, [
      ...(lifecycleByBookingId.get(lifecycleEvent.booking_id) ?? []),
      lifecycleEvent,
    ]);
  }

  return Response.json({
    rows: rows.map((booking) => ({
      ...booking,
      communication_rows: communicationsByBookingId.get(booking.id) ?? [],
      lifecycle_event_rows: lifecycleByBookingId.get(booking.id) ?? [],
    })),
  });
}

function getRouteClient() {
  return getServiceClient();
}

async function runBookingTransaction(request: Request) {
  const response = await fetch(new URL("/api/bookings", request.url), {
    body: JSON.stringify(await request.json()),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  return Response.json(payload, { status: response.status });
}

export async function POST(request: Request) {
  return runBookingTransaction(request);
}

export async function PATCH(request: Request) {
  return runBookingTransaction(request);
}

export async function DELETE(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    reference?: string;
  };
  const reference = body.reference ?? url.searchParams.get("reference");

  if (!reference) {
    return Response.json(
      { error: "Booking reference is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("booking_reference", reference);

  if (error) {
    console.error("[Zingara API] Failed to delete booking", error);

    return Response.json(
      { error: "Booking could not be deleted." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
