import { getServiceClient } from "@/lib/supabase/serverAdmin";
import type {
  BookingLifecycleEvent,
  BookingStatus,
  DemoBooking,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

const bookingSelect =
  "id,customer_id,show_id,table_id,booking_reference,booking_source,company_name,guest_count,booking_status,payment_status,section,service_fee,subtotal_amount,discount_amount,addons_total,total_amount,amount_paid,balance_outstanding,notes,dietary_requirements,created_at,updated_at";
const bookingMetadataPrefix = "__zingara_booking_meta__:";

type SupabaseBookingStatus =
  | "cancelled"
  | "checked_in"
  | "completed"
  | "confirmed"
  | "new"
  | "no_show"
  | "pending_payment"
  | "refunded"
  | "waitlisted";

function toSupabaseBookingStatus(status: BookingStatus): SupabaseBookingStatus {
  if (status === "pending-payment" || status === "pending") {
    return "pending_payment";
  }

  if (status === "checked-in") {
    return "checked_in";
  }

  if (status === "no-show") {
    return "no_show";
  }

  return status;
}

function serializeBookingNotes(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function toLifecyclePayload(event: BookingLifecycleEvent, bookingId: string) {
  return {
    booking_id: bookingId,
    created_at: event.createdAt,
    from_status: event.fromStatus
      ? toSupabaseBookingStatus(event.fromStatus)
      : null,
    note: event.note ?? null,
    reason: event.toStatus === "cancelled" ? event.note ?? null : null,
    to_status: toSupabaseBookingStatus(event.toStatus),
  };
}

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

async function persistBookingCancellation(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
    };
    const booking = body.booking;

    if (!booking?.reference || booking.status !== "cancelled") {
      return Response.json(
        { error: "A cancelled booking payload is required." },
        { status: 400 },
      );
    }

    const { data: bookingRows, error: loadError } = await supabase
      .from("bookings")
      .select("id,payment_status")
      .eq("booking_reference", booking.reference)
      .limit(1);

    if (loadError) {
      throw loadError;
    }

    const existingBooking = bookingRows?.[0] as
      | { id?: string; payment_status?: string }
      | undefined;

    if (!existingBooking?.id) {
      return Response.json(
        { error: "Booking could not be resolved for cancellation." },
        { status: 404 },
      );
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        booking_status: "cancelled",
        notes: serializeBookingNotes(booking),
      })
      .eq("id", existingBooking.id)
      .select(bookingSelect)
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    const latestCancellationEvent = booking.lifecycleHistory?.find(
      (event) => event.toStatus === "cancelled",
    );

    if (latestCancellationEvent) {
      const payload = toLifecyclePayload(
        latestCancellationEvent,
        existingBooking.id,
      );
      const { data: existingEvents, error: eventLoadError } = await supabase
        .from("booking_lifecycle_events")
        .select("id")
        .eq("booking_id", existingBooking.id)
        .eq("created_at", payload.created_at)
        .eq("to_status", payload.to_status)
        .limit(1);

      if (eventLoadError) {
        throw eventLoadError;
      }

      if (!existingEvents?.length) {
        const { error: eventInsertError } = await supabase
          .from("booking_lifecycle_events")
          .insert(payload);

        if (eventInsertError) {
          throw eventInsertError;
        }
      }
    }

    return Response.json({ row: updatedBooking });
  } catch (error) {
    console.error("[Zingara API] Failed to persist booking cancellation", error);

    return Response.json(
      { error: "Booking cancellation could not be saved." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return runBookingTransaction(request);
}

export async function PATCH(request: Request) {
  const body = (await request.clone().json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action === "cancel") {
    return persistBookingCancellation(request);
  }

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
